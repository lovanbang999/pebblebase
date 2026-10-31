import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Connection,
  ExplorerSelection,
  PersistedWorkspace,
  StudioTab,
  StudioTabState,
  TableSchema,
  WorkspaceToolWindows,
} from "../lib/types";
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from "@/constants";
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "@/constants/workspaceLayout";
import { useTranslation } from "react-i18next";

const DEFAULT_TOOL_WINDOWS: WorkspaceToolWindows = {
  database: true,
  scripts: false,
  output: false,
  ai: false,
};

function emptyWorkspace(): PersistedWorkspace {
  return {
    version: 1,
    tabs: [],
    activeTabId: null,
    selectedExplorerNode: null,
    expandedNodeIds: [],
    toolWindows: DEFAULT_TOOL_WINDOWS,
    sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
    initialized: false,
  };
}

function readWorkspace(): { workspace: PersistedWorkspace; hydrated: boolean } {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.WORKSPACE);
    if (!raw) return { workspace: emptyWorkspace(), hydrated: false };
    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.tabs) ||
      !Array.isArray(parsed.expandedNodeIds)
    ) {
      return { workspace: emptyWorkspace(), hydrated: false };
    }
    const tabs = parsed.tabs
      .filter(isStudioTab)
      .map((tab) => ({ ...tab, isDirty: false }));
    const activeTabId =
      typeof parsed.activeTabId === "string" &&
      tabs.some((tab) => tab.id === parsed.activeTabId)
        ? parsed.activeTabId
        : (tabs[0]?.id ?? null);
    return {
      workspace: {
        version: 1,
        tabs,
        activeTabId,
        selectedExplorerNode: isExplorerSelection(parsed.selectedExplorerNode)
          ? parsed.selectedExplorerNode
          : null,
        expandedNodeIds: parsed.expandedNodeIds.filter(
          (item): item is string => typeof item === "string",
        ),
        toolWindows: {
          ...DEFAULT_TOOL_WINDOWS,
          ...(parsed.toolWindows || {}),
        },
        sidebarWidth:
          typeof parsed.sidebarWidth === "number"
            ? Math.min(
                SIDEBAR_MAX_WIDTH,
                Math.max(SIDEBAR_MIN_WIDTH, parsed.sidebarWidth),
              )
            : SIDEBAR_DEFAULT_WIDTH,
        initialized: Boolean(parsed.initialized),
      },
      hydrated: true,
    };
  } catch {
    // Session storage can be unavailable or contain malformed JSON. Fall back
    // to the previous per-connection keys and rewrite the versioned snapshot.
    return { workspace: emptyWorkspace(), hydrated: false };
  }
}

function isExplorerSelection(value: unknown): value is ExplorerSelection {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const node = value as Record<string, unknown>;
  if (typeof node.connectionId !== "string") return false;
  if (node.kind === "connection") return true;
  return (
    node.kind === "table" &&
    typeof node.tableName === "string" &&
    (node.schemaName === undefined || typeof node.schemaName === "string")
  );
}

function isStudioTab(value: unknown): value is StudioTab {
  if (!value || typeof value !== "object") return false;
  const tab = value as Record<string, unknown>;
  return (
    typeof tab.id === "string" &&
    typeof tab.title === "string" &&
    typeof tab.connectionId === "string" &&
    ["table", "query", "ddl", "erd", "diff"].includes(String(tab.type))
  );
}

function randomObjectId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}

function objectIdentity(
  tab: Pick<
    StudioTab,
    "type" | "title" | "tableName" | "schemaName" | "objectId" | "state"
  >,
): string {
  if (tab.type === "table" || tab.type === "ddl") {
    return (
      tab.objectId ||
      `table:${tab.schemaName || ""}:${tab.tableName || tab.title}`
    );
  }
  if (tab.type === "erd") return "erd";
  if (tab.type === "diff") {
    return `diff:${tab.state?.diffSourceConnectionId || ""}:${tab.state?.diffTargetConnectionId || ""}`;
  }
  return `query:${tab.objectId || randomObjectId()}`;
}

export function stableTabId(
  connectionId: string,
  type: StudioTab["type"],
  identity: string,
): string {
  return `workspace:${encodeURIComponent(JSON.stringify([connectionId, type, identity]))}`;
}

function defaultTableState(): StudioTabState {
  return {
    page: 0,
    pageSize: DEFAULT_PAGE_SIZE,
    filters: [],
    sortBy: "",
    sortDesc: false,
  };
}

function normalizeLegacyTab(
  raw: unknown,
  connectionId: string,
): StudioTab | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<StudioTab>;
  if (
    typeof candidate.title !== "string" ||
    !["table", "query", "ddl", "erd", "diff"].includes(String(candidate.type))
  ) {
    return null;
  }

  const type = candidate.type as StudioTab["type"];
  const state = candidate.state || undefined;
  const tab: StudioTab = {
    id: "",
    type,
    title: candidate.title,
    connectionId,
    state: state
      ? {
          ...defaultTableState(),
          ...state,
          filters: Array.isArray(state.filters) ? state.filters : [],
        }
      : type === "table"
        ? defaultTableState()
        : undefined,
  };

  if (type === "table" || type === "ddl") {
    const tableName = candidate.tableName || candidate.title;
    if (!tableName.trim()) return null;
    tab.tableName = tableName;
    tab.schemaName = candidate.schemaName;
    // Existing table tabs are unique per table in the common case. Preserve a
    // legacy identity only for duplicated tabs so they remain distinct.
    tab.objectId = candidate.objectId;
  } else if (type === "query") {
    tab.objectId =
      candidate.objectId || `legacy:${candidate.id || candidate.title}`;
  } else if (type === "diff") {
    tab.objectId = candidate.objectId || `legacy:${candidate.id || "diff"}`;
  }
  const identity = objectIdentity(tab);
  tab.id = stableTabId(connectionId, type, identity);
  return tab;
}

function migrateLegacyWorkspace(connections: Connection[]): PersistedWorkspace {
  const workspace = emptyWorkspace();
  const activeByConnection = new Map<string, string | null>();
  const querySnapshots = new Map<string, unknown>();

  for (const connection of connections) {
    try {
      const rawTabs = sessionStorage.getItem(STORAGE_KEYS.tabs(connection.id));
      const parsed = rawTabs ? JSON.parse(rawTabs) : [];
      if (!Array.isArray(parsed)) continue;
      const usedIdentities = new Set<string>();
      const migrated: StudioTab[] = [];
      for (const raw of parsed) {
        const tab = normalizeLegacyTab(raw, connection.id);
        if (!tab) continue;
        if (tab.type === "diff") {
          const target = connections.find(
            (item) =>
              item.id !== connection.id &&
              item.type !== "mongodb" &&
              item.type !== "redis",
          );
          if (
            !target ||
            connection.type === "mongodb" ||
            connection.type === "redis"
          )
            continue;
          tab.state = {
            ...defaultTableState(),
            ...tab.state,
            diffSourceConnectionId: connection.id,
            diffTargetConnectionId: target.id,
          };
          tab.objectId = `diff:${connection.id}:${target.id}`;
          tab.id = stableTabId(connection.id, "diff", tab.objectId);
        }
        let identity = objectIdentity(tab);
        if (usedIdentities.has(identity)) {
          tab.objectId = `${tab.objectId || identity}:legacy:${(raw as StudioTab).id || randomObjectId()}`;
          identity = objectIdentity(tab);
          tab.id = stableTabId(connection.id, tab.type, identity);
        }
        usedIdentities.add(identity);
        migrated.push(tab);
      }
      workspace.tabs.push(...migrated);
      const activeId = sessionStorage.getItem(
        STORAGE_KEYS.activeTab(connection.id),
      );
      const legacyActive = parsed.find(
        (tab): tab is StudioTab => isStudioTab(tab) && tab.id === activeId,
      );
      const mappedActive = legacyActive
        ? migrated.find(
            (tab) =>
              tab.title === legacyActive.title &&
              tab.type === legacyActive.type &&
              (tab.tableName || "") === (legacyActive.tableName || ""),
          )?.id
        : undefined;
      activeByConnection.set(
        connection.id,
        mappedActive || migrated[0]?.id || null,
      );

      const rawQueries = sessionStorage.getItem(
        STORAGE_KEYS.queryTabs(connection.id),
      );
      if (rawQueries) querySnapshots.set(connection.id, JSON.parse(rawQueries));
    } catch {
      // Ignore malformed legacy entries and continue migrating other sources.
    }
  }

  // Preserve the previously active editor when consolidating several legacy
  // per-connection workspaces; prefer its connection over an arbitrary first
  // item returned by the connection API.
  const preferredConnectionId = workspace.tabs.find((tab) =>
    [...activeByConnection.values()].includes(tab.id),
  )?.connectionId;
  const selectedConnectionId = preferredConnectionId || connections[0]?.id;
  workspace.selectedExplorerNode = selectedConnectionId
    ? { kind: "connection", connectionId: selectedConnectionId }
    : null;
  workspace.activeTabId = selectedConnectionId
    ? (activeByConnection.get(selectedConnectionId) ?? null)
    : (workspace.tabs[0]?.id ?? null);

  // Preserve the old nested console draft/results in the new per-workspace-tab
  // storage namespace. Each outer query editor receives its own copy.
  for (const tab of workspace.tabs.filter((item) => item.type === "query")) {
    const legacy = querySnapshots.get(tab.connectionId);
    if (!legacy) continue;
    try {
      const snapshot = legacy as { tabs?: unknown[]; activeTabId?: string };
      const activeQuery = snapshot.tabs?.find(
        (item) =>
          item &&
          typeof item === "object" &&
          (item as { id?: string }).id === snapshot.activeTabId,
      ) as { query?: string } | undefined;
      if (typeof activeQuery?.query === "string") {
        tab.state = {
          ...defaultTableState(),
          ...tab.state,
          queryText: activeQuery.query,
        };
      }
      sessionStorage.setItem(
        STORAGE_KEYS.queryWorkspaceTabs(tab.connectionId, tab.id),
        JSON.stringify(legacy),
      );
    } catch {
      // Keep the outer tab draft even when its nested result cache is invalid.
    }
  }
  return workspace;
}

function sameWorkspace(a: PersistedWorkspace, b: PersistedWorkspace): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useTabs() {
  const { t } = useTranslation();
  const initialRef = useRef<ReturnType<typeof readWorkspace> | null>(null);
  if (!initialRef.current) initialRef.current = readWorkspace();
  const [workspace, setWorkspace] = useState(initialRef.current.workspace);
  const hydratedRef = useRef(initialRef.current.hydrated);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  useEffect(() => {
    if (!hydratedRef.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEYS.WORKSPACE, JSON.stringify(workspace));
    } catch (error) {
      console.warn("Failed to persist workspace session:", error);
    }
  }, [workspace]);

  const commit = useCallback(
    (updater: (current: PersistedWorkspace) => PersistedWorkspace) => {
      setWorkspace((current) => {
        const next = updater(current);
        workspaceRef.current = next;
        return sameWorkspace(current, next) ? current : next;
      });
    },
    [],
  );

  const reconcile = useCallback(
    (input: {
      connections: Connection[];
      tablesByConnection: Record<string, TableSchema[]>;
      loadedTableConnectionIds: string[];
      connectionsLoaded: boolean;
    }) => {
      if (!input.connectionsLoaded) return;
      const connections = input.connections;
      const byId = new Map(
        connections.map((connection) => [connection.id, connection]),
      );
      if (!hydratedRef.current) {
        const migrated = migrateLegacyWorkspace(connections);
        hydratedRef.current = true;
        commit(() => migrated);
      }
      const loadedTables = new Set(input.loadedTableConnectionIds);
      commit((current) => {
        const tabs = current.tabs.flatMap((tab) => {
          if (!byId.has(tab.connectionId)) return [];
          if (tab.type === "diff") {
            const from = tab.state?.diffSourceConnectionId;
            const to = tab.state?.diffTargetConnectionId;
            if (
              !from ||
              !to ||
              from === to ||
              !byId.has(from) ||
              !byId.has(to)
            ) {
              return [];
            }
          }
          if (tab.type === "table" || tab.type === "ddl") {
            if (!tab.tableName) return [];
            if (loadedTables.has(tab.connectionId)) {
              const tables = input.tablesByConnection[tab.connectionId] || [];
              if (
                !tables.some(
                  (table) =>
                    table.name === tab.tableName &&
                    (table.schema_name || "") === (tab.schemaName || ""),
                )
              )
                return [];
            }
          }
          return [tab];
        });
        const ids = new Set(tabs.map((tab) => tab.id));
        const selected = current.selectedExplorerNode;
        const selectionIsValid =
          selected === null ||
          (byId.has(selected.connectionId) &&
            (selected.kind !== "table" ||
              !loadedTables.has(selected.connectionId) ||
              (input.tablesByConnection[selected.connectionId] || []).some(
                (table) =>
                  table.name === selected.tableName &&
                  (table.schema_name || "") === (selected.schemaName || ""),
              )));
        const selectedExplorerNode = selectionIsValid
          ? selected ||
            (connections[0]
              ? { kind: "connection" as const, connectionId: connections[0].id }
              : null)
          : connections[0]
            ? { kind: "connection" as const, connectionId: connections[0].id }
            : null;
        const activeTabId =
          current.activeTabId && ids.has(current.activeTabId)
            ? current.activeTabId
            : (tabs[0]?.id ?? null);
        const next: PersistedWorkspace = {
          ...current,
          tabs,
          activeTabId,
          selectedExplorerNode,
          expandedNodeIds: current.expandedNodeIds.filter((key) => {
            const match = key.match(/^connection:([^:]+)/);
            if (!match) return true;
            try {
              return byId.has(decodeURIComponent(match[1]));
            } catch {
              return false;
            }
          }),
        };
        return next;
      });
    },
    [commit],
  );

  const selectExplorerConnection = useCallback(
    (connectionId: string) => {
      commit((current) => ({
        ...current,
        selectedExplorerNode: { kind: "connection", connectionId },
      }));
    },
    [commit],
  );

  const selectExplorerTable = useCallback(
    (connectionId: string, tableName: string, schemaName?: string) => {
      commit((current) => ({
        ...current,
        selectedExplorerNode: {
          kind: "table",
          connectionId,
          tableName,
          schemaName,
        },
      }));
    },
    [commit],
  );

  const setActiveTabId = useCallback(
    (tabId: string | null) => {
      commit((current) => ({
        ...current,
        activeTabId:
          tabId && current.tabs.some((tab) => tab.id === tabId)
            ? tabId
            : current.activeTabId,
      }));
    },
    [commit],
  );

  const openTableTab = useCallback(
    (
      connectionId: string,
      tableName: string,
      openInNewTab = false,
      initialState?: Partial<StudioTabState>,
      schemaName?: string,
    ) => {
      if (!connectionId || !tableName.trim()) return;
      const state = { ...defaultTableState(), ...initialState };
      commit((current) => {
        const existing =
          !openInNewTab &&
          current.tabs.find(
            (tab) =>
              tab.type === "table" &&
              tab.connectionId === connectionId &&
              tab.tableName === tableName &&
              (tab.schemaName || "") === (schemaName || ""),
          );
        const tab =
          existing ||
          (() => {
            const objectId = `table:${schemaName || ""}:${tableName}${openInNewTab ? `:instance:${randomObjectId()}` : ""}`;
            const nextTab: StudioTab = {
              id: stableTabId(connectionId, "table", objectId),
              type: "table",
              title: tableName,
              tableName,
              schemaName,
              objectId,
              connectionId,
              state,
            };
            return nextTab;
          })();
        const tabs = existing
          ? current.tabs.map((item) =>
              item.id === existing.id && initialState
                ? {
                    ...item,
                    state: {
                      ...defaultTableState(),
                      ...item.state,
                      ...initialState,
                    },
                  }
                : item,
            )
          : [...current.tabs, tab];
        return {
          ...current,
          tabs,
          activeTabId: tab.id,
          selectedExplorerNode: {
            kind: "table",
            connectionId,
            tableName,
            schemaName,
          },
          initialized: true,
        };
      });
    },
    [commit],
  );

  const openQueryTab = useCallback(
    (connectionId: string, initialQuery?: string, customTitle?: string) => {
      if (!connectionId) return;
      const objectId = randomObjectId();
      const tab: StudioTab = {
        id: stableTabId(connectionId, "query", `query:${objectId}`),
        objectId,
        type: "query",
        title: customTitle?.trim() || "Console",
        connectionId,
        state: { ...defaultTableState(), queryText: initialQuery },
      };
      commit((current) => ({
        ...current,
        tabs: [...current.tabs, tab],
        activeTabId: tab.id,
        selectedExplorerNode: { kind: "connection", connectionId },
        initialized: true,
      }));
      return tab.id;
    },
    [commit],
  );

  const openErdTab = useCallback(
    (connectionId: string) => {
      if (!connectionId) return;
      commit((current) => {
        const existing = current.tabs.find(
          (tab) => tab.type === "erd" && tab.connectionId === connectionId,
        );
        const tab = existing || {
          id: stableTabId(connectionId, "erd", "erd"),
          objectId: "erd",
          type: "erd" as const,
          title: "ERD Diagram",
          connectionId,
        };
        return {
          ...current,
          tabs: existing ? current.tabs : [...current.tabs, tab],
          activeTabId: tab.id,
          selectedExplorerNode: { kind: "connection", connectionId },
          initialized: true,
        };
      });
    },
    [commit],
  );

  const openDiffTab = useCallback(
    (sourceConnectionId: string, targetConnectionId: string) => {
      if (
        !sourceConnectionId ||
        !targetConnectionId ||
        sourceConnectionId === targetConnectionId
      )
        return;
      const identity = `diff:${sourceConnectionId}:${targetConnectionId}`;
      const tab: StudioTab = {
        id: stableTabId(sourceConnectionId, "diff", identity),
        objectId: identity,
        type: "diff",
        title: "Schema Diff",
        connectionId: sourceConnectionId,
        state: {
          ...defaultTableState(),
          diffSourceConnectionId: sourceConnectionId,
          diffTargetConnectionId: targetConnectionId,
        },
      };
      commit((current) => {
        const existing = current.tabs.find((item) => item.id === tab.id);
        return {
          ...current,
          tabs: existing ? current.tabs : [...current.tabs, tab],
          activeTabId: tab.id,
          selectedExplorerNode: {
            kind: "connection",
            connectionId: sourceConnectionId,
          },
          initialized: true,
        };
      });
    },
    [commit],
  );

  const initializeWorkspace = useCallback(
    (connectionId: string, tables: TableSchema[]) => {
      if (!connectionId) return;
      commit((current) => {
        if (current.initialized || current.tabs.length > 0)
          return { ...current, initialized: true };
        const firstTable = tables[0];
        if (!firstTable) return { ...current, initialized: true };
        const tab: StudioTab = {
          id: stableTabId(
            connectionId,
            "table",
            `table:${firstTable.schema_name || ""}:${firstTable.name}`,
          ),
          objectId: `table:${firstTable.schema_name || ""}:${firstTable.name}`,
          type: "table",
          title: firstTable.name,
          tableName: firstTable.name,
          schemaName: firstTable.schema_name,
          connectionId,
          state: defaultTableState(),
        };
        return {
          ...current,
          tabs: [tab],
          activeTabId: tab.id,
          selectedExplorerNode: {
            kind: "table",
            connectionId,
            tableName: firstTable.name,
            schemaName: firstTable.schema_name,
          },
          initialized: true,
        };
      });
    },
    [commit],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const closingTab = workspaceRef.current.tabs.find(
        (tab) => tab.id === tabId,
      );
      if (
        closingTab?.isDirty &&
        !window.confirm(
          t(
            "tabs.confirmCloseDirty",
            "This tab has unsaved staged changes. Close it and discard them?",
          ),
        )
      )
        return;
      commit((current) => {
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) return current;
        const tabs = current.tabs.filter((tab) => tab.id !== tabId);
        const activeTabId =
          current.activeTabId === tabId
            ? (tabs[Math.max(0, index - 1)]?.id ?? null)
            : current.activeTabId;
        const closing = current.tabs[index];
        if (closing.type === "query") {
          try {
            sessionStorage.removeItem(
              STORAGE_KEYS.queryWorkspaceTabs(closing.connectionId, closing.id),
            );
          } catch {
            /* ignore */
          }
        }
        return { ...current, tabs, activeTabId };
      });
    },
    [commit, t],
  );

  const closeAllTabs = useCallback(() => {
    if (
      workspaceRef.current.tabs.some((tab) => tab.isDirty) &&
      !window.confirm(
        t(
          "tabs.confirmCloseAllDirty",
          "Tabs have unsaved staged changes. Close all tabs and discard them?",
        ),
      )
    )
      return;
    for (const tab of workspaceRef.current.tabs) {
      if (tab.type === "query") {
        try {
          sessionStorage.removeItem(
            STORAGE_KEYS.queryWorkspaceTabs(tab.connectionId, tab.id),
          );
        } catch {
          /* Ignore unavailable session storage. */
        }
      }
    }
    commit((current) => ({
      ...current,
      tabs: [],
      activeTabId: null,
      initialized: true,
    }));
  }, [commit, t]);

  const closeOtherTabs = useCallback(
    (tabId: string) => {
      if (
        workspaceRef.current.tabs.some(
          (tab) => tab.id !== tabId && tab.isDirty,
        ) &&
        !window.confirm(
          t(
            "tabs.confirmCloseOthersDirty",
            "Other tabs have unsaved staged changes. Close them and discard those changes?",
          ),
        )
      )
        return;
      commit((current) => {
        const target = current.tabs.find((tab) => tab.id === tabId);
        if (!target) return current;
        for (const tab of current.tabs) {
          if (tab.id !== tabId && tab.type === "query") {
            try {
              sessionStorage.removeItem(
                STORAGE_KEYS.queryWorkspaceTabs(tab.connectionId, tab.id),
              );
            } catch {
              /* ignore */
            }
          }
        }
        return { ...current, tabs: [target], activeTabId: tabId };
      });
    },
    [commit, t],
  );

  const closeTabsToRight = useCallback(
    (tabId: string) => {
      const currentIndex = workspaceRef.current.tabs.findIndex(
        (tab) => tab.id === tabId,
      );
      if (
        workspaceRef.current.tabs
          .slice(currentIndex + 1)
          .some((tab) => tab.isDirty) &&
        !window.confirm(
          t(
            "tabs.confirmCloseRightDirty",
            "Tabs to the right have unsaved staged changes. Close them and discard those changes?",
          ),
        )
      )
        return;
      commit((current) => {
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) return current;
        const tabs = current.tabs.slice(0, index + 1);
        for (const tab of current.tabs.slice(index + 1)) {
          if (tab.type === "query") {
            try {
              sessionStorage.removeItem(
                STORAGE_KEYS.queryWorkspaceTabs(tab.connectionId, tab.id),
              );
            } catch {
              /* ignore */
            }
          }
        }
        return {
          ...current,
          tabs,
          activeTabId: tabs.some((tab) => tab.id === current.activeTabId)
            ? current.activeTabId
            : tabId,
        };
      });
    },
    [commit, t],
  );

  const duplicateTab = useCallback(
    (tabId: string) => {
      commit((current) => {
        const index = current.tabs.findIndex((tab) => tab.id === tabId);
        if (index < 0) return current;
        const original = current.tabs[index];
        const objectId = `${original.objectId || objectIdentity(original)}:copy:${randomObjectId()}`;
        const copy: StudioTab = {
          ...original,
          isDirty: false,
          id: stableTabId(original.connectionId, original.type, objectId),
          objectId,
          title: `${original.title} (Copy)`,
          state: original.state
            ? {
                ...original.state,
                filters: [...(original.state.filters || [])],
              }
            : undefined,
        };
        const tabs = [...current.tabs];
        tabs.splice(index + 1, 0, copy);
        return { ...current, tabs, activeTabId: copy.id };
      });
    },
    [commit],
  );

  const updateTabState = useCallback(
    (tabId: string, partial: Partial<StudioTabState>) => {
      commit((current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                state: { ...defaultTableState(), ...tab.state, ...partial },
              }
            : tab,
        ),
      }));
    },
    [commit],
  );

  const setTabDirty = useCallback(
    (tabId: string, isDirty: boolean) => {
      commit((current) => ({
        ...current,
        tabs: current.tabs.map((tab) =>
          tab.id === tabId ? { ...tab, isDirty } : tab,
        ),
      }));
    },
    [commit],
  );

  const updateActiveTabState = useCallback(
    (partial: Partial<StudioTabState>) => {
      const id = workspaceRef.current.activeTabId;
      if (id) updateTabState(id, partial);
    },
    [updateTabState],
  );

  const reorderTabs = useCallback(
    (sourceIndex: number, destinationIndex: number) => {
      commit((current) => {
        if (
          sourceIndex < 0 ||
          sourceIndex >= current.tabs.length ||
          destinationIndex < 0 ||
          destinationIndex >= current.tabs.length ||
          sourceIndex === destinationIndex
        )
          return current;
        const tabs = [...current.tabs];
        const [moved] = tabs.splice(sourceIndex, 1);
        if (!moved) return current;
        tabs.splice(destinationIndex, 0, moved);
        return { ...current, tabs };
      });
    },
    [commit],
  );

  const closeConnectionTabs = useCallback(
    (connectionId: string, skipDirtyPrompt = false) => {
      const current = workspaceRef.current;
      const removed = current.tabs.filter(
        (tab) =>
          tab.connectionId === connectionId ||
          tab.state?.diffSourceConnectionId === connectionId ||
          tab.state?.diffTargetConnectionId === connectionId,
      );
      if (
        !skipDirtyPrompt &&
        removed.some((tab) => tab.isDirty) &&
        !window.confirm(
          t(
            "tabs.confirmCloseConnectionDirty",
            "This connection has tabs with unsaved staged changes. Close them and discard those changes?",
          ),
        )
      )
        return 0;
      for (const tab of removed) {
        if (tab.type === "query") {
          try {
            sessionStorage.removeItem(
              STORAGE_KEYS.queryWorkspaceTabs(tab.connectionId, tab.id),
            );
          } catch {
            /* ignore */
          }
        }
      }
      commit((state) => {
        const tabs = state.tabs.filter(
          (tab) => !removed.some((item) => item.id === tab.id),
        );
        return {
          ...state,
          tabs,
          activeTabId: tabs.some((tab) => tab.id === state.activeTabId)
            ? state.activeTabId
            : (tabs[0]?.id ?? null),
          selectedExplorerNode:
            state.selectedExplorerNode?.connectionId === connectionId
              ? null
              : state.selectedExplorerNode,
          expandedNodeIds: state.expandedNodeIds.filter(
            (item) => !item.includes(encodeURIComponent(connectionId)),
          ),
        };
      });
      return removed.length;
    },
    [commit, t],
  );

  const setExpandedNodeIds = useCallback(
    (expandedNodeIds: string[]) => {
      commit((current) => ({
        ...current,
        expandedNodeIds: [...new Set(expandedNodeIds)],
      }));
    },
    [commit],
  );

  const setToolWindows = useCallback(
    (toolWindows: Partial<WorkspaceToolWindows>) => {
      commit((current) => ({
        ...current,
        toolWindows: { ...current.toolWindows, ...toolWindows },
      }));
    },
    [commit],
  );

  const setSidebarWidth = useCallback(
    (sidebarWidth: number) => {
      commit((current) => ({
        ...current,
        sidebarWidth: Math.min(
          SIDEBAR_MAX_WIDTH,
          Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth),
        ),
      }));
    },
    [commit],
  );

  const activeTab = useMemo(
    () =>
      workspace.tabs.find((tab) => tab.id === workspace.activeTabId) || null,
    [workspace.tabs, workspace.activeTabId],
  );

  return {
    tabs: workspace.tabs,
    activeTabId: workspace.activeTabId,
    activeTab,
    selectedExplorerNode: workspace.selectedExplorerNode,
    expandedNodeIds: workspace.expandedNodeIds,
    toolWindows: workspace.toolWindows,
    sidebarWidth: workspace.sidebarWidth,
    setActiveTabId,
    selectExplorerConnection,
    selectExplorerTable,
    reconcile,
    openTableTab,
    openQueryTab,
    openErdTab,
    openDiffTab,
    initializeWorkspace,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToRight,
    closeConnectionTabs,
    duplicateTab,
    reorderTabs,
    updateTabState,
    setTabDirty,
    updateActiveTabState,
    setExpandedNodeIds,
    setToolWindows,
    setSidebarWidth,
  };
}
