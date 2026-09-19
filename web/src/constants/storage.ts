/**
 * Centralized browser storage keys (localStorage and sessionStorage).
 * Preserves exact existing string literals for backward compatibility with active user data.
 */
export const STORAGE_KEYS = {
  THEME: "pb_theme",
  LANGUAGE: "pebblebase_language",
  AUTH: "pebblebase-auth",
  RECENT_ITEMS: "pebblebase_recent_items",
  onboarding: (userId: string) => `pebblebase_onboarding_completed_${userId}`,
  pinnedTables: (connId: string) => `pebblebase:pinned:${connId}`,
  tabs: (connId: string) => `pb_tabs_${connId}`,
  activeTab: (connId: string) => `pb_active_tab_${connId}`,
  queryTabs: (connId: string) => `pebblebase_query_tabs_${connId}`,
  queryHistory: (connId: string) => `pebblebase_query_history_${connId}`,
} as const;
