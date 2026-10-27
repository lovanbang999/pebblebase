package mongodb

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/dop251/goja"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"pebblebase/internal/adapter"
)

const defaultShellTimeout = 10 * time.Second
const defaultCursorLimit = int64(100)

// ExecuteShell executes an interactive Mongo Shell JavaScript script in a sandboxed Goja runtime.
func (a *Adapter) ExecuteShell(ctx context.Context, script string) (adapter.RawQueryResult, error) {
	start := time.Now()
	cleanScript := strings.TrimSpace(script)
	if cleanScript == "" {
		return adapter.RawQueryResult{}, fmt.Errorf("mongo shell: script cannot be empty")
	}

	vm := goja.New()

	// 1. Enforce strict timeout protection to terminate infinite loops (e.g. while(true))
	execCtx, cancel := context.WithTimeout(ctx, defaultShellTimeout)
	defer cancel()

	stopCh := make(chan struct{})
	defer close(stopCh)

	go func() {
		select {
		case <-execCtx.Done():
			vm.Interrupt("mongo shell: execution timed out (exceeded limit)")
		case <-stopCh:
		}
	}()

	// 2. Setup standard BSON constructor helpers in JS environment
	if err := registerBsonHelpers(vm); err != nil {
		return adapter.RawQueryResult{}, fmt.Errorf("mongo shell: register bson helpers: %w", err)
	}

	// 3. Register 'db' dynamic proxy object
	dbObj := newDbProxy(vm, a, execCtx)
	if err := vm.Set("db", dbObj); err != nil {
		return adapter.RawQueryResult{}, fmt.Errorf("mongo shell: set db object: %w", err)
	}

	// 4. Run the script
	resVal, err := vm.RunString(cleanScript)
	if err != nil {
		if strings.Contains(err.Error(), "interrupted") || strings.Contains(err.Error(), "timed out") {
			return adapter.RawQueryResult{}, fmt.Errorf("mongo shell: execution timed out (exceeded 10s limit)")
		}
		return adapter.RawQueryResult{}, fmt.Errorf("mongo shell: %w", err)
	}

	// 5. Transform JS return value into adapter.RawQueryResult
	return transformResult(execCtx, resVal, start)
}

// --------------------------------------------------------------------------
// BSON Helpers (ObjectId, ISODate, NumberLong, UUID)
// --------------------------------------------------------------------------

func registerBsonHelpers(vm *goja.Runtime) error {
	initScript := `
function ObjectId(hex) {
	if (!(this instanceof ObjectId)) return new ObjectId(hex);
	this._bsontype = "ObjectID";
	if (hex && typeof hex === "string" && hex.length === 24) {
		this.hex = hex;
	} else {
		this.hex = _generateObjectIdHex();
	}
}
ObjectId.prototype.toString = function() { return 'ObjectId("' + this.hex + '")'; };
ObjectId.prototype.toJSON = function() { return this.hex; };

function ISODate(str) {
	if (!(this instanceof ISODate)) return new ISODate(str);
	this._bsontype = "ISODate";
	if (str) {
		this.date = new Date(str).toISOString();
	} else {
		this.date = new Date().toISOString();
	}
}
ISODate.prototype.toString = function() { return 'ISODate("' + this.date + '")'; };
ISODate.prototype.toJSON = function() { return this.date; };

function NumberLong(v) {
	if (!(this instanceof NumberLong)) return new NumberLong(v);
	this._bsontype = "NumberLong";
	this.value = v !== undefined ? String(v) : "0";
}
NumberLong.prototype.toString = function() { return 'NumberLong(' + this.value + ')'; };
NumberLong.prototype.toJSON = function() { return Number(this.value); };

function UUID(v) {
	if (!(this instanceof UUID)) return new UUID(v);
	this._bsontype = "UUID";
	this.value = v ? String(v) : "";
}
UUID.prototype.toString = function() { return 'UUID("' + this.value + '")'; };
UUID.prototype.toJSON = function() { return this.value; };
`
	if err := vm.Set("_generateObjectIdHex", func() string {
		return primitive.NewObjectID().Hex()
	}); err != nil {
		return err
	}

	_, err := vm.RunString(initScript)
	return err
}

// --------------------------------------------------------------------------
// DB Proxy Object
// --------------------------------------------------------------------------

type dbProxy struct {
	vm      *goja.Runtime
	adapter *Adapter
	ctx     context.Context
}

func newDbProxy(vm *goja.Runtime, a *Adapter, ctx context.Context) *goja.Object {
	dp := &dbProxy{vm: vm, adapter: a, ctx: ctx}
	obj := vm.NewObject()

	_ = obj.Set("getName", func() string {
		return a.db.Name()
	})

	_ = obj.Set("getCollectionNames", func() (any, error) {
		names, err := a.db.ListCollectionNames(ctx, bson.M{})
		if err != nil {
			return nil, err
		}
		return names, nil
	})

	// Wrap with dynamic proxy for db.<collection>
	proxyObj := vm.NewDynamicObject(dp)
	return proxyObj
}

func (dp *dbProxy) Get(prop string) goja.Value {
	if prop == "getName" {
		return dp.vm.ToValue(func() string {
			return dp.adapter.db.Name()
		})
	}
	if prop == "getCollectionNames" {
		return dp.vm.ToValue(func() ([]string, error) {
			return dp.adapter.db.ListCollectionNames(dp.ctx, bson.M{})
		})
	}
	if prop == "runCommand" {
		return dp.vm.ToValue(func(cmdObj any) (any, error) {
			bCmd := toBsonDocument(cmdObj)
			var res bson.M
			err := dp.adapter.db.RunCommand(dp.ctx, bCmd).Decode(&res)
			if err != nil {
				return nil, err
			}
			return cleanValue(res), nil
		})
	}

	// Return collection proxy for db[prop]
	return newCollectionProxy(dp.vm, dp.adapter, dp.ctx, prop)
}

func (dp *dbProxy) Set(prop string, val goja.Value) bool {
	return false
}

func (dp *dbProxy) Has(prop string) bool {
	return true
}

func (dp *dbProxy) Delete(prop string) bool {
	return false
}

func (dp *dbProxy) Keys() []string {
	names, _ := dp.adapter.db.ListCollectionNames(dp.ctx, bson.M{})
	return append([]string{"getName", "getCollectionNames", "runCommand"}, names...)
}

// --------------------------------------------------------------------------
// Collection Proxy Object
// --------------------------------------------------------------------------

func newCollectionProxy(vm *goja.Runtime, a *Adapter, ctx context.Context, collName string) goja.Value {
	coll := a.db.Collection(collName)
	obj := vm.NewObject()

	// find(filter, projection)
	_ = obj.Set("find", func(args ...any) *cursorProxy {
		var filter bson.M
		var projection bson.M
		if len(args) > 0 && args[0] != nil {
			filter = toBsonDocument(args[0])
		} else {
			filter = bson.M{}
		}
		if len(args) > 1 && args[1] != nil {
			projection = toBsonDocument(args[1])
		}
		return newCursorProxy(vm, coll, ctx, filter, projection)
	})

	// findOne(filter, projection)
	_ = obj.Set("findOne", func(args ...any) (any, error) {
		var filter bson.M
		opts := options.FindOne()
		if len(args) > 0 && args[0] != nil {
			filter = toBsonDocument(args[0])
		} else {
			filter = bson.M{}
		}
		if len(args) > 1 && args[1] != nil {
			opts.SetProjection(toBsonDocument(args[1]))
		}

		var doc bson.M
		err := coll.FindOne(ctx, filter, opts).Decode(&doc)
		if err != nil {
			if err == mongo.ErrNoDocuments {
				return nil, nil
			}
			return nil, err
		}
		return cleanValue(doc), nil
	})

	// aggregate(pipeline)
	_ = obj.Set("aggregate", func(args ...any) (*cursorProxy, error) {
		pipeline := toBsonPipeline(args)
		cursor, err := coll.Aggregate(ctx, pipeline)
		if err != nil {
			return nil, err
		}
		return newAggCursorProxy(vm, cursor, ctx), nil
	})

	// countDocuments(filter)
	_ = obj.Set("countDocuments", func(args ...any) (int64, error) {
		filter := bson.M{}
		if len(args) > 0 && args[0] != nil {
			filter = toBsonDocument(args[0])
		}
		return coll.CountDocuments(ctx, filter)
	})

	_ = obj.Set("count", func(args ...any) (int64, error) {
		filter := bson.M{}
		if len(args) > 0 && args[0] != nil {
			filter = toBsonDocument(args[0])
		}
		return coll.CountDocuments(ctx, filter)
	})

	_ = obj.Set("estimatedDocumentCount", func() (int64, error) {
		return coll.EstimatedDocumentCount(ctx)
	})

	// distinct(field, filter)
	_ = obj.Set("distinct", func(field string, args ...any) (any, error) {
		filter := bson.M{}
		if len(args) > 0 && args[0] != nil {
			filter = toBsonDocument(args[0])
		}
		vals, err := coll.Distinct(ctx, field, filter)
		if err != nil {
			return nil, err
		}
		return cleanValue(vals), nil
	})

	// insertOne(doc)
	_ = obj.Set("insertOne", func(doc any) (map[string]any, error) {
		bDoc := toBsonDocument(doc)
		res, err := coll.InsertOne(ctx, bDoc)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"acknowledged": true,
			"insertedId":   cleanValue(res.InsertedID),
		}, nil
	})

	// insertMany(docs)
	_ = obj.Set("insertMany", func(docs any) (map[string]any, error) {
		arr, ok := docs.([]any)
		if !ok {
			return nil, fmt.Errorf("insertMany expects an array of documents")
		}
		bDocs := make([]any, len(arr))
		for i, d := range arr {
			bDocs[i] = toBsonDocument(d)
		}
		res, err := coll.InsertMany(ctx, bDocs)
		if err != nil {
			return nil, err
		}
		insertedIDs := make([]any, len(res.InsertedIDs))
		for i, id := range res.InsertedIDs {
			insertedIDs[i] = cleanValue(id)
		}
		return map[string]any{
			"acknowledged":  true,
			"insertedCount": len(insertedIDs),
			"insertedIds":   insertedIDs,
		}, nil
	})

	// updateOne(filter, update, options)
	_ = obj.Set("updateOne", func(filter, update any, args ...any) (map[string]any, error) {
		bFilter := toBsonDocument(filter)
		bUpdate := toBsonDocument(update)
		opts := options.Update()
		if len(args) > 0 && args[0] != nil {
			if optMap, ok := args[0].(map[string]any); ok {
				if upsert, ok := optMap["upsert"].(bool); ok && upsert {
					opts.SetUpsert(true)
				}
			}
		}
		res, err := coll.UpdateOne(ctx, bFilter, bUpdate, opts)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"acknowledged":  true,
			"matchedCount":  res.MatchedCount,
			"modifiedCount": res.ModifiedCount,
			"upsertedId":    cleanValue(res.UpsertedID),
		}, nil
	})

	// updateMany(filter, update, options)
	_ = obj.Set("updateMany", func(filter, update any, args ...any) (map[string]any, error) {
		bFilter := toBsonDocument(filter)
		bUpdate := toBsonDocument(update)
		opts := options.Update()
		if len(args) > 0 && args[0] != nil {
			if optMap, ok := args[0].(map[string]any); ok {
				if upsert, ok := optMap["upsert"].(bool); ok && upsert {
					opts.SetUpsert(true)
				}
			}
		}
		res, err := coll.UpdateMany(ctx, bFilter, bUpdate, opts)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"acknowledged":  true,
			"matchedCount":  res.MatchedCount,
			"modifiedCount": res.ModifiedCount,
			"upsertedId":    cleanValue(res.UpsertedID),
		}, nil
	})

	// deleteOne(filter)
	_ = obj.Set("deleteOne", func(filter any) (map[string]any, error) {
		bFilter := toBsonDocument(filter)
		res, err := coll.DeleteOne(ctx, bFilter)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"acknowledged": true,
			"deletedCount": res.DeletedCount,
		}, nil
	})

	// deleteMany(filter)
	_ = obj.Set("deleteMany", func(filter any) (map[string]any, error) {
		bFilter := toBsonDocument(filter)
		res, err := coll.DeleteMany(ctx, bFilter)
		if err != nil {
			return nil, err
		}
		return map[string]any{
			"acknowledged": true,
			"deletedCount": res.DeletedCount,
		}, nil
	})

	// drop()
	_ = obj.Set("drop", func() (map[string]any, error) {
		err := coll.Drop(ctx)
		if err != nil {
			return nil, err
		}
		return map[string]any{"acknowledged": true}, nil
	})

	return obj
}

// --------------------------------------------------------------------------
// Cursor Proxy Object (Supporting .sort(), .limit(), .skip(), .toArray())
// --------------------------------------------------------------------------

type cursorProxy struct {
	vm         *goja.Runtime
	coll       *mongo.Collection
	ctx        context.Context
	filter     bson.M
	projection bson.M
	sort       bson.M
	limit      int64
	skip       int64
	aggCursor  *mongo.Cursor
}

func newCursorProxy(vm *goja.Runtime, coll *mongo.Collection, ctx context.Context, filter, projection bson.M) *cursorProxy {
	return &cursorProxy{
		vm:         vm,
		coll:       coll,
		ctx:        ctx,
		filter:     filter,
		projection: projection,
		limit:      defaultCursorLimit,
	}
}

func newAggCursorProxy(vm *goja.Runtime, cur *mongo.Cursor, ctx context.Context) *cursorProxy {
	return &cursorProxy{
		vm:        vm,
		ctx:       ctx,
		aggCursor: cur,
	}
}

func (cp *cursorProxy) Sort(s any) *cursorProxy {
	cp.sort = toBsonDocument(s)
	return cp
}

func (cp *cursorProxy) Limit(l int64) *cursorProxy {
	cp.limit = l
	return cp
}

func (cp *cursorProxy) Skip(s int64) *cursorProxy {
	cp.skip = s
	return cp
}

func (cp *cursorProxy) Project(p any) *cursorProxy {
	cp.projection = toBsonDocument(p)
	return cp
}

func (cp *cursorProxy) ToArray() ([]any, error) {
	cur, err := cp.execute()
	if err != nil {
		return nil, err
	}
	defer cur.Close(cp.ctx)

	var items []any
	for cur.Next(cp.ctx) {
		var doc bson.M
		if err := cur.Decode(&doc); err != nil {
			return nil, err
		}
		items = append(items, cleanValue(doc))
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}
	if items == nil {
		items = []any{}
	}
	return items, nil
}

func (cp *cursorProxy) Count() (int64, error) {
	if cp.coll == nil {
		return 0, fmt.Errorf("cursor: count not supported on aggregate cursor")
	}
	return cp.coll.CountDocuments(cp.ctx, cp.filter)
}

func (cp *cursorProxy) execute() (*mongo.Cursor, error) {
	if cp.aggCursor != nil {
		return cp.aggCursor, nil
	}
	findOpts := options.Find()
	if cp.limit > 0 {
		findOpts.SetLimit(cp.limit)
	}
	if cp.skip > 0 {
		findOpts.SetSkip(cp.skip)
	}
	if cp.sort != nil {
		findOpts.SetSort(cp.sort)
	}
	if cp.projection != nil {
		findOpts.SetProjection(cp.projection)
	}
	return cp.coll.Find(cp.ctx, cp.filter, findOpts)
}

// --------------------------------------------------------------------------
// Result Transformer
// --------------------------------------------------------------------------

func transformResult(ctx context.Context, v goja.Value, start time.Time) (adapter.RawQueryResult, error) {
	if v == nil || goja.IsNull(v) || goja.IsUndefined(v) {
		return adapter.RawQueryResult{
			Columns:         []string{"result"},
			Rows:            []map[string]any{{"result": nil}},
			ExecutionTimeMs: adapter.ElapsedMs(start),
			RowsAffected:    0,
			IsMutation:      false,
		}, nil
	}

	exported := v.Export()

	// Check if cursorProxy
	if cp, ok := exported.(*cursorProxy); ok {
		cur, err := cp.execute()
		if err != nil {
			return adapter.RawQueryResult{}, fmt.Errorf("mongo shell: execute cursor: %w", err)
		}
		defer cur.Close(ctx)
		return cursorToResult(ctx, cur, start, false)
	}

	// Check if array
	if arr, ok := exported.([]any); ok {
		var rows []map[string]any
		colSet := make(map[string]struct{})
		var cols []string

		for _, item := range arr {
			if doc, ok := item.(map[string]any); ok {
				cleaned := cleanValue(doc).(map[string]any)
				for k := range cleaned {
					if _, exists := colSet[k]; !exists {
						colSet[k] = struct{}{}
						cols = append(cols, k)
					}
				}
				rows = append(rows, cleaned)
			} else {
				// Scalar in array
				if _, exists := colSet["value"]; !exists {
					colSet["value"] = struct{}{}
					cols = append(cols, "value")
				}
				rows = append(rows, map[string]any{"value": cleanValue(item)})
			}
		}

		if rows == nil {
			rows = []map[string]any{}
		}
		orderIdColumnFirst(cols)

		return adapter.RawQueryResult{
			Columns:         cols,
			Rows:            rows,
			ExecutionTimeMs: adapter.ElapsedMs(start),
			RowsAffected:    int64(len(rows)),
			IsMutation:      false,
		}, nil
	}

	// Check if map / object
	if m, ok := exported.(map[string]any); ok {
		cleaned := cleanValue(m).(map[string]any)
		var cols []string
		for k := range cleaned {
			cols = append(cols, k)
		}
		orderIdColumnFirst(cols)

		isMut := false
		var rowsAff int64 = 1
		if _, hasAck := cleaned["acknowledged"]; hasAck {
			isMut = true
			if mod, ok := cleaned["modifiedCount"].(int64); ok {
				rowsAff = mod
			} else if ins, ok := cleaned["insertedCount"].(int); ok {
				rowsAff = int64(ins)
			} else if del, ok := cleaned["deletedCount"].(int64); ok {
				rowsAff = del
			}
		}

		return adapter.RawQueryResult{
			Columns:         cols,
			Rows:            []map[string]any{cleaned},
			ExecutionTimeMs: adapter.ElapsedMs(start),
			RowsAffected:    rowsAff,
			IsMutation:      isMut,
		}, nil
	}

	// Primitive scalar
	cleanScalar := cleanValue(exported)
	return adapter.RawQueryResult{
		Columns:         []string{"result"},
		Rows:            []map[string]any{{"result": cleanScalar}},
		ExecutionTimeMs: adapter.ElapsedMs(start),
		RowsAffected:    1,
		IsMutation:      false,
	}, nil
}

func orderIdColumnFirst(cols []string) {
	for i, c := range cols {
		if c == "_id" && i > 0 {
			copy(cols[1:i+1], cols[0:i])
			cols[0] = "_id"
			break
		}
	}
}

// --------------------------------------------------------------------------
// Value Conversions from JS to BSON
// --------------------------------------------------------------------------

func toBsonDocument(v any) bson.M {
	if v == nil {
		return bson.M{}
	}
	converted := jsToBsonValue(v)
	if m, ok := converted.(bson.M); ok {
		return m
	}
	if m, ok := converted.(map[string]any); ok {
		res := make(bson.M, len(m))
		for k, val := range m {
			res[k] = val
		}
		return res
	}
	return bson.M{}
}

func toBsonPipeline(args []any) []bson.M {
	if len(args) == 0 || args[0] == nil {
		return []bson.M{}
	}
	first := jsToBsonValue(args[0])
	if arr, ok := first.([]any); ok {
		res := make([]bson.M, 0, len(arr))
		for _, item := range arr {
			res = append(res, toBsonDocument(item))
		}
		return res
	}
	if m, ok := first.(bson.M); ok {
		return []bson.M{m}
	}
	return []bson.M{}
}

func jsToBsonValue(v any) any {
	if v == nil {
		return nil
	}

	switch val := v.(type) {
	case map[string]any:
		// Check for custom BSON type representations
		if bsType, ok := val["_bsontype"].(string); ok {
			switch bsType {
			case "ObjectID":
				if hex, ok := val["hex"].(string); ok {
					if oid, err := primitive.ObjectIDFromHex(hex); err == nil {
						return oid
					}
				}
				return primitive.NewObjectID()
			case "ISODate":
				if dateStr, ok := val["date"].(string); ok {
					if t, err := time.Parse(time.RFC3339Nano, dateStr); err == nil {
						return t
					}
					if t, err := time.Parse(time.RFC3339, dateStr); err == nil {
						return t
					}
				}
				return time.Now()
			case "NumberLong":
				if s, ok := val["value"].(string); ok {
					var i int64
					if _, err := fmt.Sscanf(s, "%d", &i); err == nil {
						return i
					}
				}
				if f, ok := val["value"].(float64); ok {
					return int64(f)
				}
				return int64(0)
			case "UUID":
				if s, ok := val["value"].(string); ok {
					return s
				}
			}
		}

		res := make(bson.M, len(val))
		for k, item := range val {
			res[k] = jsToBsonValue(item)
		}
		return res

	case []any:
		res := make([]any, len(val))
		for i, item := range val {
			res[i] = jsToBsonValue(item)
		}
		return res

	default:
		return v
	}
}
