// Package schema defines the unified data model used across all database adapters.
// All adapter implementations must map their native types to this model.
package schema

// Table represents a database table or collection.
type Table struct {
	Name      string     `json:"name"`
	Columns   []Column   `json:"columns"`
	Relations []Relation `json:"relations"`
}

// Column represents a single column within a table.
type Column struct {
	Name         string  `json:"name"`
	Type         string  `json:"type"` // normalized: "string","int","float","bool","datetime","json","binary","uuid","unknown"
	Nullable     bool    `json:"nullable"`
	IsPrimaryKey bool    `json:"is_primary_key"`
	IsForeignKey bool    `json:"is_foreign_key"`
	DefaultValue *string `json:"default_value,omitempty"`
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
	Name       string       `json:"name"`
	Type       RelationType `json:"type"`
	FromTable  string       `json:"from_table"`
	FromColumn string       `json:"from_column"`
	ToTable    string       `json:"to_table"`
	ToColumn   string       `json:"to_column"`
}
