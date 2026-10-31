import type { AIQueryAssistRequest, TableSchema } from "@/lib/types";

export interface AIContextInput {
  engine: string;
  connectionName?: string;
  prompt: string;
  schema: TableSchema[];
  attachedResult?: Record<string, unknown>[];
}

/** Build only the context the user explicitly chose to send to the provider. */
export function buildAIContext(input: AIContextInput): AIQueryAssistRequest {
  const request: AIQueryAssistRequest = {
    mode: "generate",
    engine: input.engine,
    prompt: [
      input.connectionName ? `Active connection: ${input.connectionName}.` : "",
      input.schema[0] ? `Active table: ${input.schema[0].name}.` : "",
      input.prompt,
    ]
      .filter(Boolean)
      .join("\n"),
    schema: input.schema.slice(0, 1).map((table) => ({
      name: table.name,
      columns: table.columns.map((column) => `${column.name} (${column.type})`),
      primary_keys: table.columns
        .filter((column) => column.is_primary_key)
        .map((column) => column.name),
      foreign_keys: (table.relations ?? []).map(
        (relation) =>
          `${relation.from_column} -> ${relation.to_table}.${relation.to_column}`,
      ),
    })),
  };
  if (input.attachedResult?.length) {
    request.prompt += `\n\nUser-attached result rows (up to 20):\n${JSON.stringify(input.attachedResult.slice(0, 20))}`;
  }
  return request;
}
