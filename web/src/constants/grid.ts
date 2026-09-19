/**
 * Grid, pagination, virtualizer, and query execution limits.
 */
export const DEFAULT_PAGE_SIZE = 50;

export const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export const DEFAULT_QUERY_LIMIT = 50;

export const VIRTUALIZER_ROW_HEIGHT = 37;

export const VIRTUALIZER_QUERY_ROW_HEIGHT = 36;

export const VIRTUALIZER_OVERSCAN = 10;

export const MAX_RECENT_ITEMS = 10;

export const SEED_CONFIG = {
  DEFAULT_COUNT: 10,
  MIN_COUNT: 1,
  MAX_COUNT: 500,
} as const;
