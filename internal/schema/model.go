// Package schema defines the unified data model used across all database adapters.
// All adapter implementations must map their native types to this model.
package schema

// Table represents a database table or collection.
type Table struct {
	Name      string
	Columns   []Column
	Relations []Relation
}

// Column represents a single column within a table.
type Column struct {
	Name         string
	Type         string // normalized: "string","int","float","bool","datetime","json","binary","uuid","unknown"
	Nullable     bool
	IsPrimaryKey bool
	IsForeignKey bool
	DefaultValue *string
}

// RelationType describes the cardinality of a relation between two tables.
type RelationType string

const (
	OneToOne   RelationType = "one_to_one"
	OneToMany  RelationType = "one_to_many"
	ManyToMany RelationType = "many_to_many"
)

// Relation describes a foreign-key relationship between two tables.
type Relation struct {
	Name       string
	Type       RelationType
	FromTable  string
	FromColumn string
	ToTable    string
	ToColumn   string
}
