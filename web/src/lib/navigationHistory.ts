export interface NavigationLocation {
  tabId: string;
  selectedCell?: { column: string; rowIdentity?: string };
}

export interface NavigationHistory {
  entries: NavigationLocation[];
  cursor: number;
}

export const NAVIGATION_HISTORY_LIMIT = 100;

export const emptyNavigationHistory = (): NavigationHistory => ({
  entries: [],
  cursor: -1,
});

export function pushNavigation(
  history: NavigationHistory,
  location: NavigationLocation,
  limit = NAVIGATION_HISTORY_LIMIT,
): NavigationHistory {
  const current = history.entries[history.cursor];
  if (
    current?.tabId === location.tabId &&
    current.selectedCell?.column === location.selectedCell?.column &&
    current.selectedCell?.rowIdentity === location.selectedCell?.rowIdentity
  )
    return history;
  const entries = history.entries.slice(0, history.cursor + 1);
  entries.push(location);
  const overflow = Math.max(0, entries.length - limit);
  return {
    entries: entries.slice(overflow),
    cursor: entries.length - overflow - 1,
  };
}

export function pruneNavigation(
  history: NavigationHistory,
  openTabIds: readonly string[],
): NavigationHistory {
  const open = new Set(openTabIds);
  const entries = history.entries.filter((entry) => open.has(entry.tabId));
  if (entries.length === history.entries.length) return history;
  let cursor = 0;
  for (let index = 0; index < history.cursor; index++)
    if (open.has(history.entries[index]!.tabId)) cursor++;
  return {
    entries,
    cursor: entries.length ? Math.min(cursor, entries.length - 1) : -1,
  };
}

export function stepNavigation(
  history: NavigationHistory,
  direction: "back" | "forward",
  openTabIds: readonly string[],
): { history: NavigationHistory; location: NavigationLocation | null } {
  const open = new Set(openTabIds);
  const step = direction === "back" ? -1 : 1;
  for (
    let cursor = history.cursor + step;
    cursor >= 0 && cursor < history.entries.length;
    cursor += step
  ) {
    const location = history.entries[cursor]!;
    if (open.has(location.tabId))
      return { history: { ...history, cursor }, location };
  }
  return { history, location: null };
}
