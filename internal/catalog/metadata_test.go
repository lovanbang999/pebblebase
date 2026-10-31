package catalog

import (
	"context"
	"errors"
	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
	"testing"
)

type fakeCatalog struct{ fail bool }

func (f fakeCatalog) Introspect(context.Context) ([]schema.Table, error) {
	return []schema.Table{{Name: "child", Columns: []schema.Column{{Name: "a"}, {Name: "b"}}}, {Name: "parent"}}, nil
}
func (f fakeCatalog) GetTableDDL(context.Context, string) (string, error) {
	return "CREATE TABLE child(a int)", nil
}
func (f fakeCatalog) GetTableIndexes(context.Context, string) ([]adapter.IndexInfo, error) {
	if f.fail {
		return nil, errors.New("private database detail")
	}
	return []adapter.IndexInfo{{Name: "pk", Columns: []string{"a", "b"}, Primary: true, Unique: true}}, nil
}
func (f fakeCatalog) GetSchemaConstraints(context.Context) (map[string][]adapter.SchemaConstraint, error) {
	return map[string][]adapter.SchemaConstraint{"child": {{Name: "pk", Kind: "primary_key", Columns: []string{"a", "b"}}, {Name: "fk", Kind: "foreign_key", Columns: []string{"a", "b"}, ReferenceTable: "parent", ReferenceColumns: []string{"x", "y"}}, {Name: "uq", Kind: "unique", Columns: []string{"b"}}}}, nil
}
func TestMetadataMapping(t *testing.T) {
	result, err := Read(context.Background(), fakeCatalog{}, "child")
	if err != nil {
		t.Fatal(err)
	}
	table := result.Tables[0]
	if len(table.PrimaryKey) != 2 || len(table.Constraints) != 3 || len(table.Indexes) != 1 || table.DDL == "" {
		t.Fatal(table)
	}
	if len(result.Relations) != 2 || result.Relations[0].ToColumn != "x" || result.Relations[1].ToColumn != "y" {
		t.Fatal(result.Relations)
	}
	if result.Tables[1].DDL != "" {
		t.Fatal("DDL eagerly loaded for unrequested table")
	}
}

func TestReadSearchSchemaUsesOnlySharedTableColumns(t *testing.T) {
	tables, err := ReadSearchSchema(context.Background(), fakeCatalog{})
	if err != nil {
		t.Fatal(err)
	}
	if len(tables) != 2 || tables[0].Columns == nil || tables[1].Relations == nil {
		t.Fatalf("search schema was not normalized: %#v", tables)
	}
}
func TestMetadataPartialCatalogFailure(t *testing.T) {
	result, err := Read(context.Background(), fakeCatalog{fail: true}, "")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Tables[0].Gaps) != 1 || len(result.Tables[0].Indexes) != 0 {
		t.Fatal(result)
	}
	if result.Tables[0].Gaps[0] == "private database detail" {
		t.Fatal("driver details leaked")
	}
}
