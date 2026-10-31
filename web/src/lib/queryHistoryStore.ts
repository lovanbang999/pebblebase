import type { QueryHistoryItem } from "./types";
export const QUERY_HISTORY_LIMIT = 50;
export function containsCredentials(query: string): boolean {
  return /\b(password|passwd|requirepass|masterauth|identified\s+by|secret|access_token|api_key)\b|^\s*(AUTH|HELLO|ACL)\b/i.test(
    query,
  );
}
export function sanitizeHistoryItem(value: unknown): QueryHistoryItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== "string" ||
    typeof item.query !== "string" ||
    typeof item.timestamp !== "number" ||
    !Number.isFinite(item.timestamp) ||
    containsCredentials(item.query)
  )
    return null;
  const clean: QueryHistoryItem = {
    id: item.id,
    query: item.query,
    timestamp: item.timestamp,
  };
  for (const key of [
    "execution_time_ms",
    "round_trip_ms",
    "row_count",
  ] as const)
    if (typeof item[key] === "number" && Number.isFinite(item[key]))
      clean[key] = item[key];
  if (typeof item.is_mutation === "boolean")
    clean.is_mutation = item.is_mutation;
  // Driver messages can contain bound values: retain only a safe failure marker.
  if (typeof item.error === "string") clean.error = "Execution failed";
  return clean;
}
export function readQueryHistory(raw: string | null): QueryHistoryItem[] {
  try {
    const entries: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(entries)
      ? entries
          .map(sanitizeHistoryItem)
          .filter((item): item is QueryHistoryItem => item !== null)
          .slice(0, QUERY_HISTORY_LIMIT)
      : [];
  } catch {
    return [];
  }
}
export function appendQueryHistory(
  history: QueryHistoryItem[],
  item: QueryHistoryItem,
): QueryHistoryItem[] {
  const clean = sanitizeHistoryItem(item);
  return clean
    ? [
        clean,
        ...history
          .map(sanitizeHistoryItem)
          .filter(
            (entry): entry is QueryHistoryItem =>
              entry !== null && entry.query !== clean.query,
          ),
      ].slice(0, QUERY_HISTORY_LIMIT)
    : history
        .map(sanitizeHistoryItem)
        .filter((entry): entry is QueryHistoryItem => entry !== null)
        .slice(0, QUERY_HISTORY_LIMIT);
}
