import { useState, useEffect, useCallback } from "react";
import type { StudioTab, StudioTabState, TableSchema } from "../lib/types";

interface UseTabsOptions {
  connectionId: string | null;
  tables: TableSchema[];
}

const getTabsStorageKey = (connId: string) => `pb_tabs_${connId}`;
const getActiveTabStorageKey = (connId: string) => `pb_active_tab_${connId}`;

function loadStoredTabs(connectionId: string | null, tables: TableSchema[]): { tabs: StudioTab[]; activeTabId: string | null } {
  if (!connectionId) {
    return { tabs: [], activeTabId: null };
  }

  const savedTabsRaw = sessionStorage.getItem(getTabsStorageKey(connectionId));
  const savedActiveRaw = sessionStorage.getItem(getActiveTabStorageKey(connectionId));

  if (savedTabsRaw) {
    try {
      const parsedTabs: StudioTab[] = JSON.parse(savedTabsRaw);
      if (Array.isArray(parsedTabs) && parsedTabs.length > 0) {
        const activeExists = parsedTabs.some((t) => t.id === savedActiveRaw);
        return {
          tabs: parsedTabs,
          activeTabId: activeExists ? savedActiveRaw : parsedTabs[0].id,
        };
      }
    } catch {
      // invalid session cache
    }
  }

  // Default: Open the first table if available
  if (tables.length > 0) {
    const firstTable = tables[0].name;
    const initialTab: StudioTab = {
      id: `tab_table_${firstTable}`,
      type: "table",
      title: firstTable,
      tableName: firstTable,
      connectionId,
      state: {
        page: 0,
        pageSize: 50,
        filters: [],
        sortBy: "",
        sortDesc: false,
      },
    };
    return {
      tabs: [initialTab],
      activeTabId: initialTab.id,
    };
  }

  return { tabs: [], activeTabId: null };
}

export function useTabs({ connectionId, tables }: UseTabsOptions) {
  const [prevConnId, setPrevConnId] = useState<string | null>(connectionId);
  const [tabs, setTabs] = useState<StudioTab[]>(() => loadStoredTabs(connectionId, tables).tabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(() => loadStoredTabs(connectionId, tables).activeTabId);

  const [prevTablesCount, setPrevTablesCount] = useState<number>(tables.length);

  // If connection changed, adjust state during render
  if (connectionId !== prevConnId) {
    setPrevConnId(connectionId);
    setPrevTablesCount(tables.length);
    const restored = loadStoredTabs(connectionId, tables);
    setTabs(restored.tabs);
    setActiveTabId(restored.activeTabId);
  } else if (prevTablesCount === 0 && tables.length > 0) {
    setPrevTablesCount(tables.length);
    if (connectionId && tabs.length === 0) {
      const savedTabsRaw = sessionStorage.getItem(`pb_tabs_${connectionId}`);
      if (!savedTabsRaw) {
        const firstTable = tables[0].name;
        const initialTab: StudioTab = {
          id: `tab_table_${firstTable}`,
          type: "table",
          title: firstTable,
          tableName: firstTable,
          connectionId,
          state: {
            page: 0,
            pageSize: 50,
            filters: [],
            sortBy: "",
            sortDesc: false,
          },
        };
        setTabs([initialTab]);
        setActiveTabId(initialTab.id);
      }
    }
  }

  // Sync to sessionStorage
  useEffect(() => {
    if (!connectionId) return;

    if (tabs.length > 0) {
      sessionStorage.setItem(getTabsStorageKey(connectionId), JSON.stringify(tabs));
    } else {
      sessionStorage.removeItem(getTabsStorageKey(connectionId));
    }

    if (activeTabId) {
      sessionStorage.setItem(getActiveTabStorageKey(connectionId), activeTabId);
    } else {
      sessionStorage.removeItem(getActiveTabStorageKey(connectionId));
    }
  }, [tabs, activeTabId, connectionId]);

  // Open or switch to a table tab
  const openTableTab = useCallback(
    (tableName: string, openInNewTab = false, initialState?: Partial<StudioTabState>) => {
      if (!connectionId) return;

      if (!openInNewTab) {
        // If existing tab matches tableName, activate it
        const existing = tabs.find(
          (t) => t.connectionId === connectionId && t.type === "table" && t.tableName === tableName
        );
        if (existing) {
          setActiveTabId(existing.id);
          if (initialState) {
            setTabs((prev) =>
              prev.map((t) =>
                t.id === existing.id
                  ? {
                      ...t,
                      state: {
                        page: 0,
                        pageSize: 50,
                        filters: [],
                        sortBy: "",
                        sortDesc: false,
                        ...(t.state || {}),
                        ...initialState,
                      },
                    }
                  : t
              )
            );
          }
          return;
        }
      }

      // Create new tab
      const newTab: StudioTab = {
        id: `tab_table_${tableName}_${Date.now()}`,
        type: "table",
        title: tableName,
        tableName,
        connectionId,
        state: {
          page: 0,
          pageSize: 50,
          filters: [],
          sortBy: "",
          sortDesc: false,
          ...initialState,
        },
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    },
    [connectionId, tabs]
  );

  // Open a query console tab
  const openQueryTab = useCallback(
    (initialQuery?: string, customTitle?: string) => {
      if (!connectionId) return;

      const queryTabs = tabs.filter((t) => t.type === "query");
      const title = customTitle || `Console ${queryTabs.length + 1}`;

      const newTab: StudioTab = {
        id: `tab_query_${Date.now()}`,
        type: "query",
        title,
        connectionId,
        state: {
          page: 0,
          pageSize: 50,
          filters: [],
          sortBy: "",
          sortDesc: false,
          queryText: initialQuery,
        },
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
    },
    [connectionId, tabs]
  );

  // Open an ERD tab
  const openErdTab = useCallback(() => {
    if (!connectionId) return;

    const existing = tabs.find(
      (t) => t.connectionId === connectionId && t.type === "erd"
    );
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const newTab: StudioTab = {
      id: `tab_erd_${connectionId}`,
      type: "erd",
      title: "ERD Diagram",
      connectionId,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [connectionId, tabs]);

  // Close a specific tab
  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const index = prev.findIndex((t) => t.id === tabId);
        if (index === -1) return prev;

        const nextTabs = prev.filter((t) => t.id !== tabId);

        // If closing the currently active tab, compute next active tab
        if (activeTabId === tabId) {
          if (nextTabs.length > 0) {
            const nextActive = index > 0 ? nextTabs[index - 1] : nextTabs[0];
            setActiveTabId(nextActive.id);
          } else {
            setActiveTabId(null);
          }
        }

        return nextTabs;
      });
    },
    [activeTabId]
  );

  // Close all other tabs except target
  const closeOtherTabs = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id === tabId));
    setActiveTabId(tabId);
  }, []);

  // Close tabs to the right
  const closeTabsToRight = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;

        const nextTabs = prev.slice(0, idx + 1);
        // If current active tab was closed, switch to tabId
        if (!nextTabs.some((t) => t.id === activeTabId)) {
          setActiveTabId(tabId);
        }
        return nextTabs;
      });
    },
    [activeTabId]
  );

  // Duplicate an existing tab
  const duplicateTab = useCallback(
    (tabId: string) => {
      setTabs((prev) => {
        const idx = prev.findIndex((t) => t.id === tabId);
        if (idx === -1) return prev;

        const original = prev[idx];
        const copy: StudioTab = {
          ...original,
          id: `tab_${original.type}_copy_${Date.now()}`,
          title: `${original.title} (Copy)`,
          state: original.state ? { ...original.state, filters: [...original.state.filters] } : undefined,
        };

        const nextTabs = [...prev];
        nextTabs.splice(idx + 1, 0, copy);
        setActiveTabId(copy.id);
        return nextTabs;
      });
    },
    []
  );

  // Update state for active tab (page, filters, sortBy, sortDesc, queryText)
  const updateActiveTabState = useCallback(
    (partial: Partial<StudioTabState>) => {
      if (!activeTabId) return;

      setTabs((prev) =>
        prev.map((t) => {
          if (t.id === activeTabId) {
            return {
              ...t,
              state: {
                page: 0,
                pageSize: 50,
                filters: [],
                sortBy: "",
                sortDesc: false,
                ...(t.state || {}),
                ...partial,
              },
            };
          }
          return t;
        })
      );
    },
    [activeTabId]
  );

  const activeTab = tabs.find((t) => t.id === activeTabId) || null;

  return {
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    openTableTab,
    openQueryTab,
    openErdTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    duplicateTab,
    updateActiveTabState,
  };
}
