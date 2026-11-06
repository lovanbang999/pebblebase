import { useNamedWorkspaces } from "@/hooks/useNamedWorkspaces";
import { WorkspaceControl } from "@/components/layout/WorkspaceControl";
import { findAIDraftConsole } from "@/lib/aiDraftTarget";
import { restoreFindDialogFocus } from "@/lib/findDialogFocus";
import type { FindMatch } from "@/lib/findEverywhere";
import {
  emptyWorkspaceEditor,
  readWorkspaceSnapshot,
  scopeWorkspaceSnapshot,
  writeWorkspaceSnapshot,
  workspaceSnapshotKey,
  selectWorkspaceConnections,
  type WorkspaceAction,
} from "@/lib/namedWorkspaces";
import { canManageSettings } from "@/lib/auth";
import {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  lazy,
  Suspense,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ActivityRail } from "@/components/layout/ActivityRail";
import { RightActivityRail } from "@/components/layout/RightActivityRail";
import { DatabaseExplorer } from "@/components/layout/DatabaseExplorer";
import { StatusBar } from "@/components/layout/StatusBar";
import { ScriptsToolWindow } from "@/components/layout/ScriptsToolWindow";
import type { OperationEvent } from "@/components/layout/OutputPanel";
import {
  sanitizeOperationMessage,
  type OperationEventInput,
} from "@/lib/operationEvents";
import {
  ACTIVITY_RAIL_WIDTH,
  TITLEBAR_HEIGHT,
} from "@/constants/workspaceLayout";
import type {
  Connection,
  SavedQuery,
  StudioTabState,
  TableSchema,
} from "./lib/types";
import {
  TabBar,
  DesktopTitleBar,
  CommandPalette,
  StudioModals,
  StudioTabContent,
} from "@/components/layout";
import {
  emptyNavigationHistory,
  pruneNavigation,
  pushNavigation,
  stepNavigation,
  type NavigationHistory,
} from "@/lib/navigationHistory";
import {
  ErrorBanner,
  ErrorBoundary,
  OfflineRecoveryBanner,
} from "@/components/common";
import { AuthGuard } from "@/components/auth";
import {
  getRecentItems,
  addRecentItem,
  type RecentItem,
} from "./lib/recentItems";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
} from "@/components/ui/sidebar";
import { usePebblebaseStudio } from "./hooks/usePebblebaseStudio";
import { useTabs } from "./hooks/useTabs";
import { useStudioKeyboardShortcuts } from "./hooks/useStudioKeyboardShortcuts";
import { useStudioCommands } from "./hooks/useStudioCommands";
import { useAuthStore } from "./lib/auth";
import { fetchSavedQueries } from "./lib/api";
import { isDesktopApp } from "./lib/platform";
import { useUpdateStore } from "./lib/updateStore";
import { STORAGE_KEYS } from "@/constants";

const OutputPanel = lazy(() =>
  import("@/components/layout/OutputPanel").then((module) => ({
    default: module.OutputPanel,
  })),
);

const AIAssistantPanel = lazy(() =>
  import("@/components/layout/AIAssistantPanel").then((module) => ({
    default: module.AIAssistantPanel,
  })),
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
function PebblebaseStudio() {
  const isDesktop = isDesktopApp();
  const {
    isDialogOpen: isUpdateDialogOpen,
    setDialogOpen: setIsUpdateDialogOpen,
    updateInfo,
    isChecking: isCheckingUpdate,
    manualCheck: handleCheckUpdate,
    openDialogAndCheck,
  } = useUpdateStore();
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  // Shared admin panel tab — 'password' when triggered from user menu
  const [adminPanelDefaultTab, setAdminPanelDefaultTab] = useState<
    "users" | "password"
  >("users");

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFindEverywhereOpen, setIsFindEverywhereOpen] = useState(false);
  const [isRunFromLogOpen, setIsRunFromLogOpen] = useState(false);
  const [findInitialValue, setFindInitialValue] = useState("");
  const findReturnFocus = useRef<HTMLElement | null>(null);
  const openFindEverywhere = useCallback((value?: string) => {
    const activeId = activeTabRef.current?.id;
    const selectedGridCell = activeId
      ? document.querySelector<HTMLElement>(
          `[data-table-workspace="${CSS.escape(activeId)}"] [data-focused="true"]`,
        )
      : null;
    findReturnFocus.current =
      selectedGridCell ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    if (value !== undefined) setFindInitialValue(value);
    setIsFindEverywhereOpen(true);
  }, []);
  const closeFindEverywhere = useCallback(() => {
    setIsFindEverywhereOpen(false);
    window.requestAnimationFrame(() =>
      restoreFindDialogFocus(findReturnFocus.current),
    );
  }, []);
  const findFocusedValues = useRef<Record<string, string | undefined>>({});
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistory>(
    emptyNavigationHistory,
  );
  const selectedCells = useRef<
    Record<string, { column: string; rowIdentity?: string }>
  >({});
  const previousNavigationTab = useRef<string | null>(null);
  const applyingNavigation = useRef(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [operationEvents, setOperationEvents] = useState<OperationEvent[]>([]);
  const [notifications, setNotifications] = useState<
    (OperationEvent & { read: boolean })[]
  >([]);
  const [isNotificationPanelOpen, setIsNotificationPanelOpen] = useState(false);
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [recentItems, setRecentItems] = useState<RecentItem[]>(() =>
    getRecentItems(),
  );

  const isDefaultPassword = useAuthStore((s) => s.isDefaultPassword);
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    const handleOperationEvent = (event: Event) => {
      const input = (event as CustomEvent<OperationEventInput>).detail;
      if (
        !input ||
        typeof input.kind !== "string" ||
        typeof input.title !== "string" ||
        typeof input.message !== "string" ||
        !["success", "info", "warning", "error"].includes(input.severity)
      )
        return;
      const safeEvent: OperationEvent = {
        id:
          globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        kind: input.kind.slice(0, 64),
        title: sanitizeOperationMessage(input.title),
        message: sanitizeOperationMessage(input.message),
        severity: input.severity,
        connectionId: input.connectionId,
        connectionName: input.connectionName
          ? sanitizeOperationMessage(input.connectionName)
          : undefined,
        tabId: input.tabId,
        timestamp: Date.now(),
      };
      setOperationEvents((previous) => [safeEvent, ...previous].slice(0, 200));
      if (safeEvent.severity === "error" || safeEvent.severity === "warning") {
        setNotifications((previous) => {
          const duplicate = previous.some(
            (item) =>
              item.kind === safeEvent.kind &&
              item.connectionId === safeEvent.connectionId &&
              item.connectionName === safeEvent.connectionName &&
              item.message === safeEvent.message &&
              safeEvent.timestamp - item.timestamp < 10000,
          );
          return duplicate
            ? previous
            : [{ ...safeEvent, read: false }, ...previous].slice(0, 50);
        });
      }
    };
    window.addEventListener("pb:operation-event", handleOperationEvent);
    return () =>
      window.removeEventListener("pb:operation-event", handleOperationEvent);
  }, []);

  const [isOnboardingWelcomeOpen, setIsOnboardingWelcomeOpen] = useState(false);
  const [isSpotlightTourActive, setIsSpotlightTourActive] = useState(false);

  // Check first-time login for onboarding tour
  // Check first-time login for onboarding tour (depend on userId rather than full user object)
  useEffect(() => {
    const userId = currentUser?.id;
    if (!userId) return;
    const storageKey = STORAGE_KEYS.onboarding(userId);
    const hasCompleted = localStorage.getItem(storageKey);
    if (!hasCompleted) {
      const timer = setTimeout(() => {
        setIsOnboardingWelcomeOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentUser?.id]);

  const workspace = useTabs();
  const { snapshot: editorSnapshot, restoreWorkspace: restoreEditorSnapshot } =
    workspace;
  const namedWorkspaces = useNamedWorkspaces();
  const {
    ready: workspaceConfigReady,
    scopeConnections: selectNamedConnections,
    scopeId: activeScopeId,
    switchScope: setNamedScope,
    refresh: refreshNamedWorkspaces,
    workspaces: workspaceDefinitions,
  } = namedWorkspaces;
  const [workspaceManagerOpen, setWorkspaceManagerOpen] = useState(false);
  const [scopeRevision, setScopeRevision] = useState(0);
  const restoredScope = useRef<string | null>(null);
  const skipSnapshotWrite = useRef(false);
  const didDefaultExpandExplorer = useRef(false);
  const {
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    openTableTab,
    openQueryTab,
    openErdTab,
    openDiffTab,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToRight,
    closeConnectionTabs,
    duplicateTab,
    reorderTabs,
    updateTabState,
    setTabDirty,
    toolWindows,
    sidebarWidth,
    setSidebarWidth,
    setToolWindows,
    selectedExplorerNode,
    expandedNodeIds,
    setExpandedNodeIds,
    selectExplorerConnection,
    selectExplorerTable,
    reconcile,
    initializeWorkspace,
  } = workspace;

  useEffect(() => {
    const handleDraftDirty = (event: Event) => {
      const detail = (event as CustomEvent<{ tabId: string; isDirty: boolean }>)
        .detail;
      if (detail?.tabId) setTabDirty(detail.tabId, detail.isDirty);
    };
    window.addEventListener("pb:table-draft-dirty", handleDraftDirty);
    window.addEventListener("pb:console-transaction-dirty", handleDraftDirty);
    return () => {
      window.removeEventListener("pb:table-draft-dirty", handleDraftDirty);
      window.removeEventListener(
        "pb:console-transaction-dirty",
        handleDraftDirty,
      );
    };
  }, [setTabDirty]);
  const { t } = useTranslation();
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [rowActionContext, setRowActionContext] = useState<{
    connectionId: string;
    tableName: string;
    tabId: string;
  } | null>(null);

  const {
    theme,
    toggleTheme,
    connections,
    isLoadingConnections,
    connectionsReady,
    selectedConnection,
    selectedConnectionId,
    activeConnection,
    activeTables,
    tablesByConnection,
    tableStatusByConnection,
    loadedTableConnectionIds,
    rowsByTabId,
    isLoadingRows,
    refreshConnectionTables,
    activeErrorMessage,
    setTabError,
    handleDismissBanner,
    handleRetry,
    isRetrying,
    isConnModalOpen,
    setIsConnModalOpen,
    cloningConnection,
    setCloningConnection,
    editingConnection,
    setEditingConnection,
    isRowModalOpen,
    setIsRowModalOpen,
    editingRow,
    setEditingRow,
    handleCreateConnection,
    handleUpdateConnection,
    handleDeleteConnection,
    handleSaveRow,
    handleDeleteRow,
  } = usePebblebaseStudio({
    tabs,
    activeTab,
    selectedExplorerNode,
    expandedNodeIds,
    scopeConnections: selectNamedConnections,
  });

  const scopedConnections = useMemo(
    () => selectNamedConnections(connections),
    [selectNamedConnections, connections],
  );
  const scopedConnectionIds = useMemo(
    () => scopedConnections.map((connection) => connection.id),
    [scopedConnections],
  );
  const scopeKey = `${namedWorkspaces.scopeId}:${scopeRevision}`;
  useEffect(() => {
    if (
      !namedWorkspaces.ready ||
      !connectionsReady ||
      restoredScope.current === scopeKey
    )
      return;
    const saved = readWorkspaceSnapshot(namedWorkspaces.scopeId);
    const previous = restoredScope.current;
    const current = previous?.startsWith(`${namedWorkspaces.scopeId}:`)
      ? editorSnapshot
      : (saved?.editor ??
        (!previous && namedWorkspaces.scopeId === "default"
          ? editorSnapshot
          : emptyWorkspaceEditor(editorSnapshot)));
    didDefaultExpandExplorer.current = true;
    restoredScope.current = scopeKey;
    skipSnapshotWrite.current = true;
    restoreEditorSnapshot(scopeWorkspaceSnapshot(current, scopedConnectionIds));
    setNavigationHistory(saved?.navigation ?? emptyNavigationHistory());
    previousNavigationTab.current = saved?.editor.activeTabId ?? null;
  }, [
    namedWorkspaces.ready,
    namedWorkspaces.scopeId,
    connectionsReady,
    scopeKey,
    scopedConnectionIds,
    editorSnapshot,
    restoreEditorSnapshot,
  ]);
  useEffect(() => {
    if (
      !namedWorkspaces.ready ||
      !connectionsReady ||
      restoredScope.current !== scopeKey
    )
      return;
    if (skipSnapshotWrite.current) {
      skipSnapshotWrite.current = false;
      return;
    }
    writeWorkspaceSnapshot(
      namedWorkspaces.scopeId,
      editorSnapshot,
      scopedConnectionIds,
      navigationHistory,
    );
  }, [
    namedWorkspaces.ready,
    namedWorkspaces.scopeId,
    connectionsReady,
    scopeKey,
    editorSnapshot,
    scopedConnectionIds,
    navigationHistory,
  ]);
  useEffect(() => {
    const openIds = tabs.map((tab) => tab.id);
    setNavigationHistory((history) => pruneNavigation(history, openIds));
    if (activeTabId && previousNavigationTab.current !== activeTabId) {
      previousNavigationTab.current = activeTabId;
      if (!applyingNavigation.current) {
        setNavigationHistory((history) =>
          pushNavigation(history, {
            tabId: activeTabId,
            selectedCell: selectedCells.current[activeTabId],
          }),
        );
      }
      applyingNavigation.current = false;
    }
  }, [activeTabId, tabs]);
  const navigateHistory = useCallback(
    (direction: "back" | "forward") => {
      const step = stepNavigation(
        navigationHistory,
        direction,
        tabsRef.current.map((tab) => tab.id),
      );
      if (!step.location) return;
      setNavigationHistory(step.history);
      const sameTab = activeTabRef.current?.id === step.location.tabId;
      applyingNavigation.current = !sameTab;
      setActiveTabId(step.location.tabId);
      if (sameTab) applyingNavigation.current = false;
      window.requestAnimationFrame(() =>
        window.dispatchEvent(
          new CustomEvent("pb:restore-cell", {
            detail: {
              tabId: step.location!.tabId,
              cell: step.location!.selectedCell,
            },
          }),
        ),
      );
    },
    [navigationHistory, setActiveTabId],
  );
  const canNavigateBack =
    stepNavigation(
      navigationHistory,
      "back",
      tabs.map((tab) => tab.id),
    ).location !== null;
  const canNavigateForward =
    stepNavigation(
      navigationHistory,
      "forward",
      tabs.map((tab) => tab.id),
    ).location !== null;
  const confirmWorkspaceSwitch = useCallback(
    () =>
      !tabs.some((tab) => tab.isDirty) ||
      window.confirm(t("workspaces.confirmSwitch")),
    [tabs, t],
  );
  const switchNamedWorkspace = useCallback(
    (id: string) => {
      if (
        !workspaceConfigReady ||
        !connectionsReady ||
        id === activeScopeId ||
        !confirmWorkspaceSwitch()
      )
        return false;
      if (
        !writeWorkspaceSnapshot(
          activeScopeId,
          editorSnapshot,
          scopedConnectionIds,
          navigationHistory,
        )
      ) {
        setWorkspaceNotice(t("workspaces.snapshotFailed"));
        return false;
      }
      const savedTarget = readWorkspaceSnapshot(id);
      const target =
        savedTarget?.editor ?? emptyWorkspaceEditor(editorSnapshot);
      const allowed = selectWorkspaceConnections(
        connections,
        workspaceDefinitions,
        id,
        id === "all",
      ).map((connection) => connection.id);
      restoredScope.current = `${id}:${scopeRevision}`;
      skipSnapshotWrite.current = true;
      restoreEditorSnapshot(scopeWorkspaceSnapshot(target, allowed));
      setNavigationHistory(savedTarget?.navigation ?? emptyNavigationHistory());
      previousNavigationTab.current = target.activeTabId;
      setIsCommandPaletteOpen(false);
      setNamedScope(id);
      return true;
    },
    [
      workspaceConfigReady,
      connectionsReady,
      t,
      activeScopeId,
      confirmWorkspaceSwitch,
      editorSnapshot,
      restoreEditorSnapshot,
      scopedConnectionIds,
      navigationHistory,
      connections,
      workspaceDefinitions,
      scopeRevision,
      setNamedScope,
    ],
  );
  const mutateNamedWorkspace = async (
    action: WorkspaceAction,
  ): Promise<boolean> => {
    if (!workspaceConfigReady || !connectionsReady) return false;
    const removed =
      action.type === "update" &&
      action.workspace.id === namedWorkspaces.activeId &&
      !namedWorkspaces.showAll &&
      namedWorkspaces.active?.connectionIds.some(
        (id) => !action.workspace.connectionIds.includes(id),
      );
    const changesScope =
      action.type === "create" ||
      (action.type === "delete" && action.id === namedWorkspaces.activeId) ||
      removed;
    if (changesScope && !confirmWorkspaceSwitch()) return false;
    if (
      !writeWorkspaceSnapshot(
        namedWorkspaces.scopeId,
        editorSnapshot,
        scopedConnectionIds,
        navigationHistory,
      ) &&
      changesScope
    ) {
      setWorkspaceNotice(t("workspaces.snapshotFailed"));
      return false;
    }
    await namedWorkspaces.mutate(action);
    if (removed) setScopeRevision((revision) => revision + 1);
    if (action.type === "delete")
      try {
        localStorage.removeItem(workspaceSnapshotKey(action.id));
      } catch (err) {
        console.debug(
          "Failed to remove workspace snapshot from localStorage:",
          err,
        );
      }
    return true;
  };

  const displayConnection = activeConnection || selectedConnection;
  const handleOpenQueryForExplorer = useCallback(
    (query?: string, title?: string) => {
      const connectionId = selectedConnection?.id || activeConnection?.id;
      const connection = connections.find((item) => item.id === connectionId);
      if (connectionId && connection) openQueryTab(connectionId, query, title);
    },
    [selectedConnection?.id, activeConnection?.id, connections, openQueryTab],
  );
  const handleOpenQueryForConnection = useCallback(
    (connectionId: string, query?: string, title?: string) => {
      if (connections.some((item) => item.id === connectionId))
        openQueryTab(connectionId, query, title);
    },
    [connections, openQueryTab],
  );
  const handleOpenErdForExplorer = useCallback(() => {
    const connectionId = selectedConnection?.id || activeConnection?.id;
    if (
      connectionId &&
      connections.find((item) => item.id === connectionId)?.type !== "redis"
    )
      openErdTab(connectionId);
  }, [selectedConnection?.id, activeConnection?.id, connections, openErdTab]);
  const handleOpenDiffForExplorer = useCallback(() => {
    const preferred = activeConnection || selectedConnection;
    const relational = connections.filter(
      (connection) =>
        connection.type !== "mongodb" && connection.type !== "redis",
    );
    const source =
      preferred &&
      relational.some((connection) => connection.id === preferred.id)
        ? preferred
        : relational[0];
    const target = relational.find(
      (connection) => connection.id !== source?.id,
    );
    if (source && target) openDiffTab(source.id, target.id);
  }, [activeConnection, selectedConnection, connections, openDiffTab]);
  const handleOpenTableForConnection = useCallback(
    (
      connectionId: string,
      tableName: string,
      openInNewTab = false,
      initialState?: Partial<StudioTabState>,
    ) => {
      openTableTab(connectionId, tableName, openInNewTab, initialState);
    },
    [openTableTab],
  );

  useEffect(() => {
    reconcile({
      connections,
      tablesByConnection,
      loadedTableConnectionIds,
      connectionsLoaded: connectionsReady,
    });
  }, [
    connections,
    tablesByConnection,
    loadedTableConnectionIds,
    connectionsReady,
    reconcile,
  ]);

  useEffect(() => {
    if (isLoadingConnections || didDefaultExpandExplorer.current) return;
    didDefaultExpandExplorer.current = true;
    if (expandedNodeIds.length > 0 || !selectedConnectionId) return;
    setExpandedNodeIds([
      `connection:${encodeURIComponent(selectedConnectionId)}`,
    ]);
  }, [
    isLoadingConnections,
    expandedNodeIds.length,
    selectedConnectionId,
    setExpandedNodeIds,
  ]);

  useEffect(() => {
    if (
      !isLoadingConnections &&
      selectedConnection &&
      !activeTab &&
      tabs.length === 0
    ) {
      const selectedTablesQuery =
        tableStatusByConnection[selectedConnection.id];
      if (selectedTablesQuery?.isSuccess) {
        initializeWorkspace(
          selectedConnection.id,
          tablesByConnection[selectedConnection.id] || [],
        );
      }
    }
  }, [
    isLoadingConnections,
    selectedConnection,
    activeTab,
    tabs.length,
    tableStatusByConnection,
    tablesByConnection,
    initializeWorkspace,
  ]);

  // Keep stable refs for tabs and activeTab so keyboard listener never rebinds unnecessarily
  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    tabsRef.current = tabs;
    activeTabRef.current = activeTab;
  }, [tabs, activeTab]);

  const handleToggleToolWindow = useCallback(
    (toolWindow: "database" | "scripts") => {
      const isAlreadyOpen = toolWindows[toolWindow];
      setToolWindows(
        isAlreadyOpen
          ? { database: false, scripts: false }
          : {
              database: toolWindow === "database",
              scripts: toolWindow === "scripts",
            },
      );
    },
    [toolWindows, setToolWindows],
  );
  const handleToggleOutput = useCallback(() => {
    setToolWindows({ ...toolWindows, output: !toolWindows.output });
  }, [toolWindows, setToolWindows]);
  const handleMarkNotificationsRead = useCallback(() => {
    setNotifications((previous) =>
      previous.map((item) => ({ ...item, read: true })),
    );
  }, []);

  const handleOpenWelcomeHistory = useCallback(() => {
    const connection = selectedConnection || activeConnection;
    if (!connection) return;
    const tabId = openQueryTab(connection.id);
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("pb:query-command", {
          detail: { tabId, command: "history" },
        }),
      );
    }, 100);
  }, [activeConnection, openQueryTab, selectedConnection]);

  const dispatchQueryCommand = useCallback(
    (command: "run" | "explain" | "history") => {
      if (activeTab?.type !== "query") {
        if (command === "history") {
          handleOpenWelcomeHistory();
        }
        return;
      }
      window.dispatchEvent(
        new CustomEvent("pb:query-command", {
          detail: { tabId: activeTab.id, command },
        }),
      );
    },
    [activeTab, handleOpenWelcomeHistory],
  );

  const handleOpenHistory = useCallback(() => {
    dispatchQueryCommand("history");
  }, [dispatchQueryCommand]);
  const dispatchCellReferenceCommand = useCallback(
    (action: "forward" | "reverse") => {
      const tab = activeTabRef.current;
      if (tab?.type !== "table") return;
      window.dispatchEvent(
        new CustomEvent("pb:cell-reference-command", {
          detail: { tabId: tab.id, action },
        }),
      );
    },
    [],
  );

  useStudioKeyboardShortcuts({
    activeTabRef,
    tabsRef,
    findFocusedValues,
    workspaces: namedWorkspaces.workspaces,
    switchWorkspace: switchNamedWorkspace,
    setCommandPaletteOpen: setIsCommandPaletteOpen,
    setRunFromLogOpen: setIsRunFromLogOpen,
    openFindEverywhere,
    dispatchCellReferenceCommand,
    navigateHistory,
    closeTab,
    setActiveTabId,
    toggleToolWindow: handleToggleToolWindow,
    openQueryForExplorer: handleOpenQueryForExplorer,
    openErdForExplorer: handleOpenErdForExplorer,
  });

  // Fetch saved queries for current connection
  useEffect(() => {
    if (!activeConnection?.id) {
      setSavedQueries([]);
      return;
    }
    let current = true;
    const refresh = () =>
      fetchSavedQueries(activeConnection.id)
        .then((queries) => {
          if (current) setSavedQueries(queries);
        })
        .catch((err) => {
          console.debug("Failed to fetch saved queries:", err);
          if (current) setSavedQueries([]);
        });
    void refresh();
    window.addEventListener("pb:saved-queries-changed", refresh);
    return () => {
      current = false;
      window.removeEventListener("pb:saved-queries-changed", refresh);
    };
  }, [activeConnection?.id]);

  const handleOpenTableWithRecent = useCallback(
    (
      tableName: string,
      openInNewTab = false,
      connectionId = selectedConnection?.id,
      schemaName?: string,
    ) => {
      if (!connectionId) return;
      openTableTab(
        connectionId,
        tableName,
        openInNewTab,
        undefined,
        schemaName,
      );
      selectExplorerTable(connectionId, tableName, schemaName);
      const updated = addRecentItem({
        id: `${connectionId}:${schemaName || ""}:${tableName}`,
        type: "table",
        title: tableName,
        subtitle: connections.find(
          (connection) => connection.id === connectionId,
        )?.name,
      });
      setRecentItems(updated);
    },
    [openTableTab, selectedConnection?.id, selectExplorerTable, connections],
  );

  const handleImportTableFromExplorer = useCallback(
    (connectionId: string, table: TableSchema) => {
      handleOpenTableWithRecent(
        table.name,
        false,
        connectionId,
        table.schema_name,
      );
      window.requestAnimationFrame(() => {
        const targetTab = tabsRef.current.find(
          (tab) =>
            tab.type === "table" &&
            tab.connectionId === connectionId &&
            tab.tableName === table.name &&
            (tab.schemaName || "") === (table.schema_name || ""),
        );
        if (targetTab)
          window.dispatchEvent(
            new CustomEvent("pb:import-table", {
              detail: { tabId: targetTab.id },
            }),
          );
      });
    },
    [handleOpenTableWithRecent],
  );

  const handleSelectConnectionWithRecent = useCallback(
    (conn: Connection) => {
      selectExplorerConnection(conn.id);
      const updated = addRecentItem({
        id: conn.id,
        type: "connection",
        title: conn.name,
        subtitle: conn.type.toUpperCase(),
      });
      setRecentItems(updated);
    },
    [selectExplorerConnection],
  );

  const handleSelectSavedQueryWithRecent = useCallback(
    (sq: SavedQuery) => {
      openQueryTab(sq.connection_id, sq.query, sq.title);
      const updated = addRecentItem({
        id: sq.id,
        type: "query",
        title: sq.title,
        subtitle: sq.query.slice(0, 35),
      });
      setRecentItems(updated);
    },
    [connections, openQueryTab],
  );

  const handleOpenSqlFile = useCallback(() => {
    const connectionId = activeTab?.connectionId || selectedConnection?.id;
    if (
      !connectionId ||
      connections.find((item) => item.id === connectionId)?.type === "redis"
    )
      return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sql,.js,.txt,text/plain,application/sql";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      void file
        .text()
        .then((query) => openQueryTab(connectionId, query, file.name));
    };
    input.click();
  }, [
    activeTab?.connectionId,
    selectedConnection?.id,
    connections,
    openQueryTab,
  ]);

  const handleSaveQueryFile = useCallback(() => {
    if (activeTab?.type !== "query") return;
    const content = activeTab.state?.queryText || "";
    const blob = new Blob([content], { type: "text/sql;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${activeTab.title.replace(/[^a-z0-9-_]+/gi, "_") || "query"}.sql`;
    link.click();
    URL.revokeObjectURL(url);
  }, [activeTab]);

  const handleCreateConnectionAndSelect = useCallback(
    async (input: Parameters<typeof handleCreateConnection>[0]) => {
      const connection = await handleCreateConnection(input);
      selectExplorerConnection(connection.id);
      return connection;
    },
    [handleCreateConnection, selectExplorerConnection],
  );

  const handleDeleteConnectionAndCloseTabs = useCallback(
    async (connectionId: string) => {
      const connectionName =
        connections.find((item) => item.id === connectionId)?.name ||
        connectionId;
      const hasDirtyTabs = tabs.some(
        (tab) =>
          tab.isDirty &&
          (tab.connectionId === connectionId ||
            tab.state?.diffSourceConnectionId === connectionId ||
            tab.state?.diffTargetConnectionId === connectionId),
      );
      if (
        hasDirtyTabs &&
        !window.confirm(
          t(
            "workspace.confirmDeleteDirtyTabs",
            "This connection has tabs with unsaved staged changes. Delete the connection and discard those changes?",
          ),
        )
      )
        return;
      await handleDeleteConnection(connectionId);
      const closedCount = closeConnectionTabs(connectionId, true);
      if (closedCount > 0) {
        setWorkspaceNotice(
          t("workspace.connectionRemovedTabsClosed", {
            count: closedCount,
            connectionName,
          }),
        );
      }
    },
    [connections, tabs, handleDeleteConnection, closeConnectionTabs, t],
  );

  const { handlePaletteAction, handleWorkspaceCommand } = useStudioCommands({
    tabs,
    activeTabId,
    activeTab,
    currentUserRole: currentUser?.role,
    theme,
    toggleTheme,
    closeTab,
    closeAllTabs,
    setActiveTabId,
    navigateHistory,
    dispatchCellReferenceCommand,
    dispatchQueryCommand,
    handleOpenSqlFile,
    handleSaveQueryFile,
    handleToggleToolWindow,
    handleToggleOutput,
    setSidebarWidth,
    setToolWindows,
    handleOpenQueryForExplorer,
    handleOpenErdForExplorer,
    handleOpenDiffForExplorer,
    setIsRunFromLogOpen,
    setIsSettingsOpen,
    setIsAboutOpen,
    setIsAISettingsOpen,
    setIsOnboardingWelcomeOpen,
    setIsShortcutsOpen,
    setIsCommandPaletteOpen,
    openFindEverywhere,
    setIsAIAssistantOpen,
    setWorkspaceManagerOpen,
    setCloningConnection,
    setIsConnModalOpen,
    setAdminPanelDefaultTab,
    setIsAdminPanelOpen,
    openDialogAndCheck,
    findFocusedValues,
  });
  const handleCloneConnection = useCallback(
    (conn: Connection) => {
      if (!canManageSettings(currentUser?.role)) return;
      setEditingConnection(null);
      setCloningConnection(conn);
      setIsConnModalOpen(true);
    },
    [
      currentUser?.role,
      setCloningConnection,
      setEditingConnection,
      setIsConnModalOpen,
    ],
  );

  const handleEditConnection = useCallback(
    (conn: Connection) => {
      if (!canManageSettings(currentUser?.role)) return;
      setCloningConnection(null);
      setEditingConnection(conn);
      setIsConnModalOpen(true);
    },
    [
      currentUser?.role,
      setCloningConnection,
      setEditingConnection,
      setIsConnModalOpen,
    ],
  );

  const handleOpenNewConnection = useCallback(() => {
    if (!canManageSettings(currentUser?.role)) return;
    setCloningConnection(null);
    setEditingConnection(null);
    setIsConnModalOpen(true);
  }, [
    currentUser?.role,
    setCloningConnection,
    setEditingConnection,
    setIsConnModalOpen,
  ]);

  const handleSaveConnection = useCallback(
    async (input: Parameters<typeof handleCreateConnection>[0]) => {
      if (!workspaceConfigReady) throw new Error(t("workspaces.loadFailed"));
      if (editingConnection)
        return handleUpdateConnection(editingConnection.id, input);
      const connection = await handleCreateConnectionAndSelect({
        ...input,
        workspace_id: activeScopeId,
      });
      await refreshNamedWorkspaces();
      return connection;
    },
    [
      t,
      workspaceConfigReady,
      activeScopeId,
      refreshNamedWorkspaces,
      editingConnection,
      handleUpdateConnection,
      handleCreateConnectionAndSelect,
    ],
  );

  const handleToggleExplorerNode = useCallback(
    (nodeId: string) => {
      if (expandedNodeIds.includes(nodeId)) {
        setExpandedNodeIds(
          expandedNodeIds.filter(
            (id) => id !== nodeId && !id.startsWith(`${nodeId}:`),
          ),
        );
      } else {
        setExpandedNodeIds([...expandedNodeIds, nodeId]);
      }
    },
    [expandedNodeIds, setExpandedNodeIds],
  );
  const handleExpandExplorerNodes = useCallback(
    (nodeIds: string[]) => {
      setExpandedNodeIds([...new Set([...expandedNodeIds, ...nodeIds])]);
    },
    [expandedNodeIds, setExpandedNodeIds],
  );

  const handleOpenAISettings = useCallback(() => {
    if (canManageSettings(currentUser?.role)) setIsAISettingsOpen(true);
  }, [currentUser?.role]);

  const handleOpenChangePassword = useCallback(() => {
    setAdminPanelDefaultTab("password");
    setIsAdminPanelOpen(true);
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  // Derived workspace tool-window selection.
  const activeToolWindow = toolWindows.database
    ? "database"
    : toolWindows.scripts
      ? "scripts"
      : null;
  const canRunQuery = Boolean(
    activeTab?.type === "query" &&
    activeConnection &&
    activeConnection.type !== "redis",
  );
  const assistantConnection =
    (activeTab &&
      connections.find(
        (connection) => connection.id === activeTab.connectionId,
      )) ||
    activeConnection ||
    selectedConnection;
  const canOpenHistory = activeTab?.type === "query";

  const queryTabs = useMemo(
    () => tabs.filter((tab) => tab.type === "query"),
    [tabs],
  );
  const erdTabs = useMemo(
    () => tabs.filter((tab) => tab.type === "erd"),
    [tabs],
  );

  const diffTabs = useMemo(() => tabs.filter((t) => t.type === "diff"), [tabs]);

  const handleOpenRowModal = useCallback(
    (
      connectionId: string,
      tableName: string,
      tabId: string,
      row: Record<string, unknown> | null,
      duplicate = false,
    ) => {
      const conn = connections.find((c) => c.id === connectionId);
      if (conn?.read_only) return;
      setRowActionContext({
        connectionId,
        tableName,
        tabId,
      });
      setEditingRow(row && duplicate ? { ...row, _isDuplicate: true } : row);
      setIsRowModalOpen(true);
    },
    [connections],
  );

  const handleOpenFindMatch = useCallback(
    (match: FindMatch, row: Record<string, unknown>) => {
      findReturnFocus.current = null;
      if (!scopedConnectionIds.includes(match.connectionId)) {
        if (!switchNamedWorkspace("all")) return;
        window.setTimeout(() => {
          const key = String(row.key ?? "");
          if (
            connections.find(
              (connection) => connection.id === match.connectionId,
            )?.type === "redis"
          ) {
            openTableTab(match.connectionId, "Redis keys", false, {
              redisSearchKey: key,
            });
          } else {
            const schema = (tablesByConnection[match.connectionId] ?? []).find(
              (candidate) => candidate.name === match.table,
            );
            const primaryKey = schema?.columns.find(
              (column) => column.is_primary_key,
            );
            const canUsePrimaryKey = Boolean(
              primaryKey &&
              row[primaryKey.name] !== undefined &&
              row[primaryKey.name] !== "[redacted]",
            );
            const selectedColumn = canUsePrimaryKey
              ? primaryKey!.name
              : match.column;
            const selectedValue = canUsePrimaryKey
              ? row[primaryKey!.name]
              : row[match.column];
            openTableTab(match.connectionId, match.table, false, {
              filters: [
                {
                  column: selectedColumn,
                  operator: primaryKey ? "eq" : match.operator,
                  value: String(selectedValue ?? ""),
                },
              ],
              page: 0,
            });
          }
          setIsFindEverywhereOpen(false);
        }, 0);
        return;
      }
      const matchConnection = connections.find(
        (connection) => connection.id === match.connectionId,
      );
      if (matchConnection?.type === "redis") {
        const key = String(row.key ?? "");
        openTableTab(match.connectionId, "Redis keys", false, {
          redisSearchKey: key,
        });
        setIsFindEverywhereOpen(false);
        return;
      }
      const candidates = tablesByConnection[match.connectionId] ?? [];
      const schema = candidates.find(
        (candidate) => candidate.name === match.table,
      );
      const primaryKey = schema?.columns.find(
        (column) => column.is_primary_key,
      );
      const canUsePrimaryKey = Boolean(
        primaryKey &&
        row[primaryKey.name] !== undefined &&
        row[primaryKey.name] !== "[redacted]",
      );
      const selectedColumn = canUsePrimaryKey ? primaryKey!.name : match.column;
      const selectedValue = canUsePrimaryKey
        ? row[primaryKey!.name]
        : row[match.column];
      openTableTab(match.connectionId, match.table, false, {
        filters: [
          {
            column: selectedColumn,
            operator: primaryKey ? "eq" : match.operator,
            value: String(selectedValue ?? ""),
          },
        ],
        page: 0,
      });
      setIsFindEverywhereOpen(false);
    },
    [
      scopedConnectionIds,
      switchNamedWorkspace,
      connections,
      tablesByConnection,
      openTableTab,
    ],
  );

  const handleRunFromLog = useCallback(
    (connectionId: string, statement: string) => {
      const tabId = openQueryTab(connectionId, statement, "From Log");
      setIsRunFromLogOpen(false);
      if (!tabId) return;
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("pb:query-command", {
            detail: { tabId, command: "run" },
          }),
        );
      }, 100);
    },
    [openQueryTab],
  );
  return (
    <div
      style={
        {
          "--titlebar-height": isDesktop ? `${TITLEBAR_HEIGHT}px` : "0px",
        } as React.CSSProperties
      }
      data-studio-shell
      className="bg-background text-foreground flex h-dvh w-full min-w-0 flex-col overflow-hidden font-sans transition-colors"
    >
      <DesktopTitleBar
        theme={theme}
        workspaceControl={
          <WorkspaceControl
            workspaces={namedWorkspaces.workspaces}
            activeId={namedWorkspaces.activeId}
            showAll={namedWorkspaces.showAll}
            connections={connections}
            count={scopedConnections.length}
            ready={workspaceConfigReady && connectionsReady}
            canManage={canManageSettings(currentUser?.role)}
            manageOpen={workspaceManagerOpen}
            onManageOpen={setWorkspaceManagerOpen}
            onSwitch={switchNamedWorkspace}
            onMutate={mutateNamedWorkspace}
          />
        }
        activeConnection={displayConnection}
        connections={scopedConnections}
        activeTab={activeTab}
        activeToolWindow={activeToolWindow}
        canRunQuery={canRunQuery}
        canOpenHistory={Boolean(canOpenHistory)}
        canNavigateBack={canNavigateBack}
        canNavigateForward={canNavigateForward}
        onNavigateBack={() => navigateHistory("back")}
        onNavigateForward={() => navigateHistory("forward")}
        isAdmin={canManageSettings(currentUser?.role)}
        onSelectConnection={handleSelectConnectionWithRecent}
        onOpenCommandPalette={handleOpenCommandPalette}
        onCommand={handleWorkspaceCommand}
      />
      <OfflineRecoveryBanner
        onReconnect={async () => {
          await queryClient.invalidateQueries();
        }}
      />
      <SidebarProvider
        defaultOpen={true}
        open={activeToolWindow !== null}
        onOpenChange={(open) =>
          setToolWindows(
            open
              ? { database: true, scripts: false }
              : { database: false, scripts: false },
          )
        }
        sidebarWidth={sidebarWidth}
        onSidebarWidthChange={setSidebarWidth}
        className="min-h-0 w-full flex-1 overflow-hidden"
        style={
          {
            "--activity-rail-width": `${ACTIVITY_RAIL_WIDTH}px`,
          } as React.CSSProperties
        }
      >
        <ActivityRail
          activeToolWindow={activeToolWindow}
          outputOpen={toolWindows.output}
          onToggleDatabase={() => handleToggleToolWindow("database")}
          onToggleScripts={() => handleToggleToolWindow("scripts")}
          onToggleOutput={handleToggleOutput}
          onOpenHistory={handleOpenHistory}
        />
        {activeToolWindow === "database" ? (
          <Sidebar
            collapsible="none"
            className="border-border relative h-full min-h-0 shrink-0 overflow-visible border-r"
          >
            <DatabaseExplorer
              key={scopeKey}
              connections={scopedConnections}
              canManageConnections={canManageSettings(currentUser?.role)}
              selectedConnectionId={selectedConnectionId}
              selectedTable={
                selectedExplorerNode?.kind === "table"
                  ? selectedExplorerNode
                  : null
              }
              activeConnectionId={activeConnection?.id || null}
              tablesByConnection={tablesByConnection}
              statusByConnection={tableStatusByConnection}
              expandedNodeIds={expandedNodeIds}
              onToggleNode={handleToggleExplorerNode}
              onExpandNodes={handleExpandExplorerNodes}
              onCollapseAll={() => setExpandedNodeIds([])}
              onSelectConnection={handleSelectConnectionWithRecent}
              onSelectTable={(connectionId, table, openInNewTab) =>
                handleOpenTableWithRecent(
                  table.name,
                  Boolean(openInNewTab),
                  connectionId,
                  table.schema_name,
                )
              }
              onOpenQuery={handleOpenQueryForConnection}
              onOpenDiff={(connectionId) => {
                const source = connections.find(
                  (connection) => connection.id === connectionId,
                );
                const target = connections.find(
                  (connection) =>
                    connection.id !== connectionId &&
                    !["mongodb", "redis"].includes(connection.type),
                );
                if (
                  source &&
                  !["mongodb", "redis"].includes(source.type) &&
                  target
                )
                  openDiffTab(source.id, target.id);
              }}
              onImportTable={handleImportTableFromExplorer}
              onOpenERD={(connectionId) => {
                if (
                  connections.find((item) => item.id === connectionId)?.type !==
                  "redis"
                )
                  openErdTab(connectionId);
              }}
              onOpenNewConnection={handleOpenNewConnection}
              onHideToolWindow={() => handleToggleToolWindow("database")}
              onRefreshConnection={refreshConnectionTables}
              onDuplicateConnection={handleCloneConnection}
              onEditConnection={handleEditConnection}
              onDeleteConnection={handleDeleteConnectionAndCloseTabs}
            />
            <SidebarRail />
          </Sidebar>
        ) : activeToolWindow === "scripts" ? (
          <Sidebar
            collapsible="none"
            className="border-border relative h-full min-h-0 shrink-0 overflow-visible border-r"
          >
            <ScriptsToolWindow
              tabs={tabs}
              connections={connections}
              activeTabId={activeTabId}
              savedQueries={savedQueries}
              onSavedQueriesChange={setSavedQueries}
              activeConnectionId={activeConnection?.id}
              canOpenQuery={Boolean(activeConnection)}
              onSelectTab={setActiveTabId}
              onNewQuery={handleOpenQueryForExplorer}
              onOpenSqlFile={handleOpenSqlFile}
              onSelectHistory={(connectionId, queryText) =>
                openQueryTab(
                  connectionId,
                  queryText,
                  t("savedQuery.history.title", "Query history"),
                )
              }
              onSelectSavedQuery={handleSelectSavedQueryWithRecent}
              onHideToolWindow={() => handleToggleToolWindow("scripts")}
            />
            <SidebarRail />
          </Sidebar>
        ) : null}

        {/* Main Content Pane */}
        <SidebarInset
          key={scopeKey}
          className="bg-background flex h-full min-w-0 flex-1 flex-col overflow-hidden"
        >
          {namedWorkspaces.ready && connectionsReady ? (
            <>
              {/* Chrome/DataGrip Style Tab Bar */}
              {connections.length > 0 && (
                <TabBar
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onSelectTab={setActiveTabId}
                  onCloseTab={closeTab}
                  onCloseOtherTabs={closeOtherTabs}
                  onCloseTabsToRight={closeTabsToRight}
                  onDuplicateTab={duplicateTab}
                  onNewQueryTab={handleOpenQueryForExplorer}
                  onReorderTabs={reorderTabs}
                />
              )}

              {workspaceNotice && (
                <div
                  role="status"
                  className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200"
                >
                  <span className="min-w-0 flex-1">{workspaceNotice}</span>
                  <button
                    type="button"
                    className="rounded px-1 hover:bg-blue-100 dark:hover:bg-blue-900"
                    onClick={() => setWorkspaceNotice(null)}
                    aria-label={t("common.dismiss")}
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Error notification banner */}
              <ErrorBanner
                message={activeErrorMessage}
                onDismiss={handleDismissBanner}
                onRetry={handleRetry}
                isRetrying={isRetrying}
                activeConnectionName={activeConnection?.name}
                onEditConnection={
                  activeConnection && canManageSettings(currentUser?.role)
                    ? () => handleEditConnection(activeConnection)
                    : undefined
                }
              />

              {/* Dynamic Main Views */}
              <StudioTabContent
                activeTab={activeTab}
                activeTabId={activeTabId}
                tabs={tabs}
                queryTabs={queryTabs}
                erdTabs={erdTabs}
                diffTabs={diffTabs}
                connections={connections}
                selectedConnection={selectedConnection}
                activeConnection={activeConnection}
                scopedConnections={scopedConnections}
                tablesByConnection={tablesByConnection}
                tableStatusByConnection={tableStatusByConnection}
                rowsByTabId={rowsByTabId}
                namedWorkspacesScopeId={namedWorkspaces.scopeId}
                currentUser={currentUser}
                handleOpenQueryForExplorer={handleOpenQueryForExplorer}
                handleOpenErdForExplorer={handleOpenErdForExplorer}
                handleOpenNewConnection={handleOpenNewConnection}
                setAdminPanelDefaultTab={setAdminPanelDefaultTab}
                setIsAdminPanelOpen={setIsAdminPanelOpen}
                handleOpenWelcomeHistory={handleOpenWelcomeHistory}
                handleOpenCommandPalette={handleOpenCommandPalette}
                updateTabState={updateTabState}
                handleOpenTableForConnection={handleOpenTableForConnection}
                handleOpenAISettings={handleOpenAISettings}
                openQueryTab={openQueryTab}
                setTabError={setTabError}
                refreshConnectionTables={refreshConnectionTables}
                openFindEverywhere={openFindEverywhere}
                findFocusedValues={findFocusedValues}
                selectedCells={selectedCells}
                activeTabRef={activeTabRef}
                setNavigationHistory={setNavigationHistory}
                onOpenRowModal={handleOpenRowModal}
                handleSaveRow={handleSaveRow}
                handleDeleteRow={handleDeleteRow}
                openTableTab={openTableTab}
              />
              {toolWindows.output && (
                <Suspense fallback={null}>
                  <OutputPanel
                    events={operationEvents}
                    onClear={() => setOperationEvents([])}
                    onClose={() => {
                      handleToggleOutput();
                      document.getElementById("output-trigger")?.focus();
                    }}
                  />
                </Suspense>
              )}
            </>
          ) : (
            <p role="status" className="p-6 text-sm">
              {namedWorkspaces.error
                ? t("workspaces.loadFailed")
                : t("workspaces.loading")}
            </p>
          )}
        </SidebarInset>

        <RightActivityRail
          aiOpen={isAIAssistantOpen}
          notificationsOpen={isNotificationPanelOpen}
          unreadCount={notifications.filter((item) => !item.read).length}
          onToggleAI={() => setIsAIAssistantOpen((open) => !open)}
          onToggleNotifications={() => {
            setIsNotificationPanelOpen((open) => !open);
            handleMarkNotificationsRead();
          }}
        />

        {isAIAssistantOpen && (
          <Suspense fallback={null}>
            <AIAssistantPanel
              connection={assistantConnection || undefined}
              tables={
                assistantConnection
                  ? (tablesByConnection[assistantConnection.id] || []).filter(
                      (table) => table.name === activeTab?.tableName,
                    )
                  : []
              }
              resultRows={
                activeTab ? (rowsByTabId[activeTab.id]?.data?.rows ?? []) : []
              }
              onReviewQuery={(query) => {
                const target = findAIDraftConsole(
                  activeTab,
                  tabs,
                  assistantConnection?.id,
                );
                const title = t("operations.aiDraftTitle", "AI draft");
                if (target) {
                  setActiveTabId(target.id);
                  window.requestAnimationFrame(() =>
                    window.dispatchEvent(
                      new CustomEvent("pb:review-ai-query", {
                        detail: { tabId: target.id, query },
                      }),
                    ),
                  );
                } else if (
                  assistantConnection &&
                  assistantConnection.type !== "redis"
                ) {
                  const tabId = openQueryTab(
                    assistantConnection.id,
                    undefined,
                    title,
                  );
                  if (tabId)
                    window.requestAnimationFrame(() =>
                      window.dispatchEvent(
                        new CustomEvent("pb:review-ai-query", {
                          detail: { tabId, query },
                        }),
                      ),
                    );
                }
                setIsAIAssistantOpen(false);
              }}
              onOpenSettings={handleOpenAISettings}
              onClose={() => setIsAIAssistantOpen(false)}
            />
          </Suspense>
        )}

        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          connections={scopedConnections}
          activeConnection={displayConnection}
          onSelectConnection={handleSelectConnectionWithRecent}
          tables={
            scopedConnectionIds.includes(displayConnection?.id ?? "")
              ? activeTables
              : []
          }
          onSelectTable={handleOpenTableWithRecent}
          savedQueries={savedQueries.filter((query) =>
            scopedConnectionIds.includes(query.connection_id),
          )}
          onSelectSavedQuery={handleSelectSavedQueryWithRecent}
          recentItems={recentItems.filter((item) =>
            item.type === "connection"
              ? scopedConnectionIds.includes(item.id)
              : item.type === "table"
                ? scopedConnectionIds.some((id) => item.id.startsWith(`${id}:`))
                : savedQueries.some(
                    (query) =>
                      query.id === item.id &&
                      scopedConnectionIds.includes(query.connection_id),
                  ),
          )}
          onTriggerAction={handlePaletteAction}
          onFindEverywhere={(value) => {
            openFindEverywhere(value);
            setIsCommandPaletteOpen(false);
          }}
          theme={theme}
          canManageSettings={canManageSettings(currentUser?.role)}
        />

        <StudioModals
          isNotificationPanelOpen={isNotificationPanelOpen}
          setIsNotificationPanelOpen={setIsNotificationPanelOpen}
          notifications={notifications}
          setNotifications={setNotifications}
          onMarkNotificationsRead={handleMarkNotificationsRead}
          isConnModalOpen={isConnModalOpen}
          setIsConnModalOpen={setIsConnModalOpen}
          editingConnection={editingConnection}
          setEditingConnection={setEditingConnection}
          cloningConnection={cloningConnection}
          setCloningConnection={setCloningConnection}
          onSaveConnection={handleSaveConnection}
          isRowModalOpen={isRowModalOpen}
          setIsRowModalOpen={setIsRowModalOpen}
          rowActionContext={rowActionContext}
          setRowActionContext={setRowActionContext}
          editingRow={editingRow}
          setEditingRow={setEditingRow}
          tablesByConnection={tablesByConnection}
          isAdminPanelOpen={isAdminPanelOpen}
          setIsAdminPanelOpen={setIsAdminPanelOpen}
          adminPanelDefaultTab={adminPanelDefaultTab}
          setAdminPanelDefaultTab={setAdminPanelDefaultTab}
          isSettingsOpen={isSettingsOpen}
          setIsSettingsOpen={setIsSettingsOpen}
          currentUser={currentUser}
          activeConnection={activeConnection}
          theme={theme}
          onToggleTheme={toggleTheme}
          onOpenAISettings={handleOpenAISettings}
          isAboutOpen={isAboutOpen}
          setIsAboutOpen={setIsAboutOpen}
          isAISettingsOpen={isAISettingsOpen}
          setIsAISettingsOpen={setIsAISettingsOpen}
          isShortcutsOpen={isShortcutsOpen}
          setIsShortcutsOpen={setIsShortcutsOpen}
          isFindEverywhereOpen={isFindEverywhereOpen}
          onCloseFindEverywhere={closeFindEverywhere}
          findInitialValue={findInitialValue}
          scopedConnections={scopedConnections}
          connections={connections}
          onOpenMatch={handleOpenFindMatch}
          isRunFromLogOpen={isRunFromLogOpen}
          setIsRunFromLogOpen={setIsRunFromLogOpen}
          displayConnection={displayConnection}
          onRunFromLog={handleRunFromLog}
          isOnboardingWelcomeOpen={isOnboardingWelcomeOpen}
          setIsOnboardingWelcomeOpen={setIsOnboardingWelcomeOpen}
          isSpotlightTourActive={isSpotlightTourActive}
          setIsSpotlightTourActive={setIsSpotlightTourActive}
          isUpdateDialogOpen={isUpdateDialogOpen}
          setIsUpdateDialogOpen={setIsUpdateDialogOpen}
          updateInfo={updateInfo}
          onCheckUpdate={handleCheckUpdate}
          isCheckingUpdate={isCheckingUpdate}
        />
      </SidebarProvider>
      {namedWorkspaces.error && (
        <p role="alert" className="text-destructive px-3 text-xs">
          {t("workspaces.loadFailed")}
        </p>
      )}
      <StatusBar
        connection={displayConnection}
        isLoading={
          isLoadingConnections ||
          Boolean(
            activeTab &&
            tableStatusByConnection[activeTab.connectionId]?.isLoading,
          ) ||
          (activeTab?.type === "table" && isLoadingRows)
        }
        hasError={Boolean(activeErrorMessage)}
        tableName={activeTab?.type === "table" ? activeTab.tableName : null}
        isDefaultPassword={isDefaultPassword}
        onChangePassword={handleOpenChangePassword}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthGuard>
          <TooltipProvider>
            <PebblebaseStudio />
          </TooltipProvider>
        </AuthGuard>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
