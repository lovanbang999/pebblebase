// Package catalog assembles one reusable schema contract for table inspectors,
// ER diagrams and foreign-key navigation. It never executes user-supplied SQL.
package catalog

import (
	"context"
	"pebblebase/internal/adapter"
	"pebblebase/internal/schema"
	"sync"
)

type Source interface {
	Introspect(context.Context) ([]schema.Table, error)
}
type Table struct {
	schema.Table
	PrimaryKey  []string                   `json:"primary_key"`
	Constraints []adapter.SchemaConstraint `json:"constraints"`
	Indexes     []adapter.IndexInfo        `json:"indexes"`
	DDL         string                     `json:"ddl,omitempty"`
	Gaps        []string                   `json:"gaps"`
}
type Metadata struct {
	Tables    []Table           `json:"tables"`
	Relations []schema.Relation `json:"relations"`
}

// ReadSearchSchema supplies the shared catalog's table and column metadata to
// Find Everywhere without eagerly running per-table index/DDL lookups.
func ReadSearchSchema(ctx context.Context, source Source) ([]schema.Table, error) {
	tables, err := source.Introspect(ctx)
	if err != nil {
		return nil, err
	}
	for i := range tables {
		if tables[i].Columns == nil {
			tables[i].Columns = []schema.Column{}
		}
		if tables[i].Relations == nil {
			tables[i].Relations = []schema.Relation{}
		}
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	return tables, nil
}

func Read(ctx context.Context, source Source, selected string) (Metadata, error) {
	tables, err := source.Introspect(ctx)
	if err != nil {
		return Metadata{}, err
	}
	result := Metadata{Tables: make([]Table, len(tables)), Relations: []schema.Relation{}}
	constraints := map[string][]adapter.SchemaConstraint{}
	constraintsAvailable := false
	if provider, ok := source.(adapter.ConstraintProvider); ok {
		constraints, err = provider.GetSchemaConstraints(ctx)
		if err != nil {
			return Metadata{}, err
		}
		constraintsAvailable = true
	}
	seen := map[schema.Relation]bool{}
	for i, table := range tables {
		if table.Columns == nil {
			table.Columns = []schema.Column{}
		}
		if table.Relations == nil {
			table.Relations = []schema.Relation{}
		}
		result.Tables[i] = Table{Table: table, PrimaryKey: []string{}, Constraints: []adapter.SchemaConstraint{}, Indexes: []adapter.IndexInfo{}, Gaps: []string{}}
		for _, column := range table.Columns {
			if column.IsPrimaryKey {
				result.Tables[i].PrimaryKey = append(result.Tables[i].PrimaryKey, column.Name)
			}
		}
		if constraintsAvailable {
			result.Tables[i].Constraints = constraints[table.Name]
			if result.Tables[i].Constraints == nil {
				result.Tables[i].Constraints = []adapter.SchemaConstraint{}
			}
		} else {
			result.Tables[i].Gaps = append(result.Tables[i].Gaps, "Named/composite constraints unavailable; PK/FK flags and unique indexes come from existing catalog adapters.")
		}
		if constraintsAvailable {
			result.Tables[i].PrimaryKey = []string{}
			table.Relations = []schema.Relation{}
			for _, constraint := range constraints[table.Name] {
				if constraint.Kind == "primary_key" {
					result.Tables[i].PrimaryKey = append(result.Tables[i].PrimaryKey, constraint.Columns...)
				}
				if constraint.Kind == "foreign_key" {
					for j, column := range constraint.Columns {
						if j < len(constraint.ReferenceColumns) {
							table.Relations = append(table.Relations, schema.Relation{Name: constraint.Name, Type: schema.OneToMany, FromTable: table.Name, FromColumn: column, ToTable: referenceName(constraint), ToColumn: constraint.ReferenceColumns[j]})
						}
					}
				}
			}
			result.Tables[i].Relations = table.Relations
		}
		for _, relation := range table.Relations {
			if !seen[relation] {
				result.Relations = append(result.Relations, relation)
				seen[relation] = true
			}
		}
	}
	provider, ok := source.(adapter.DDLProvider)
	if !ok {
		for i := range result.Tables {
			result.Tables[i].Gaps = append(result.Tables[i].Gaps, "DDL and indexes are not supported by this adapter.")
		}
		return result, nil
	}
	// Bound catalog work for large schemas to four concurrent table lookups.
	jobs := make(chan int)
	var workers sync.WaitGroup
	for range 4 {
		workers.Go(func() {
			for i := range jobs {
				table := &result.Tables[i]
				indexes, err := provider.GetTableIndexes(ctx, table.Name)
				if err != nil {
					table.Gaps = append(table.Gaps, "Index catalog lookup failed.")
				} else if indexes != nil {
					table.Indexes = indexes
				}
				if selected == table.Name {
					ddl, err := provider.GetTableDDL(ctx, table.Name)
					if err != nil {
						table.Gaps = append(table.Gaps, "DDL catalog lookup failed.")
					} else {
						table.DDL = ddl
					}
				}
			}
		})
	}
	for i := range result.Tables {
		if selected == "" || selected == result.Tables[i].Name {
			jobs <- i
		}
	}
	close(jobs)
	workers.Wait()
	if err := ctx.Err(); err != nil {
		return Metadata{}, err
	}
	return result, nil
}

func referenceName(constraint adapter.SchemaConstraint) string {
	if constraint.ReferenceSchema != "" && constraint.ReferenceSchema != "public" {
		return constraint.ReferenceSchema + "." + constraint.ReferenceTable
	}
	return constraint.ReferenceTable
}
