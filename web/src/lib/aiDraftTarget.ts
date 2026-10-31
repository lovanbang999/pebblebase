export interface QueryTabTarget {
  id: string;
  type: string;
  connectionId: string;
}

/** Prefer the active console, then the most recently listed console for the same source. */
export function findAIDraftConsole<T extends QueryTabTarget>(
  activeTab: T | null | undefined,
  tabs: T[],
  connectionId: string | undefined,
): T | undefined {
  if (activeTab?.type === "query") return activeTab;
  if (!connectionId) return undefined;
  return [...tabs]
    .reverse()
    .find((tab) => tab.type === "query" && tab.connectionId === connectionId);
}
