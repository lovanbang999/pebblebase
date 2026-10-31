export interface FindMatch {
  connectionId: string;
  connectionName: string;
  table: string;
  count: number;
  column: string;
  operator: "eq" | "contains";
  rows: Record<string, unknown>[];
  truncated?: boolean;
}

export interface FindConnectionResult {
  connectionId: string;
  connectionName: string;
  status: "complete" | "partial" | "skipped" | "failed";
  note?: string;
  matches: FindMatch[];
}

export function groupFindResults(results: FindConnectionResult[]) {
  return results.map((connection) => ({
    ...connection,
    matches: connection.matches ?? [],
  }));
}

export function findDisplayValue(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function highlightSegments(text: string, query: string) {
  const at = text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  if (at < 0 || !query) return [{ text, matched: false }];
  return [
    { text: text.slice(0, at), matched: false },
    { text: text.slice(at, at + query.length), matched: true },
    { text: text.slice(at + query.length), matched: false },
  ].filter((part) => part.text.length > 0);
}
