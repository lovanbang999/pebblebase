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
import { StatusBar } from "@/components/layout/StatusBar";
import type { Connection, SavedQuery, StudioTabState } from "./lib/types";
import { WorkspaceHome } from "@/components/common/WorkspaceHome";
import Sidebar from "@/components/layout/Sidebar";
import {
  TabBar,
  DesktopTitleBar,
  CommandPalette,
  type CommandActionId,
} from "@/components/layout";
import {
  DataGrid,
  EmptyTableScreen,
  ConnectionErrorScreen,
} from "@/components/grid";
import {
  ErrorBanner,
  WelcomeScreen,
  SplashScreen,
  ErrorBoundary,
  UpdateDialog,
} from "@/components/common";
import { DeleteRowDialog } from "@/components/modals";
import { LoginScreen, DefaultPasswordBanner } from "@/components/auth";
import {
  getRecentItems,
  addRecentItem,
  clearRecentItems,
  type RecentItem,
} from "./lib/recentItems";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
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
  const [isAISettingsOpen, setIsAISettingsOpen] = useState(false);
  // Shared admin panel tab — 'password' when triggered from user menu
  const [adminPanelDefaultTab, setAdminPanelDefaultTab] = useState<
    "users" | "password"
  >("users");

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItem[]>(() =>
    getRecentItems(),
  );

  const isDefaultPassword = useAuthStore((s) => s.isDefaultPassword);
  const currentUser = useAuthStore((s) => s.user);

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
    closeOtherTabs,
    closeTabsToRight,
    closeConnectionTabs,
    duplicateTab,
    reorderTabs,
    updateTabState,
    selectedExplorerNode,
    selectExplorerConnection,
    selectExplorerTable,
    reconcile,
    initializeWorkspace,
  } = workspace;
  const { t } = useTranslation();
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
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
    selectedConnection,
    selectedConnectionId,
    activeConnection,
    tables,
    activeTables,
    tablesByConnection,
    tableStatusByConnection,
    loadedTableConnectionIds,
    isLoadingTables,
    tablesError,
    activeTablesError,
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
    isRowModalOpen,
    setIsRowModalOpen,
    editingRow,
    setEditingRow,
    rowToDelete,
    setRowToDelete,
    handleCreateConnection,
    handleDeleteConnection,
    handleSaveRow,
    handleSaveCell,
    handleDeleteRow,
  } = usePebblebaseStudio({ tabs, activeTab, selectedExplorerNode });

  const displayConnection = activeConnection || selectedConnection;
  const handleOpenQueryForExplorer = useCallback(
    (query?: string, title?: string) => {
      const connectionId = selectedConnection?.id || activeConnection?.id;
      if (connectionId) openQueryTab(connectionId, query, title);
    },
    [selectedConnection?.id, activeConnection?.id, openQueryTab],
  );
  const handleOpenErdForExplorer = useCallback(() => {
    const connectionId = selectedConnection?.id || activeConnection?.id;
    if (connectionId) openErdTab(connectionId);
  }, [selectedConnection?.id, activeConnection?.id, openErdTab]);
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
      connectionsLoaded: !isLoadingConnections,
    });
  }, [
    connections,
    tablesByConnection,
    loadedTableConnectionIds,
    isLoadingConnections,
    reconcile,
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

  // Consolidated global keyboard shortcuts (Alt+Q, Alt+E, Cmd/Ctrl+K, Desktop shortcuts)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const currentActiveTab = activeTabRef.current;
      const currentTabs = tabsRef.current;

      // Cmd+K / Ctrl+K: Command Palette
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
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

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleOpenQueryForExplorer, handleOpenErdForExplorer, setActiveTabId]);

  // Fetch saved queries for current connection
  useEffect(() => {
    if (!activeConnection?.id) {
      setSavedQueries([]);
      return;
    }
    let current = true;
    fetchSavedQueries(activeConnection.id)
      .then((queries) => {
        if (current) setSavedQueries(queries);
      })
      .catch(() => {
        if (current) setSavedQueries([]);
      });
    return () => {
      current = false;
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
    [openQueryTab],
  );

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
      await handleDeleteConnection(connectionId);
      const closedCount = closeConnectionTabs(connectionId);
      if (closedCount > 0) {
        setWorkspaceNotice(
          t("workspace.connectionRemovedTabsClosed", {
            count: closedCount,
            connectionName,
          }),
        );
      }
    },
    [connections, handleDeleteConnection, closeConnectionTabs, t],
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
        case "open_migration":
          if (activeConnection && activeTableSchema) {
            openTableTab(activeConnection.id, activeTableSchema.name);
          } else if (tables.length > 0) {
            openTableTab(selectedConnection!.id, tables[0].name);
          } else {
            handleOpenQueryForExplorer(
              "-- Schema Migration Runner\n-- Write your DDL statements here (e.g. ALTER TABLE, CREATE TABLE)",
              "Migration Runner",
            );
          }
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
          setAdminPanelDefaultTab("users");
          setIsAdminPanelOpen(true);
          break;
        case "open_ai_settings":
          setIsAISettingsOpen(true);
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
    ],
  );

  // Sidebar stable callbacks
  const handleCloneConnection = useCallback(
    (conn: Connection) => {
      setCloningConnection(conn);
      setIsConnModalOpen(true);
    },
    [setCloningConnection, setIsConnModalOpen],
  );

  const handleOpenNewConnection = useCallback(() => {
    setCloningConnection(null);
    setIsConnModalOpen(true);
  }, [setCloningConnection, setIsConnModalOpen]);

  const handleRefreshTables = useCallback(async () => {
    if (selectedConnectionId)
      await refreshConnectionTables(selectedConnectionId);
  }, [selectedConnectionId, refreshConnectionTables]);

  const handleOpenAdminPanel = useCallback(() => {
    setAdminPanelDefaultTab("users");
    setIsAdminPanelOpen(true);
  }, []);

  const handleOpenAISettings = useCallback(() => {
    setIsAISettingsOpen(true);
  }, []);

  const handleOpenChangePassword = useCallback(() => {
    setAdminPanelDefaultTab("password");
    setIsAdminPanelOpen(true);
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  const handleOpenOnboarding = useCallback(() => {
    setIsOnboardingWelcomeOpen(true);
  }, []);

  const handleConfirmDeleteRow = useCallback(async () => {
    if (!rowToDelete || !rowActionContext) return;
    try {
      await handleDeleteRow(
        rowActionContext.connectionId,
        rowActionContext.tableName,
        rowToDelete,
      );
    } catch {
      // The connection-scoped mutation records the useful message for its tab.
    } finally {
      setRowToDelete(null);
      setRowActionContext(null);
    }
  }, [rowToDelete, rowActionContext, handleDeleteRow, setRowToDelete]);

  const selectedTable = useMemo(
    () =>
      selectedExplorerNode?.kind === "table"
        ? selectedExplorerNode.tableName
        : null,
    [selectedExplorerNode],
  );

  // Derived memoized values
  const activeView = useMemo(
    () =>
      activeTab?.type === "query"
        ? "console"
        : activeTab?.type === "erd"
          ? "erd"
          : "table",
    [activeTab?.type],
  );

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
          "--titlebar-height": isDesktop ? "40px" : "0px",
        } as React.CSSProperties
      }
      className="flex h-dvh w-screen flex-col overflow-hidden bg-white font-sans text-zinc-900 transition-colors dark:bg-zinc-950 dark:text-zinc-100"
    >
      <DesktopTitleBar
        activeConnectionName={displayConnection?.name}
        activeDatabaseType={displayConnection?.type}
        onOpenCommandPalette={handleOpenCommandPalette}
      />
      <SidebarProvider
        defaultOpen={true}
        className="min-h-0 w-full flex-1 overflow-hidden"
        style={
          {
            "--activity-rail-width": "36px",
          } as React.CSSProperties
        }
      >
        <ActivityRail
          theme={theme}
          databaseType={displayConnection?.type}
          activeView={activeTab?.type === "diff" ? "diff" : activeView}
          onQuery={handleOpenQueryForExplorer}
          onErd={handleOpenErdForExplorer}
          onDiff={handleOpenDiffForExplorer}
          onNewConnection={handleOpenNewConnection}
          onSearch={handleOpenCommandPalette}
          onAISettings={handleOpenAISettings}
          onToggleTheme={toggleTheme}
        />
        {/* Left Sidebar */}
        <Sidebar
          theme={theme}
          onToggleTheme={toggleTheme}
          connections={connections}
          selectedConnection={selectedConnection}
          onSelectConnection={handleSelectConnectionWithRecent}
          onDeleteConnection={handleDeleteConnectionAndCloseTabs}
          onCloneConnection={handleCloneConnection}
          onOpenNewConnection={handleOpenNewConnection}
          tables={tables}
          selectedTable={selectedTable}
          onSelectTable={handleOpenTableWithRecent}
          isLoadingTables={isLoadingTables}
          tablesError={tablesError}
          onRefreshTables={handleRefreshTables}
          activeView={activeView}
          onOpenQueryConsole={handleOpenQueryForExplorer}
          onOpenERD={handleOpenErdForExplorer}
          onOpenDiff={handleOpenDiffForExplorer}
          onOpenAdminPanel={handleOpenAdminPanel}
          onOpenChangePassword={handleOpenChangePassword}
          onOpenCommandPalette={handleOpenCommandPalette}
          onOpenOnboarding={handleOpenOnboarding}
          onOpenAISettings={handleOpenAISettings}
        />

        {/* Main Content Pane */}
        <SidebarInset className="bg-background flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {/* Default password warning banner */}
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
              activeConnection
                ? () => handleCloneConnection(activeConnection)
                : undefined
            }
          />

          {/* Dynamic Main Views */}
          {connections.length === 0 && !isLoadingConnections ? (
            <WelcomeScreen onOpenNewConnection={handleOpenNewConnection} />
          ) : (
            <>
              {!activeTab &&
                (tablesError && selectedConnection ? (
                  <ConnectionErrorScreen
                    connection={selectedConnection}
                    error={
                      tablesError instanceof Error
                        ? tablesError.message
                        : String(tablesError)
                    }
                    onRetry={handleRefreshTables}
                    isRetrying={isLoadingTables}
                    onEditConnection={() =>
                      handleCloneConnection(selectedConnection)
                    }
                  />
                ) : (
                  <WorkspaceHome
                    connection={selectedConnection}
                    tables={tables.map((table) => table.name)}
                    isLoading={isLoadingConnections || isLoadingTables}
                    onOpenTable={handleOpenTableWithRecent}
                    onQuery={handleOpenQueryForExplorer}
                    onErd={handleOpenErdForExplorer}
                    onDiff={handleOpenDiffForExplorer}
                    onNewConnection={handleOpenNewConnection}
                    onSearch={handleOpenCommandPalette}
                  />
                ))}
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
                        <div className="flex flex-1 items-center justify-center font-mono text-xs text-zinc-500">
                          Loading Query Console...
                        </div>
                      }
                    >
                      <ErrorBoundary>
                        <QueryConsole
                          connection={connection}
                          workspaceTabId={t.id}
                          tables={tablesByConnection[t.connectionId] || []}
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
                        <div className="flex flex-1 items-center justify-center font-mono text-xs text-zinc-500">
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
                      <div className="flex flex-1 items-center justify-center font-mono text-xs text-zinc-500">
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
                      onOpenQueryConsole={(query, title) =>
                        openQueryTab(
                          t.state?.diffSourceConnectionId || t.connectionId,
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
                  const tabTables = tablesByConnection[tab.connectionId] || [];
                  const tableName = tab.tableName || null;
                  const tableSchema = tableName
                    ? tabTables.find(
                        (table) =>
                          table.name === tableName &&
                          (table.schema_name || "") === (tab.schemaName || ""),
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
                      row && duplicate ? { ...row, _isDuplicate: true } : row,
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
                            <div className="flex flex-1 items-center justify-center font-mono text-xs text-zinc-500">
                              Loading Redis Studio...
                            </div>
                          }
                        >
                          <RedisStudio
                            key={`redis-${connection.id}-${tab.id}`}
                            connId={connection.id}
                            isReadOnly={Boolean(connection.read_only)}
                          />
                        </Suspense>
                      ) : !tableName || !tableSchema ? (
                        tableStatusByConnection[tab.connectionId]?.error ? (
                          <ConnectionErrorScreen
                            connection={connection}
                            error={
                              tableStatusByConnection[tab.connectionId]
                                ?.error instanceof Error
                                ? (
                                    tableStatusByConnection[tab.connectionId]
                                      ?.error as Error
                                  ).message
                                : String(
                                    tableStatusByConnection[tab.connectionId]
                                      ?.error,
                                  )
                            }
                            onRetry={() =>
                              refreshConnectionTables(tab.connectionId)
                            }
                            isRetrying={Boolean(
                              tableStatusByConnection[tab.connectionId]
                                ?.isFetching,
                            )}
                            onEditConnection={() =>
                              handleCloneConnection(connection)
                            }
                          />
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
                          dbType={connection.type}
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
                            updateTabState(tab.id, { scrollLeft, scrollTop })
                          }
                          initialScrollPosition={{
                            left: state.scrollLeft || 0,
                            top: state.scrollTop || 0,
                          }}
                          isReadOnly={Boolean(connection.read_only)}
                          onOpenQueryConsole={(query, title) =>
                            openQueryTab(tab.connectionId, query, title)
                          }
                          onAddRow={() => openRowModal(null)}
                          onEditRow={(row) => openRowModal(row)}
                          onDuplicateRow={(row) => openRowModal(row, true)}
                          onDeleteRow={(row) => {
                            if (connection.read_only || !tableName) return;
                            setRowActionContext({
                              connectionId: tab.connectionId,
                              tableName,
                              tabId: tab.id,
                            });
                            setRowToDelete(row);
                          }}
                          onSaveCell={(row, columnName, value) =>
                            handleSaveCell(
                              tab.connectionId,
                              tableName,
                              row,
                              columnName,
                              value,
                            )
                          }
                          onNavigateRelation={(
                            targetTable,
                            targetColumn,
                            value,
                          ) =>
                            openTableTab(tab.connectionId, targetTable, false, {
                              filters: [
                                {
                                  column: targetColumn,
                                  operator: "eq",
                                  value: String(value),
                                },
                              ],
                              page: 0,
                            })
                          }
                        />
                      )}
                    </div>
                  );
                })}
            </>
          )}
        </SidebarInset>

        {/* Connection Modal */}
        {isConnModalOpen && (
          <Suspense fallback={null}>
            <ConnectionModal
              key={
                cloningConnection ? `clone-${cloningConnection.id}` : "new-conn"
              }
              isOpen={isConnModalOpen}
              onClose={() => {
                setIsConnModalOpen(false);
                setCloningConnection(null);
              }}
              onSubmit={handleCreateConnectionAndSelect}
              cloneData={cloningConnection}
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
                onSave={(values) =>
                  handleSaveRow(
                    rowActionContext.connectionId,
                    rowActionContext.tableName,
                    editingRow &&
                      !(editingRow as Record<string, unknown>)._isDuplicate
                      ? editingRow
                      : null,
                    values,
                  )
                }
                onDelete={
                  editingRow
                    ? async () => {
                        await handleDeleteRow(
                          rowActionContext.connectionId,
                          rowActionContext.tableName,
                          editingRow,
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

        {/* Delete Record Confirmation Dialog */}
        <DeleteRowDialog
          rowToDelete={rowToDelete}
          tableName={rowActionContext?.tableName || activeTable}
          onClose={() => {
            setRowToDelete(null);
            setRowActionContext(null);
          }}
          onConfirm={handleConfirmDeleteRow}
        />
        {/* Admin Panel Modal */}
        {isAdminPanelOpen && (
          <Suspense fallback={null}>
            <AdminPanel
              isOpen={isAdminPanelOpen}
              onClose={() => setIsAdminPanelOpen(false)}
              defaultTab={adminPanelDefaultTab}
            />
          </Suspense>
        )}

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
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          connections={connections}
          activeConnection={displayConnection}
          onSelectConnection={handleSelectConnectionWithRecent}
          tables={activeTables}
          onSelectTable={handleOpenTableWithRecent}
          savedQueries={savedQueries}
          onSelectSavedQuery={handleSelectSavedQueryWithRecent}
          recentItems={recentItems}
          onTriggerAction={handlePaletteAction}
          theme={theme}
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
        hasError={Boolean(
          activeErrorMessage || (activeTab ? activeTablesError : tablesError),
        )}
        tableName={activeTab?.type === "table" ? activeTab.tableName : null}
        isDefaultPassword={isDefaultPassword}
        onChangePassword={handleOpenChangePassword}
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
