import { useNamedWorkspaces } from "@/hooks/useNamedWorkspaces";
import { WorkspaceControl } from "@/components/layout/WorkspaceControl";
import { FindEverywhereDialog } from "@/components/modals/FindEverywhereDialog";
import { findAIDraftConsole } from "@/lib/aiDraftTarget";
import { restoreFindDialogFocus } from "@/lib/findDialogFocus";
import { RunFromLogDialog } from "@/components/modals/RunFromLogDialog";
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
import { RedisCliConsole } from "@/components/redis/RedisCliConsole";
import { canManageSettings, canManageUsers } from "@/lib/auth";
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
import { cn } from "cn";
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
import { ShortcutsDialog } from "@/components/layout/ShortcutsDialog";
import {
  ACTIVITY_RAIL_WIDTH,
  SIDEBAR_RESET_WIDTH,
  TITLEBAR_HEIGHT,
} from "@/constants/workspaceLayout";
import type {
  Connection,
  SavedQuery,
  StudioTabState,
  TableSchema,
} from "./lib/types";
import { WorkspaceHome } from "@/components/common/WorkspaceHome";
import {
  TabBar,
  DesktopTitleBar,
  CommandPalette,
  type CommandActionId,
} from "@/components/layout";
import type { WorkspaceCommandId } from "@/components/layout/workspaceCommands";
import {
  emptyNavigationHistory,
  pruneNavigation,
  pushNavigation,
  stepNavigation,
  type NavigationHistory,
} from "@/lib/navigationHistory";

const OutputPanel = lazy(() =>
  import("@/components/layout/OutputPanel").then((module) => ({
    default: module.OutputPanel,
  })),
);
const NotificationPanel = lazy(() =>
  import("@/components/layout/NotificationPanel").then((module) => ({
    default: module.NotificationPanel,
  })),
);
const AIAssistantPanel = lazy(() =>
  import("@/components/layout/AIAssistantPanel").then((module) => ({
    default: module.AIAssistantPanel,
  })),
);
import { DataGrid, EmptyTableScreen } from "@/components/grid";
import {
  ErrorBanner,
  SplashScreen,
  ErrorBoundary,
  UpdateDialog,
} from "@/components/common";
import { DefaultPasswordBanner, LoginScreen } from "@/components/auth";
import {
  getRecentItems,
  addRecentItem,
  clearRecentItems,
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
import { useAuthStore } from "./lib/auth";
import {
  fetchMe,
  fetchSavedQueries,
  exportTableData,
  apiLogout,
} from "./lib/api";
import { isDesktopApp, quitDesktopApp, toggleFullscreen } from "./lib/platform";
import { useUpdateStore } from "./lib/updateStore";
import { useFontSizeStore } from "./lib/fontSizeStore";
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from "@/constants";

// Lazy-loaded heavy modules for fast desktop startup and minimal initial memory
const QueryConsole = lazy(() =>
  import("@/components/query/QueryConsole").then((m) => ({
    default: m.QueryConsole,
  })),
);
const ERDView = lazy(() => import("@/components/erd/ERDView"));
const SchemaDiff = lazy(() =>
  import("@/components/schema/SchemaDiff").then((m) => ({
    default: m.SchemaDiff,
  })),
);
const AdminPanel = lazy(() =>
  import("@/components/auth/AdminPanel").then((m) => ({
    default: m.AdminPanel,
  })),
);
const ConnectionModal = lazy(() =>
  import("@/components/modals/ConnectionModal").then((m) => ({
    default: m.ConnectionModal,
  })),
);
const RowModal = lazy(() =>
  import("@/components/modals/RowModal").then((m) => ({ default: m.RowModal })),
);
const OnboardingTour = lazy(() =>
  import("@/components/onboarding/OnboardingTour").then((m) => ({
    default: m.OnboardingTour,
  })),
);
const RedisStudio = lazy(() =>
  import("@/components/redis").then((m) => ({
    default: m.RedisStudio,
  })),
);
const AISettingsModal = lazy(() =>
  import("@/components/modals/AISettingsModal").then((m) => ({
    default: m.AISettingsModal,
  })),
);
const SettingsDialog = lazy(() =>
  import("@/components/modals/SettingsDialog").then((m) => ({
    default: m.SettingsDialog,
  })),
);
const AboutDialog = lazy(() =>
  import("@/components/common/AboutDialog").then((m) => ({
    default: m.AboutDialog,
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
    if (!isDefaultPassword) return;
    setAdminPanelDefaultTab("password");
    setIsAdminPanelOpen(true);
  }, [isDefaultPassword]);

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
    tables,
    activeTables,
    tablesByConnection,
    tableStatusByConnection,
    loadedTableConnectionIds,
    activeTable,
    activeTableSchema,
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
      } catch {
        /* storage unavailable */
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

  const dispatchQueryCommand = useCallback(
    (command: "run" | "explain" | "history") => {
      if (activeTab?.type !== "query") return;
      window.dispatchEvent(
        new CustomEvent("pb:query-command", {
          detail: { tabId: activeTab.id, command },
        }),
      );
    },
    [activeTab],
  );

  // Consolidated global keyboard shortcuts (Alt+Q, Alt+E, Cmd/Ctrl+K, Desktop shortcuts)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const currentActiveTab = activeTabRef.current;
      const currentTabs = tabsRef.current;

      if (
        (e.ctrlKey || e.metaKey) &&
        e.altKey &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        navigateHistory(e.key === "ArrowLeft" ? "back" : "forward");
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        e.altKey &&
        !e.shiftKey &&
        /^Digit[1-9]$/.test(e.code)
      ) {
        const target = namedWorkspaces.workspaces[Number(e.code.slice(-1)) - 1];
        if (target) {
          e.preventDefault();
          switchNamedWorkspace(target.id);
        }
        return;
      }
      // Cmd+K / Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "f"
      ) {
        e.preventDefault();
        openFindEverywhere(
          findFocusedValues.current[currentActiveTab?.id ?? ""] ?? "",
        );
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "l"
      ) {
        e.preventDefault();
        setIsRunFromLogOpen(true);
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "a"
      ) {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "w") {
        if (currentActiveTab) {
          e.preventDefault();
          closeTab(currentActiveTab.id);
          return;
        }
      }
      if ((e.altKey || e.metaKey) && e.key === "1") {
        e.preventDefault();
        handleToggleToolWindow("database");
        return;
      }
      if ((e.altKey || e.metaKey) && e.key === "2") {
        e.preventDefault();
        handleToggleToolWindow("scripts");
        return;
      }
      if (e.altKey && e.key === "ArrowRight" && currentTabs.length > 1) {
        e.preventDefault();
        const index = currentTabs.findIndex(
          (tab) => tab.id === currentActiveTab?.id,
        );
        setActiveTabId(
          currentTabs[(index + 1) % currentTabs.length]?.id ||
            currentTabs[0].id,
        );
        return;
      }
      if (e.altKey && e.key === "ArrowLeft" && currentTabs.length > 1) {
        e.preventDefault();
        const index = currentTabs.findIndex(
          (tab) => tab.id === currentActiveTab?.id,
        );
        setActiveTabId(
          currentTabs[(index - 1 + currentTabs.length) % currentTabs.length]
            ?.id || currentTabs[0].id,
        );
        return;
      }
      if (
        (e.metaKey || e.ctrlKey) &&
        e.key.toLowerCase() === "e" &&
        currentActiveTab?.type === "query"
      ) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("pb:query-command", {
            detail: { tabId: currentActiveTab.id, command: "history" },
          }),
        );
        return;
      }
      if (((e.metaKey || e.ctrlKey) && e.key === "Enter") || e.key === "F5") {
        if (
          currentActiveTab?.type === "query" &&
          !(document.activeElement as HTMLElement | null)?.closest?.(
            ".cm-editor",
          )
        ) {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("pb:query-command", {
              detail: { tabId: currentActiveTab.id, command: "run" },
            }),
          );
          return;
        }
      }

      // Alt+Q: Toggle / Open Query Console
      if (e.altKey && (e.key === "q" || e.key === "Q")) {
        e.preventDefault();
        if (currentActiveTab?.type === "query") {
          const tableTab = currentTabs.find((t) => t.type === "table");
          if (tableTab) {
            setActiveTabId(tableTab.id);
          }
        } else {
          handleOpenQueryForExplorer();
        }
        return;
      }

      // Alt+E: Toggle / Open ERD
      if (e.altKey && (e.key === "e" || e.key === "E")) {
        e.preventDefault();
        if (currentActiveTab?.type === "erd") {
          const tableTab = currentTabs.find((t) => t.type === "table");
          if (tableTab) {
            setActiveTabId(tableTab.id);
          }
        } else {
          handleOpenErdForExplorer();
        }
        return;
      }

      // Font Size Zoom Shortcuts: Ctrl/Cmd + Plus / Minus / 0
      if (e.metaKey || e.ctrlKey) {
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          useFontSizeStore.getState().increaseFontSize();
          return;
        }
        if (e.key === "-") {
          e.preventDefault();
          useFontSizeStore.getState().decreaseFontSize();
          return;
        }
        if (e.key === "0") {
          e.preventDefault();
          useFontSizeStore.getState().resetFontSize();
          return;
        }
      }

      // Desktop: Ctrl+Q to quit
      if ((e.metaKey || e.ctrlKey) && (e.key === "q" || e.key === "Q")) {
        if (isDesktopApp()) {
          e.preventDefault();
          quitDesktopApp();
        }
        return;
      }

      // Desktop / Web: F11 fullscreen
      if (e.key === "F11") {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
    };

    const handleMouseNavigation = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      navigateHistory(event.button === 3 ? "back" : "forward");
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    window.addEventListener("mousedown", handleMouseNavigation);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      window.removeEventListener("mousedown", handleMouseNavigation);
    };
  }, [
    namedWorkspaces.workspaces,
    switchNamedWorkspace,
    handleOpenQueryForExplorer,
    handleOpenErdForExplorer,
    handleToggleToolWindow,
    closeTab,
    setActiveTabId,
    navigateHistory,
    openFindEverywhere,
  ]);

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
        .catch(() => {
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

  const handlePaletteAction = useCallback(
    (actionId: CommandActionId) => {
      switch (actionId) {
        case "open_query_console":
          handleOpenQueryForExplorer();
          break;
        case "open_erd":
          handleOpenErdForExplorer();
          break;
        case "open_diff":
          handleOpenDiffForExplorer();
          break;
        case "run_from_log":
          setIsRunFromLogOpen(true);
          break;
        case "export_csv":
        case "export_json": {
          const format = actionId === "export_csv" ? "csv" : "json";
          const editorTab = activeTab;
          if (editorTab?.type === "table" && editorTab.tableName) {
            exportTableData(editorTab.connectionId, editorTab.tableName, format)
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${editorTab.tableName}.${format}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              })
              .catch((err) => console.error("Export error:", err));
          }
          break;
        }
        case "toggle_theme":
          toggleTheme();
          break;
        case "open_settings":
          setIsSettingsOpen(true);
          break;
        case "about":
          setIsAboutOpen(true);
          break;
        case "open_ai_settings":
          if (canManageSettings(currentUser?.role)) setIsAISettingsOpen(true);
          break;
        case "product_tour":
          setIsOnboardingWelcomeOpen(true);
          break;
        case "check_updates":
          openDialogAndCheck();
          break;
        case "sign_out":
          clearRecentItems();
          apiLogout().catch(() => {});
          useAuthStore.getState().clearAuth();
          break;
      }
    },
    [
      openQueryTab,
      handleOpenQueryForExplorer,
      handleOpenErdForExplorer,
      handleOpenDiffForExplorer,
      openTableTab,
      activeTableSchema,
      tables,
      activeConnection,
      activeTable,
      activeTab,
      selectedConnection,
      toggleTheme,
      currentUser?.role,
    ],
  );

  const handleWorkspaceCommand = useCallback(
    (command: WorkspaceCommandId) => {
      const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId);
      switch (command) {
        case "navigate_back":
          navigateHistory("back");
          break;
        case "navigate_forward":
          navigateHistory("forward");
          break;
        case "open_sql_file":
          handleOpenSqlFile();
          break;
        case "save_query_file":
          handleSaveQueryFile();
          break;
        case "close_active_tab":
          if (activeTabId) closeTab(activeTabId);
          break;
        case "close_all_tabs":
          closeAllTabs();
          break;
        case "manage_connections":
          if (canManageSettings(currentUser?.role)) {
            setCloningConnection(null);
            setIsConnModalOpen(true);
          }
          break;
        case "change_password":
          setAdminPanelDefaultTab("password");
          setIsAdminPanelOpen(true);
          break;
        case "exit_app":
          if (isDesktopApp()) quitDesktopApp();
          break;
        case "edit_cut":
        case "edit_copy":
        case "edit_paste":
        case "edit_select_all":
          document.execCommand(
            (
              {
                edit_cut: "cut",
                edit_copy: "copy",
                edit_paste: "paste",
                edit_select_all: "selectAll",
              } as const
            )[command],
          );
          break;
        case "find_data":
          if (activeTab)
            window.dispatchEvent(
              new CustomEvent("pb:focus-grid-search", {
                detail: { tabId: activeTab.id },
              }),
            );
          break;
        case "toggle_database":
          handleToggleToolWindow("database");
          break;
        case "toggle_scripts":
          handleToggleToolWindow("scripts");
          break;
        case "toggle_output":
          handleToggleOutput();
          break;
        case "toggle_ai":
          setIsAIAssistantOpen((open) => !open);
          break;
        case "switch_workspace":
          setWorkspaceManagerOpen(true);
          break;
        case "theme_dark":
          if (theme !== "dark") toggleTheme();
          break;
        case "theme_light":
          if (theme !== "light") toggleTheme();
          break;
        case "toggle_theme":
          toggleTheme();
          break;
        case "font_small":
          useFontSizeStore.getState().setFontSize("sm");
          break;
        case "font_default":
          useFontSizeStore.getState().setFontSize("md");
          break;
        case "font_large":
          useFontSizeStore.getState().setFontSize("lg");
          break;
        case "font_extra_large":
          useFontSizeStore.getState().setFontSize("xl");
          break;
        case "reset_layout":
          setSidebarWidth(SIDEBAR_RESET_WIDTH);
          setToolWindows({
            database: true,
            scripts: false,
            output: false,
            ai: false,
          });
          break;
        case "search_everywhere":
          setIsCommandPaletteOpen(true);
          break;
        case "find_everywhere":
          openFindEverywhere(
            findFocusedValues.current[activeTab?.id ?? ""] ?? "",
          );
          break;
        case "run_from_log":
          setIsRunFromLogOpen(true);
          break;
        case "next_tab":
          if (tabs.length > 1)
            setActiveTabId(
              tabs[(currentIndex + 1) % tabs.length]?.id || tabs[0].id,
            );
          break;
        case "previous_tab":
          if (tabs.length > 1)
            setActiveTabId(
              tabs[(currentIndex - 1 + tabs.length) % tabs.length]?.id ||
                tabs[0].id,
            );
          break;
        case "query_history":
          dispatchQueryCommand("history");
          break;
        case "execute_query":
          dispatchQueryCommand("run");
          break;
        case "explain_query":
          dispatchQueryCommand("explain");
          break;
        case "import_csv":
          if (activeTab?.type === "table")
            window.dispatchEvent(
              new CustomEvent("pb:import-table", {
                detail: { tabId: activeTab.id },
              }),
            );
          break;
        case "edit_undo":
        case "edit_redo":
        case "format_query":
        case "documentation":
          break;
        case "keyboard_shortcuts":
          setIsShortcutsOpen(true);
          break;
        case "open_query_console":
        case "open_erd":
        case "open_diff":
          handlePaletteAction(command);
          break;
        case "open_migration":
          break;
        case "export_csv":
        case "export_json":
        case "open_settings":
        case "open_ai_settings":
        case "about":
        case "product_tour":
        case "check_updates":
        case "sign_out":
          handlePaletteAction(command);
          break;
      }
    },
    [
      tabs,
      activeTabId,
      activeTab,
      closeTab,
      closeAllTabs,
      handleOpenSqlFile,
      handleSaveQueryFile,
      handleToggleToolWindow,
      theme,
      handleToggleOutput,
      toggleTheme,
      setSidebarWidth,
      setToolWindows,
      setActiveTabId,
      navigateHistory,
      dispatchQueryCommand,
      handlePaletteAction,
      openFindEverywhere,
      currentUser?.role,
      setCloningConnection,
      setIsConnModalOpen,
    ],
  );

  // Sidebar stable callbacks
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

  // Derived workspace tool-window selection.
  const activeToolWindow = toolWindows.scripts
    ? "scripts"
    : toolWindows.database
      ? "database"
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

  return (
    <div
      style={
        {
          "--titlebar-height": isDesktop ? `${TITLEBAR_HEIGHT}px` : "0px",
        } as React.CSSProperties
      }
      data-studio-shell
      className="bg-background text-foreground flex h-dvh w-screen flex-col overflow-hidden font-sans transition-colors"
    >
      <DesktopTitleBar
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
        />
        {toolWindows.database ? (
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
              onHideToolWindow={() => setToolWindows({ database: false })}
              onRefreshConnection={refreshConnectionTables}
              onDuplicateConnection={handleCloneConnection}
              onEditConnection={handleEditConnection}
              onDeleteConnection={handleDeleteConnectionAndCloseTabs}
            />
            <SidebarRail />
          </Sidebar>
        ) : toolWindows.scripts ? (
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
              {isDefaultPassword && (
                <DefaultPasswordBanner
                  onChangePassword={handleOpenChangePassword}
                />
              )}
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
              {!activeTab ? (
                <WorkspaceHome
                  connection={selectedConnection}
                  onQuery={handleOpenQueryForExplorer}
                  onErd={handleOpenErdForExplorer}
                  onManageSources={handleOpenNewConnection}
                  onSettings={() => {
                    if (canManageUsers(currentUser?.role)) {
                      setAdminPanelDefaultTab("users");
                      setIsAdminPanelOpen(true);
                    }
                  }}
                  onHistory={handleOpenWelcomeHistory}
                  onSearch={handleOpenCommandPalette}
                  canQuery={Boolean(selectedConnection || activeConnection)}
                  canErd={Boolean(
                    (selectedConnection || activeConnection)?.type !==
                      "redis" &&
                    (selectedConnection || activeConnection),
                  )}
                  canHistory={Boolean(selectedConnection || activeConnection)}
                  canSettings={canManageSettings(currentUser?.role)}
                  canManageSources={canManageSettings(currentUser?.role)}
                />
              ) : (
                <>
                  {/* Open Query Tabs (Preserved in DOM with visibility toggle for instant switching) */}
                  {queryTabs.map((t) => {
                    const connection = connections.find(
                      (item) => item.id === t.connectionId,
                    );
                    if (!connection) return null;
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "flex h-full flex-1 flex-col overflow-hidden",
                          activeTabId === t.id ? "flex" : "hidden",
                        )}
                      >
                        <Suspense
                          fallback={
                            <div className="text-muted-foreground flex flex-1 items-center justify-center font-mono text-xs">
                              Loading Query Console...
                            </div>
                          }
                        >
                          <ErrorBoundary>
                            {connection.type === "redis" ? (
                              <RedisCliConsole
                                connId={connection.id}
                                connectionName={connection.name}
                                environment={connection.environment}
                                isReadOnly={Boolean(connection.read_only)}
                                initialCommand={t.state?.queryText}
                                workspaceTabId={t.id}
                                onCommandChange={(queryText) =>
                                  updateTabState(t.id, { queryText })
                                }
                              />
                            ) : (
                              <QueryConsole
                                connection={connection}
                                workspaceTabId={t.id}
                                tables={
                                  tablesByConnection[t.connectionId] || []
                                }
                                initialQuery={t.state?.queryText}
                                onQueryChange={(queryText) =>
                                  updateTabState(t.id, { queryText })
                                }
                                onNavigateToTable={(tableName) =>
                                  handleOpenTableForConnection(
                                    t.connectionId,
                                    tableName,
                                  )
                                }
                                onOpenAISettings={handleOpenAISettings}
                              />
                            )}
                          </ErrorBoundary>
                        </Suspense>
                      </div>
                    );
                  })}

                  {/* Open ERD Tabs (Preserved in DOM with visibility toggle) */}
                  {erdTabs.map((t) => {
                    const connection = connections.find(
                      (item) => item.id === t.connectionId,
                    );
                    if (!connection) return null;
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "flex h-full flex-1 flex-col overflow-hidden",
                          activeTabId === t.id ? "flex" : "hidden",
                        )}
                      >
                        <Suspense
                          fallback={
                            <div className="text-muted-foreground flex flex-1 items-center justify-center font-mono text-xs">
                              Loading ERD Diagram...
                            </div>
                          }
                        >
                          <ERDView
                            connectionId={connection.id}
                            connectionName={connection.name}
                            onOpenTable={(tableName) =>
                              handleOpenTableForConnection(
                                t.connectionId,
                                tableName,
                              )
                            }
                            onGenerateJoinQuery={(query, title) =>
                              openQueryTab(t.connectionId, query, title)
                            }
                          />
                        </Suspense>
                      </div>
                    );
                  })}

                  {/* Schema Diff Views */}
                  {diffTabs.map((t) => (
                    <div
                      key={t.id}
                      className={cn(
                        "flex h-full flex-1 flex-col overflow-hidden",
                        activeTabId === t.id ? "flex" : "hidden",
                      )}
                    >
                      <Suspense
                        fallback={
                          <div className="text-muted-foreground flex flex-1 items-center justify-center font-mono text-xs">
                            Loading Schema Diff...
                          </div>
                        }
                      >
                        <SchemaDiff
                          connections={connections}
                          sourceConnectionId={t.state?.diffSourceConnectionId}
                          targetConnectionId={t.state?.diffTargetConnectionId}
                          onConnectionPairChange={(source, target) =>
                            updateTabState(t.id, {
                              diffSourceConnectionId: source,
                              diffTargetConnectionId: target,
                            })
                          }
                          onOpenQueryConsole={(query, title, destinationId) =>
                            openQueryTab(
                              destinationId ||
                                t.state?.diffTargetConnectionId ||
                                t.connectionId,
                              query,
                              title,
                            )
                          }
                          onError={(message) => setTabError(t.id, message)}
                        />
                      </Suspense>
                    </div>
                  ))}

                  {/* Table Data View or Redis Key Browser */}
                  {tabs
                    .filter((tab) => tab.type === "table")
                    .map((tab) => {
                      const connection = connections.find(
                        (item) => item.id === tab.connectionId,
                      );
                      if (!connection) return null;
                      const tabTables =
                        tablesByConnection[tab.connectionId] || [];
                      const tableName = tab.tableName || null;
                      const tableSchema = tableName
                        ? tabTables.find(
                            (table) =>
                              table.name === tableName &&
                              (table.schema_name || "") ===
                                (tab.schemaName || ""),
                          )
                        : null;
                      const rowQuery = rowsByTabId[tab.id];
                      const state = tab.state || {
                        page: 0,
                        pageSize: DEFAULT_PAGE_SIZE,
                        filters: [],
                        sortBy: "",
                        sortDesc: false,
                      };
                      const isSelectedTab = activeTabId === tab.id;
                      const openRowModal = (
                        row: Record<string, unknown> | null,
                        duplicate = false,
                      ) => {
                        if (connection.read_only) return;
                        setRowActionContext({
                          connectionId: tab.connectionId,
                          tableName: tableName || "",
                          tabId: tab.id,
                        });
                        setEditingRow(
                          row && duplicate
                            ? { ...row, _isDuplicate: true }
                            : row,
                        );
                        setIsRowModalOpen(true);
                      };
                      return (
                        <div
                          key={tab.id}
                          className={cn(
                            "flex h-full flex-1 flex-col overflow-hidden",
                            isSelectedTab ? "flex" : "hidden",
                          )}
                        >
                          {connection.type === "redis" ? (
                            <Suspense
                              fallback={
                                <div className="text-muted-foreground flex flex-1 items-center justify-center font-mono text-xs">
                                  Loading Redis Studio...
                                </div>
                              }
                            >
                              <RedisStudio
                                key={`redis-${connection.id}-${tab.id}`}
                                connId={connection.id}
                                connectionName={connection.name}
                                environment={connection.environment}
                                isReadOnly={Boolean(connection.read_only)}
                                initialKeySearch={tab.state?.redisSearchKey}
                                initialCommand={tab.state?.queryText}
                                workspaceTabId={tab.id}
                              />
                            </Suspense>
                          ) : !tableName || !tableSchema ? (
                            tableStatusByConnection[tab.connectionId]?.error ? (
                              <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm">
                                <span>
                                  {t(
                                    "explorer.schemaUnavailable",
                                    "Schema is unavailable. Check this connection in the Database explorer for details and retry options.",
                                  )}
                                </span>
                              </div>
                            ) : (
                              <EmptyTableScreen
                                connectionName={connection.name}
                                hasTables={tabTables.length > 0}
                                onReintrospect={() =>
                                  refreshConnectionTables(tab.connectionId)
                                }
                              />
                            )
                          ) : (
                            <DataGrid
                              connId={connection.id}
                              workspaceTabId={tab.id}
                              workspaceId={namedWorkspaces.scopeId}
                              initialSelectedCell={state.selectedCell}
                              dbType={connection.type}
                              connectionName={connection.name}
                              queryTimeMs={rowQuery?.data?.query_time_ms}
                              table={tableSchema}
                              rows={rowQuery?.data?.rows || []}
                              totalCount={rowQuery?.data?.total_count || 0}
                              isLoading={Boolean(
                                rowQuery?.isLoading || rowQuery?.isFetching,
                              )}
                              page={state.page || 0}
                              pageSize={state.pageSize || DEFAULT_PAGE_SIZE}
                              onPageChange={(page) =>
                                updateTabState(tab.id, { page })
                              }
                              onPageSizeChange={(pageSize) =>
                                updateTabState(tab.id, { pageSize, page: 0 })
                              }
                              sortBy={state.sortBy || ""}
                              sortDesc={Boolean(state.sortDesc)}
                              onSortChange={(sortBy, sortDesc) =>
                                updateTabState(tab.id, {
                                  sortBy,
                                  sortDesc,
                                  page: 0,
                                })
                              }
                              filters={state.filters || []}
                              onFiltersChange={(filters) =>
                                updateTabState(tab.id, { filters, page: 0 })
                              }
                              onRefresh={async () => {
                                await Promise.all([
                                  refreshConnectionTables(tab.connectionId),
                                  rowQuery?.refetch(),
                                ]);
                              }}
                              onScrollPositionChange={(scrollLeft, scrollTop) =>
                                updateTabState(tab.id, {
                                  scrollLeft,
                                  scrollTop,
                                })
                              }
                              initialScrollPosition={{
                                left: state.scrollLeft || 0,
                                top: state.scrollTop || 0,
                              }}
                              isReadOnly={Boolean(connection.read_only)}
                              onFindEverywhere={(value) => {
                                findFocusedValues.current[tab.id] = value;
                                openFindEverywhere(value ?? "");
                              }}
                              onFocusedCellValueChange={(value) => {
                                findFocusedValues.current[tab.id] = value;
                              }}
                              onFocusedCellLocationChange={(cell) => {
                                if (cell) {
                                  selectedCells.current[tab.id] = cell;
                                  setNavigationHistory((history) => {
                                    const current =
                                      history.entries[history.cursor];
                                    if (!current || current.tabId !== tab.id)
                                      return history;
                                    const entries = [...history.entries];
                                    entries[history.cursor] = {
                                      ...current,
                                      selectedCell: cell,
                                    };
                                    return { ...history, entries };
                                  });
                                }
                              }}
                              onOpenQueryConsole={(query, title) =>
                                openQueryTab(tab.connectionId, query, title)
                              }
                              onAddRow={() => openRowModal(null)}
                              onEditRow={(row) => openRowModal(row)}
                              onDuplicateRow={(row) => openRowModal(row, true)}
                              onCommitRow={(original, values) =>
                                handleSaveRow(
                                  tab.connectionId,
                                  tableName,
                                  original,
                                  values,
                                )
                              }
                              onCommitDeleteRow={(row) =>
                                handleDeleteRow(
                                  tab.connectionId,
                                  tableName,
                                  row,
                                )
                              }
                              onNavigateRelation={(
                                targetTable,
                                targetColumn,
                                value,
                              ) =>
                                openTableTab(
                                  tab.connectionId,
                                  targetTable,
                                  false,
                                  {
                                    filters: [
                                      {
                                        column: targetColumn,
                                        operator: "eq",
                                        value: String(value),
                                      },
                                    ],
                                    page: 0,
                                  },
                                )
                              }
                              onNavigateReference={(
                                connectionId,
                                targetTable,
                                targetColumn,
                                value,
                                rowIdentity,
                              ) => {
                                const sourceId = activeTabRef.current?.id;
                                const targetId = openTableTab(
                                  connectionId,
                                  targetTable,
                                  false,
                                  {
                                    filters: [
                                      {
                                        column: targetColumn,
                                        operator: "eq",
                                        value: String(value),
                                      },
                                    ],
                                    page: 0,
                                    selectedCell: {
                                      column: targetColumn,
                                      rowIdentity:
                                        rowIdentity ?? JSON.stringify([value]),
                                    },
                                  },
                                );
                                if (targetId)
                                  setNavigationHistory((history) => {
                                    const source = sourceId
                                      ? pushNavigation(history, {
                                          tabId: sourceId,
                                          selectedCell:
                                            selectedCells.current[sourceId],
                                        })
                                      : history;
                                    return pushNavigation(source, {
                                      tabId: targetId,
                                      selectedCell: {
                                        column: targetColumn,
                                        rowIdentity:
                                          rowIdentity ??
                                          JSON.stringify([value]),
                                      },
                                    });
                                  });
                              }}
                            />
                          )}
                        </div>
                      );
                    })}
                </>
              )}
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

        <Suspense fallback={null}>
          <NotificationPanel
            open={isNotificationPanelOpen}
            notifications={notifications}
            onReadAll={handleMarkNotificationsRead}
            onDismiss={(id) =>
              setNotifications((items) =>
                items.filter((item) => item.id !== id),
              )
            }
            onClear={() => setNotifications([])}
            onClose={() => setIsNotificationPanelOpen(false)}
          />
        </Suspense>

        {/* Connection Modal */}
        {isConnModalOpen && (
          <Suspense fallback={null}>
            <ConnectionModal
              key={
                editingConnection
                  ? `edit-${editingConnection.id}`
                  : cloningConnection
                    ? `clone-${cloningConnection.id}`
                    : "new-conn"
              }
              isOpen={isConnModalOpen}
              onClose={() => {
                setIsConnModalOpen(false);
                setCloningConnection(null);
                setEditingConnection(null);
              }}
              onSubmit={handleSaveConnection}
              cloneData={cloningConnection}
              editData={editingConnection}
            />
          </Suspense>
        )}

        {/* Row Insert/Edit Modal */}
        {rowActionContext &&
          isRowModalOpen &&
          tablesByConnection[rowActionContext.connectionId]?.some(
            (table) => table.name === rowActionContext.tableName,
          ) && (
            <Suspense fallback={null}>
              <RowModal
                key={
                  editingRow
                    ? String(
                        (editingRow as Record<string, unknown>).id ??
                          (editingRow as Record<string, unknown>)._id ??
                          "editing-row",
                      )
                    : "new-row"
                }
                isOpen={isRowModalOpen}
                onClose={() => {
                  setIsRowModalOpen(false);
                  setEditingRow(null);
                  setRowActionContext(null);
                }}
                table={tablesByConnection[rowActionContext.connectionId]!.find(
                  (table) => table.name === rowActionContext.tableName,
                )!}
                initialRow={editingRow}
                onSave={(values) => {
                  window.dispatchEvent(
                    new CustomEvent("pb:stage-row-draft", {
                      detail: {
                        tabId: rowActionContext.tabId,
                        connectionId: rowActionContext.connectionId,
                        tableName: rowActionContext.tableName,
                        original:
                          editingRow &&
                          !(editingRow as Record<string, unknown>)._isDuplicate
                            ? editingRow
                            : null,
                        values,
                      },
                    }),
                  );
                  return Promise.resolve();
                }}
                onDelete={
                  editingRow
                    ? async () => {
                        window.dispatchEvent(
                          new CustomEvent("pb:stage-delete-draft", {
                            detail: {
                              tabId: rowActionContext.tabId,
                              connectionId: rowActionContext.connectionId,
                              tableName: rowActionContext.tableName,
                              row: editingRow,
                            },
                          }),
                        );
                        setIsRowModalOpen(false);
                        setEditingRow(null);
                        setRowActionContext(null);
                      }
                    : undefined
                }
              />
            </Suspense>
          )}

        {/* Admin Panel Modal */}
        {isAdminPanelOpen && (
          <Suspense fallback={null}>
            <AdminPanel
              isOpen={isAdminPanelOpen}
              onClose={() => {
                if (!isDefaultPassword) setIsAdminPanelOpen(false);
              }}
              defaultTab={adminPanelDefaultTab}
              forcePasswordChange={isDefaultPassword}
            />
          </Suspense>
        )}

        <Suspense fallback={null}>
          <SettingsDialog
            open={isSettingsOpen}
            onOpenChange={setIsSettingsOpen}
            role={currentUser?.role}
            manualModeAvailable={Boolean(
              activeConnection &&
              !activeConnection.read_only &&
              ["postgres", "mysql"].includes(activeConnection.type),
            )}
            theme={theme}
            onToggleTheme={toggleTheme}
            onOpenAdmin={() => {
              setIsSettingsOpen(false);
              setAdminPanelDefaultTab("users");
              setIsAdminPanelOpen(true);
            }}
            onOpenAISettings={() => {
              setIsSettingsOpen(false);
              handleOpenAISettings();
            }}
            onCheckUpdates={() => {
              setIsSettingsOpen(false);
              void openDialogAndCheck();
            }}
          />
        </Suspense>
        <Suspense fallback={null}>
          <AboutDialog
            open={isAboutOpen}
            onOpenChange={setIsAboutOpen}
            onCheckUpdates={() => {
              setIsAboutOpen(false);
              void openDialogAndCheck();
            }}
          />
        </Suspense>

        {/* AI Vault & Provider Settings Modal */}
        {isAISettingsOpen && (
          <Suspense fallback={null}>
            <AISettingsModal
              isOpen={isAISettingsOpen}
              onClose={() => setIsAISettingsOpen(false)}
            />
          </Suspense>
        )}

        {/* Global Command Palette Modal */}
        <ShortcutsDialog
          open={isShortcutsOpen}
          onOpenChange={setIsShortcutsOpen}
        />

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

        <FindEverywhereDialog
          open={isFindEverywhereOpen}
          onClose={closeFindEverywhere}
          initialValue={findInitialValue}
          currentConnections={scopedConnections}
          allConnections={connections}
          onOpenMatch={(match: FindMatch, row) => {
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
                  const schema = (
                    tablesByConnection[match.connectionId] ?? []
                  ).find((candidate) => candidate.name === match.table);
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
            setIsFindEverywhereOpen(false);
          }}
        />

        <RunFromLogDialog
          open={isRunFromLogOpen}
          onClose={() => setIsRunFromLogOpen(false)}
          connections={scopedConnections}
          currentConnection={displayConnection}
          tablesByConnection={tablesByConnection}
          onRun={(connectionId, statement) => {
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
          }}
        />

        {/* Onboarding Tour & Welcome Modal */}
        {(isOnboardingWelcomeOpen || isSpotlightTourActive) && (
          <Suspense fallback={null}>
            <OnboardingTour
              userId={currentUser?.id}
              isWelcomeOpen={isOnboardingWelcomeOpen}
              onCloseWelcome={() => setIsOnboardingWelcomeOpen(false)}
              isTourActive={isSpotlightTourActive}
              onStartTour={() => setIsSpotlightTourActive(true)}
              onCloseTour={() => setIsSpotlightTourActive(false)}
            />
          </Suspense>
        )}
        {/* Software Update Dialog */}
        <UpdateDialog
          isOpen={isUpdateDialogOpen}
          onClose={() => setIsUpdateDialogOpen(false)}
          updateInfo={updateInfo}
          onRefresh={handleCheckUpdate}
          isLoading={isCheckingUpdate}
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
      />
    </div>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const setAuth = useAuthStore((s) => s.setAuth);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const setInitialized = useAuthStore((s) => s.setInitialized);

  useEffect(() => {
    if (!token) {
      setInitialized();
      return;
    }
    // Validate the persisted token against the backend.
    fetchMe()
      .then((res) => {
        setAuth(res.user, token, res.is_default_password);
      })
      .catch(() => {
        clearAuth();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss the static splash overlay smoothly once initialization completes
  useEffect(() => {
    if (isInitialized) {
      const splash = document.getElementById("pb-splash");
      if (splash) {
        splash.classList.add("pb-splash-hidden");
        const timer = setTimeout(() => {
          splash.remove();
          document.body.style.backgroundColor = "";
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [isInitialized]);

  if (!isInitialized) {
    // If the HTML splash overlay exists, let it handle the single continuous loading sequence
    if (
      typeof document !== "undefined" &&
      document.getElementById("pb-splash")
    ) {
      return null;
    }
    return <SplashScreen />;
  }

  if (!token) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthGuard>
            <PebblebaseStudio />
          </AuthGuard>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
