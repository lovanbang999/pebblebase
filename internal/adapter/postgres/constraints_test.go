package postgres

import (
	"context"
	"github.com/jackc/pgx/v5"
	"testing"
)

type constraintFake struct {
	pgx.Rows
	index int
}

func (f *constraintFake) Next() bool { f.index++; return f.index <= 3 }
func (f *constraintFake) Close()     {}
func (f *constraintFake) Err() error { return nil }
func (f *constraintFake) Scan(dest ...any) error {
	*dest[0].(*string) = "child"
	*dest[1].(*string) = "constraint"
	*dest[2].(*string) = []string{"p", "f", "u"}[f.index-1]
	*dest[3].(*[]string) = []string{"a", "b"}
	*dest[4].(*string) = "parent"
	*dest[5].(*string) = "public"
	*dest[6].(*[]string) = []string{"x", "y"}
	*dest[7].(*string) = "FOREIGN KEY (a,b) REFERENCES parent(x,y)"
	return nil
}

type constraintQueryFake struct{}

func (constraintQueryFake) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return &constraintFake{}, nil
}
func TestSchemaConstraintsMapping(t *testing.T) {
	result, err := readSchemaConstraints(context.Background(), constraintQueryFake{})
	if err != nil {
		t.Fatal(err)
	}
	constraints := result["child"]
	if len(constraints) != 3 || constraints[0].Kind != "primary_key" || constraints[1].Kind != "foreign_key" || constraints[2].Kind != "unique" || constraints[1].ReferenceColumns[1] != "y" || constraints[1].Definition == "" {
		t.Fatal(result)
	}
}

type indexRowsFake struct {
	pgx.Rows
	done bool
}

func (f *indexRowsFake) Next() bool {
	if f.done {
		return false
	}
	f.done = true
	return true
}
func (f *indexRowsFake) Close()     {}
func (f *indexRowsFake) Err() error { return nil }
func (f *indexRowsFake) Scan(dest ...any) error {
	*dest[0].(*string) = "expression_unique"
	*dest[1].(*bool) = true
	*dest[2].(*bool) = false
	*dest[3].(*[]string) = []string{"lower(email)", "tenant_id"}
	*dest[4].(*string) = "CREATE UNIQUE INDEX expression_unique ON public.users (lower(email),tenant_id)"
	return nil
}

type indexQueryFake struct{}

func (indexQueryFake) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return &indexRowsFake{}, nil
}
func TestSchemaIndexMapping(t *testing.T) {
	indexes, err := readTableIndexes(context.Background(), indexQueryFake{}, "users")
	if err != nil {
		t.Fatal(err)
	}
	if len(indexes) != 1 || !indexes[0].Unique || indexes[0].Primary || indexes[0].Columns[0] != "lower(email)" || indexes[0].Definition == "" {
		t.Fatal(indexes)
	}
}

type columnRowsFake struct {
	pgx.Rows
	done bool
}

func (f *columnRowsFake) Next() bool {
	if f.done {
		return false
	}
	f.done = true
	return true
}
func (f *columnRowsFake) Close()     {}
func (f *columnRowsFake) Err() error { return nil }
func (f *columnRowsFake) Scan(dest ...any) error {
	*dest[0].(*string) = "name"
	*dest[1].(*string) = "character varying"
	*dest[2].(*string) = "YES"
	*dest[3].(**string) = nil
	*dest[4].(*bool) = false
	*dest[5].(*string) = "character varying(64)"
	return nil
}

type columnQueryFake struct{}

func (columnQueryFake) Query(context.Context, string, ...any) (pgx.Rows, error) {
	return &columnRowsFake{}, nil
}
func TestSchemaNativeColumnMapping(t *testing.T) {
	columns, err := fetchColumns(context.Background(), columnQueryFake{}, "users", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(columns) != 1 || columns[0].Type != "string" || columns[0].NativeType != "character varying(64)" {
		t.Fatal(columns)
	}
}
