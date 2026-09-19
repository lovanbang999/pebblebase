package api

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"pebblebase/internal/adapter"

	"github.com/parquet-go/parquet-go"
	"github.com/xuri/excelize/v2"
)

// exportTable handles GET /api/connections/{id}/tables/{table}/export.
// Streams table data as CSV or JSON with low memory overhead.
//
// Query parameters:
//
//	format=csv|json   — export format (default "csv")
//	limit=N          — optional limit
//	offset=N         — optional offset
//	sort_by=col      — column to order by
//	sort_desc=true   — descending order
//	filter=col:op:val — one or more filters
func (s *Server) exportTable(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	table := r.PathValue("table")

	a, err := s.getAdapter(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}

	exporter, ok := a.(adapter.StreamExporter)
	if !ok {
		writeError(w, http.StatusNotImplemented, "bulk export is not supported for this database")
		return
	}

	opts, err := parseQueryOptions(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	// For export, default to unlimited rows if limit query parameter is not explicitly provided
	if r.URL.Query().Get("limit") == "" {
		opts.Limit = 0
	}
	if r.URL.Query().Get("offset") == "" {
		opts.Offset = 0
	}

	format := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("format")))
	if format == "" {
		format = "csv"
	}
	if format != "csv" && format != "json" && format != "jsonl" && format != "xlsx" && format != "parquet" {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("unsupported export format: %q (expected csv, json, jsonl, xlsx, or parquet)", format))
		return
	}

	flusher, _ := w.(http.Flusher)

	switch format {
	case "csv":
		s.streamCSVExport(w, r, exporter, table, opts, flusher)
	case "json":
		s.streamJSONExport(w, r, exporter, table, opts, flusher)
	case "jsonl":
		s.streamJSONLExport(w, r, exporter, table, opts, flusher)
	case "xlsx":
		s.streamExcelExport(w, r, exporter, table, opts)
	case "parquet":
		s.streamParquetExport(w, r, exporter, table, opts)
	}
}

func (s *Server) streamCSVExport(
	w http.ResponseWriter,
	r *http.Request,
	exporter adapter.StreamExporter,
	table string,
	opts adapter.QueryOptions,
	flusher http.Flusher,
) {
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", table+".csv"))
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	csvWriter := csv.NewWriter(w)
	firstChunk := true

	err := exporter.StreamRows(r.Context(), table, opts, func(columns []string, rows []map[string]any) error {
		if firstChunk {
			if err := csvWriter.Write(columns); err != nil {
				return err
			}
			firstChunk = false
		}

		for _, row := range rows {
			record := make([]string, len(columns))
			for i, col := range columns {
				record[i] = formatCSVValue(row[col])
			}
			if err := csvWriter.Write(record); err != nil {
				return err
			}
		}

		csvWriter.Flush()
		if flusher != nil {
			flusher.Flush()
		}
		return csvWriter.Error()
	})

	if err != nil {
		log.Printf("streamCSVExport error: %v", err)
	}

	csvWriter.Flush()
	if flusher != nil {
		flusher.Flush()
	}
}

func (s *Server) streamJSONExport(
	w http.ResponseWriter,
	r *http.Request,
	exporter adapter.StreamExporter,
	table string,
	opts adapter.QueryOptions,
	flusher http.Flusher,
) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", table+".json"))
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	if _, err := w.Write([]byte("[\n")); err != nil {
		return
	}
	if flusher != nil {
		flusher.Flush()
	}

	firstRow := true

	err := exporter.StreamRows(r.Context(), table, opts, func(columns []string, rows []map[string]any) error {
		for _, row := range rows {
			b, err := json.Marshal(row)
			if err != nil {
				continue
			}

			if !firstRow {
				if _, err := w.Write([]byte(",\n")); err != nil {
					return err
				}
			} else {
				firstRow = false
			}

			if _, err := w.Write(b); err != nil {
				return err
			}
		}

		if flusher != nil {
			flusher.Flush()
		}
		return nil
	})

	if err != nil {
		log.Printf("streamJSONExport error: %v", err)
	}

	_, _ = w.Write([]byte("\n]\n"))
	if flusher != nil {
		flusher.Flush()
	}
}

func (s *Server) streamJSONLExport(
	w http.ResponseWriter,
	r *http.Request,
	exporter adapter.StreamExporter,
	table string,
	opts adapter.QueryOptions,
	flusher http.Flusher,
) {
	w.Header().Set("Content-Type", "application/x-ndjson; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", table+".jsonl"))
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	err := exporter.StreamRows(r.Context(), table, opts, func(columns []string, rows []map[string]any) error {
		for _, row := range rows {
			b, err := json.Marshal(row)
			if err != nil {
				continue
			}
			if _, err := w.Write(append(b, '\n')); err != nil {
				return err
			}
		}
		if flusher != nil {
			flusher.Flush()
		}
		return nil
	})

	if err != nil {
		log.Printf("streamJSONLExport error: %v", err)
	}
	if flusher != nil {
		flusher.Flush()
	}
}

func (s *Server) streamExcelExport(
	w http.ResponseWriter,
	r *http.Request,
	exporter adapter.StreamExporter,
	table string,
	opts adapter.QueryOptions,
) {
	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", table+".xlsx"))
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	f := excelize.NewFile()
	defer f.Close()

	sheetName := "Sheet1"
	sw, err := f.NewStreamWriter(sheetName)
	if err != nil {
		log.Printf("streamExcelExport new stream writer error: %v", err)
		return
	}

	rowIndex := 1
	firstChunk := true

	err = exporter.StreamRows(r.Context(), table, opts, func(columns []string, rows []map[string]any) error {
		if firstChunk {
			headerValues := make([]any, len(columns))
			for i, col := range columns {
				headerValues[i] = col
			}
			cell, err := excelize.CoordinatesToCellName(1, rowIndex)
			if err != nil {
				return err
			}
			if err := sw.SetRow(cell, headerValues); err != nil {
				return err
			}
			rowIndex++
			firstChunk = false
		}

		for _, row := range rows {
			rowValues := make([]any, len(columns))
			for i, col := range columns {
				val := row[col]
				switch v := val.(type) {
				case map[string]any, []any:
					b, err := json.Marshal(v)
					if err == nil {
						rowValues[i] = string(b)
					} else {
						rowValues[i] = fmt.Sprintf("%v", v)
					}
				case []byte:
					rowValues[i] = string(v)
				case time.Time:
					rowValues[i] = v.Format(time.RFC3339)
				default:
					rowValues[i] = val
				}
			}
			cell, err := excelize.CoordinatesToCellName(1, rowIndex)
			if err != nil {
				return err
			}
			if err := sw.SetRow(cell, rowValues); err != nil {
				return err
			}
			rowIndex++
		}
		return nil
	})

	if err != nil {
		log.Printf("streamExcelExport error: %v", err)
	}

	if err := sw.Flush(); err != nil {
		log.Printf("streamExcelExport flush error: %v", err)
		return
	}

	if _, err := f.WriteTo(w); err != nil {
		log.Printf("streamExcelExport write error: %v", err)
	}
}

func (s *Server) streamParquetExport(
	w http.ResponseWriter,
	r *http.Request,
	exporter adapter.StreamExporter,
	table string,
	opts adapter.QueryOptions,
) {
	w.Header().Set("Content-Type", "application/vnd.apache.parquet")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", table+".parquet"))
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	var pw *parquet.GenericWriter[any]
	firstChunk := true

	err := exporter.StreamRows(r.Context(), table, opts, func(columns []string, rows []map[string]any) error {
		if firstChunk {
			group := parquet.Group{}
			for _, col := range columns {
				group[col] = parquet.Optional(parquet.String())
			}
			schema := parquet.NewSchema(table, group)
			pw = parquet.NewGenericWriter[any](w, schema)
			firstChunk = false
		}

		if pw == nil || len(rows) == 0 {
			return nil
		}

		parquetRows := make([]any, len(rows))
		for i, row := range rows {
			record := make(map[string]any, len(columns))
			for _, col := range columns {
				val, exists := row[col]
				if !exists || val == nil {
					continue
				}
				record[col] = formatCSVValue(val)
			}
			parquetRows[i] = record
		}

		_, err := pw.Write(parquetRows)
		return err
	})

	if err != nil {
		log.Printf("streamParquetExport error: %v", err)
	}

	if pw != nil {
		if err := pw.Close(); err != nil {
			log.Printf("streamParquetExport close error: %v", err)
		}
	}
}

// formatCSVValue formats an arbitrary database value for CSV serialization.
func formatCSVValue(val any) string {
	if val == nil {
		return ""
	}
	switch v := val.(type) {
	case string:
		return v
	case []byte:
		return string(v)
	case bool:
		return strconv.FormatBool(v)
	case int:
		return strconv.Itoa(v)
	case int64:
		return strconv.FormatInt(v, 10)
	case int32:
		return strconv.FormatInt(int64(v), 10)
	case int16:
		return strconv.FormatInt(int64(v), 10)
	case int8:
		return strconv.FormatInt(int64(v), 10)
	case uint:
		return strconv.FormatUint(uint64(v), 10)
	case uint64:
		return strconv.FormatUint(v, 10)
	case uint32:
		return strconv.FormatUint(uint64(v), 10)
	case uint16:
		return strconv.FormatUint(uint64(v), 10)
	case uint8:
		return strconv.FormatUint(uint64(v), 10)
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(v), 'f', -1, 32)
	case time.Time:
		return v.Format(time.RFC3339)
	case map[string]any, []any:
		b, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(b)
	default:
		return fmt.Sprintf("%v", v)
	}
}
