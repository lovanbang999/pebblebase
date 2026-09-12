package postgres_test

import (
	"pebblebase/internal/adapter"
)

// adapter_QueryOptions builds QueryOptions for pagination tests.
func adapter_QueryOptions(limit, offset int) adapter.QueryOptions {
	return adapter.QueryOptions{Limit: limit, Offset: offset}
}

// adapter_QueryOptions_filter builds QueryOptions with a single filter.
func adapter_QueryOptions_filter(col, op string, val any) adapter.QueryOptions {
	return adapter.QueryOptions{
		Filters: []adapter.Filter{
			{Column: col, Operator: op, Value: val},
		},
	}
}
