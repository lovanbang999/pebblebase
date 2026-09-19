export interface RecentItem {
  id: string;
  type: 'table' | 'query' | 'connection';
  title: string;
  subtitle?: string;
  timestamp: number;
}

import { STORAGE_KEYS, MAX_RECENT_ITEMS } from "@/constants";

const STORAGE_KEY = STORAGE_KEYS.RECENT_ITEMS;

export function getRecentItems(): RecentItem[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function addRecentItem(item: Omit<RecentItem, 'timestamp'>): RecentItem[] {
  try {
    const current = getRecentItems();
    const filtered = current.filter(
      (r) => !(r.type === item.type && r.id === item.id)
    );
    const newItem: RecentItem = {
      ...item,
      timestamp: Date.now(),
    };
    const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function clearRecentItems(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
