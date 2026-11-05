export interface MongoQueryHistoryItem {
  id: string;
  filter: string;
  project?: string;
  sort?: string;
  collation?: string;
  maxTimeMS?: number;
  timestamp: number;
}

const MAX_HISTORY_ITEMS = 15;

function getStorageKey(connId: string, table: string): string {
  return `pb_mongo_query_history_${connId}_${table}`;
}

export function getMongoQueryHistory(
  connId: string,
  table: string,
): MongoQueryHistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(getStorageKey(connId, table));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveMongoQueryHistory(
  connId: string,
  table: string,
  entry: Omit<MongoQueryHistoryItem, "id" | "timestamp">,
): void {
  if (typeof window === "undefined") return;
  const filter = entry.filter.trim();
  if (!filter && !entry.project && !entry.sort) return;

  try {
    const current = getMongoQueryHistory(connId, table);

    // Remove duplicates if the exact same query parameters already exist
    const filtered = current.filter(
      (item) =>
        item.filter !== filter ||
        item.project !== entry.project ||
        item.sort !== entry.sort ||
        item.collation !== entry.collation ||
        item.maxTimeMS !== entry.maxTimeMS,
    );

    const newItem: MongoQueryHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filter,
      project: entry.project?.trim() || undefined,
      sort: entry.sort?.trim() || undefined,
      collation: entry.collation?.trim() || undefined,
      maxTimeMS: entry.maxTimeMS || undefined,
      timestamp: Date.now(),
    };

    const updated = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(getStorageKey(connId, table), JSON.stringify(updated));
  } catch (err) {
    console.error("Failed to save Mongo query history:", err);
  }
}

export function clearMongoQueryHistory(connId: string, table: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(getStorageKey(connId, table));
  } catch (err) {
    console.error("Failed to clear Mongo query history:", err);
  }
}
