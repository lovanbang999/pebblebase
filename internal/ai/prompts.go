package ai

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// buildSchemaContext formats the condensed schema for system prompt injection.
func buildSchemaContext(engine string, schema []TableSchemaSummary) string {
	if len(schema) == 0 {
		return "No explicit schema available. Use standard conventions."
	}

	entityName := "Table"
	if strings.ToLower(engine) == "mongodb" {
		entityName = "Collection"
	}

	var sb strings.Builder
	for _, t := range schema {
		if strings.TrimSpace(t.Name) == "" {
			continue
		}
		sb.WriteString(fmt.Sprintf("%s: %s\n", entityName, t.Name))
		if len(t.Columns) > 0 {
			sb.WriteString(fmt.Sprintf("  Columns: %s\n", strings.Join(t.Columns, ", ")))
		}
		if len(t.PrimaryKeys) > 0 {
			sb.WriteString(fmt.Sprintf("  Primary Key: %s\n", strings.Join(t.PrimaryKeys, ", ")))
		}
		if len(t.ForeignKeys) > 0 {
			sb.WriteString(fmt.Sprintf("  Foreign Keys: %s\n", strings.Join(t.ForeignKeys, ", ")))
		}
	}
	return sb.String()
}

// BuildPrompt creates the system and user messages for a QueryAssistRequest.
func BuildPrompt(req *QueryAssistRequest) []ChatMessage {
	engine := strings.ToLower(strings.TrimSpace(req.Engine))
	if engine == "" {
		engine = "sql"
	}

	schemaStr := buildSchemaContext(engine, req.Schema)

	switch req.Mode {
	case AssistModeFix:
		return buildFixPrompt(engine, schemaStr, req.CurrentQuery, req.ErrorMessage)
	case AssistModeExplain:
		return buildExplainPrompt(engine, schemaStr, req.CurrentQuery, req.ExplainPlan)
	case AssistModeGenerate:
		fallthrough
	default:
		return buildGeneratePrompt(engine, schemaStr, req.Prompt)
	}
}

func buildGeneratePrompt(engine, schema, userPrompt string) []ChatMessage {
	dialectGuide := fmt.Sprintf("Target Engine: %s.", strings.ToUpper(engine))
	if engine == "mongodb" {
		dialectGuide += " Output executable MongoDB syntax (e.g., db.collection.find(...) or db.collection.aggregate([...]))."
	} else {
		dialectGuide += fmt.Sprintf(" Output valid %s SQL.", strings.ToUpper(engine))
	}

	systemContent := fmt.Sprintf(`You are Pebblebase AI, a high-precision, privacy-first database assistant.
%s
Follow these rules strictly:
1. Generate the most efficient, accurate query satisfying the user's natural language request (English or Vietnamese).
2. Adhere strictly to the provided database schema. Never invent non-existent table or column names.
3. If filtering by date, use appropriate functions for %s.
4. Output MUST be valid JSON with the following schema:
{
  "query": "The raw executable query string (no markdown, no extra quotes)",
  "explanation": "Brief 1-2 sentence explanation in the user's language of how the query works"
}

Database Schema:
%s`, dialectGuide, engine, schema)

	return []ChatMessage{
		{Role: "system", Content: systemContent},
		{Role: "user", Content: userPrompt},
	}
}

func buildFixPrompt(engine, schema, query, errMsg string) []ChatMessage {
	systemContent := fmt.Sprintf(`You are Pebblebase AI, an expert database query troubleshooter.
Target Engine: %s.
Follow these rules strictly:
1. Analyze the failing query and the exact database error message.
2. Formulate the corrected query matching the database schema and engine dialect.
3. Provide a clear, helpful 1-2 sentence explanation of what caused the error and what was fixed.
4. Output MUST be valid JSON with the following schema:
{
  "query": "The corrected raw executable query string",
  "explanation": "Explanation of the root cause and the fix"
}

Database Schema:
%s`, strings.ToUpper(engine), schema)

	userContent := fmt.Sprintf("Failing Query:\n%s\n\nDatabase Error Message:\n%s", query, errMsg)

	return []ChatMessage{
		{Role: "system", Content: systemContent},
		{Role: "user", Content: userContent},
	}
}

func buildExplainPrompt(engine, schema, query, explainPlan string) []ChatMessage {
	systemContent := fmt.Sprintf(`You are Pebblebase AI, a database performance optimization specialist.
Target Engine: %s.
Follow these rules strictly:
1. Analyze the query execution plan in plain language. Highlight bottlenecks such as Sequential Scans (Seq Scan / Table Scan / COLLSCAN), high cost, or massive row mismatches.
2. If appropriate, recommend targeted index definitions (CREATE INDEX statements).
3. If the query can be rewritten for higher efficiency, provide the optimized query.
4. Output MUST be valid JSON with the following schema:
{
  "query": "The optimized query string (or the original query if no query rewrite is needed)",
  "explanation": "Plain-language summary of bottlenecks and performance suggestions (in user's language)",
  "indexes": ["CREATE INDEX ..."]
}

Database Schema:
%s`, strings.ToUpper(engine), schema)

	userContent := fmt.Sprintf("Query:\n%s\n\nExecution Plan:\n%s", query, explainPlan)

	return []ChatMessage{
		{Role: "system", Content: systemContent},
		{Role: "user", Content: userContent},
	}
}

var jsonCodeBlockRegex = regexp.MustCompile("(?s)```(?:json)?\\s*({.*?})\\s*```")

// ParseAssistResponse parses and normalizes the completion output into a QueryAssistResponse.
func ParseAssistResponse(raw string) *QueryAssistResponse {
	trimmed := strings.TrimSpace(raw)

	// Attempt extraction from code fences if present
	if match := jsonCodeBlockRegex.FindStringSubmatch(trimmed); len(match) > 1 {
		trimmed = strings.TrimSpace(match[1])
	}

	var parsed struct {
		Query       string   `json:"query"`
		Explanation string   `json:"explanation"`
		Indexes     []string `json:"indexes"`
	}

	if err := json.Unmarshal([]byte(trimmed), &parsed); err == nil && (parsed.Query != "" || parsed.Explanation != "") {
		return &QueryAssistResponse{
			Query:       cleanFences(parsed.Query),
			Explanation: strings.TrimSpace(parsed.Explanation),
			Indexes:     parsed.Indexes,
		}
	}

	// Fallback heuristic: if raw response is direct code or mixed text
	query, explanation := extractQueryAndExplanationFallback(raw)
	return &QueryAssistResponse{
		Query:       query,
		Explanation: explanation,
		Indexes:     nil,
	}
}

var codeFenceRegex = regexp.MustCompile("(?s)```(?:sql|json|javascript)?\\s*(.*?)\\s*```")

func cleanFences(q string) string {
	s := strings.TrimSpace(q)
	if match := codeFenceRegex.FindStringSubmatch(s); len(match) > 1 {
		return strings.TrimSpace(match[1])
	}
	return s
}

func extractQueryAndExplanationFallback(raw string) (string, string) {
	trimmed := strings.TrimSpace(raw)
	if match := codeFenceRegex.FindStringSubmatch(trimmed); len(match) > 1 {
		q := strings.TrimSpace(match[1])
		exp := strings.TrimSpace(codeFenceRegex.ReplaceAllString(trimmed, ""))
		return q, exp
	}

	// If no code fences, check if first line or everything looks like SQL
	upper := strings.ToUpper(trimmed)
	if strings.HasPrefix(upper, "SELECT") || strings.HasPrefix(upper, "INSERT") ||
		strings.HasPrefix(upper, "UPDATE") || strings.HasPrefix(upper, "DELETE") ||
		strings.HasPrefix(upper, "CREATE") || strings.HasPrefix(upper, "DB.") {
		return trimmed, ""
	}

	return "", trimmed
}
