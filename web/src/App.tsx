import { useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cn } from 'cn';
import type { Connection, SavedQuery, FilterOption } from './lib/types';
import Sidebar from '@/components/layout/Sidebar';
import { TabBar, DesktopTitleBar, CommandPalette, type CommandActionId } from '@/components/layout';
import { DataGrid, EmptyTableScreen } from '@/components/grid';
import { ErrorBanner, WelcomeScreen, SplashScreen, ErrorBoundary } from '@/components/common';
import { DeleteRowDialog } from '@/components/modals';
import { LoginScreen, DefaultPasswordBanner } from '@/components/auth';
import { getRecentItems, addRecentItem, clearRecentItems, type RecentItem } from './lib/recentItems';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { usePebblebaseStudio } from './hooks/usePebblebaseStudio';
import { useTabs } from './hooks/useTabs';
import { useAuthStore } from './lib/auth';
import { fetchMe, fetchSavedQueries, exportTableData, apiLogout } from './lib/api';
import { isDesktopApp, quitDesktopApp, toggleFullscreen } from './lib/platform';
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from '@/constants';

// Lazy-loaded heavy modules for fast desktop startup and minimal initial memory
const QueryConsole = lazy(() =>
  import('@/components/query/QueryConsole').then((m) => ({ default: m.QueryConsole }))
);
const ERDView = lazy(() => import('@/components/erd/ERDView'));
const SchemaDiff = lazy(() =>
  import('@/components/schema/SchemaDiff').then((m) => ({ default: m.SchemaDiff }))
);
const AdminPanel = lazy(() =>
  import('@/components/auth/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
const ConnectionModal = lazy(() =>
  import('@/components/modals/ConnectionModal').then((m) => ({ default: m.ConnectionModal }))
);
const RowModal = lazy(() =>
  import('@/components/modals/RowModal').then((m) => ({ default: m.RowModal }))
);
const OnboardingTour = lazy(() =>
  import('@/components/onboarding/OnboardingTour').then((m) => ({ default: m.OnboardingTour }))
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
  const [
    isAdminPanelOpen,
    setIsAdminPanelOpen,
  ] = useState(false);
  // Shared admin panel tab — 'password' when triggered from user menu
  const [
    adminPanelDefaultTab,
    setAdminPanelDefaultTab,
  ] = useState<'users' | 'password'>('users');

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [recentItems, setRecentItems] = useState<RecentItem[]>(() => getRecentItems());

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

  const [isTableTabActive, setIsTableTabActive] = useState(true);

  const {
    theme,
    toggleTheme,
    connections,
    isLoadingConnections,
    activeConnection,
    setUserSelectedConnectionId,
    setUserSelectedTable,
    tables,
    isLoadingTables,
    activeTable,
    activeTableSchema,
    refetchTables,
    rowsResult,
    isLoadingRows,
    refetchRows,
    page,
    setPage,
    pageSize,
    setPageSize,
    sortBy,
    setSortBy,
    sortDesc,
    setSortDesc,
    filters,
    setFilters,
    activeErrorMessage,
    setBannerError,
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
    handleConfirmDeleteRow,
    handleDeleteRowDirectly,
    deleteRowMutation,
    getWhereCondition,
  } = usePebblebaseStudio({ isTableTabActive });

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
    duplicateTab,
    updateActiveTabState,
  } = useTabs({
    connectionId: activeConnection?.id || null,
    tables,
  });

  const activeTabIdRef = useRef<string | null>(null);

  // Sync activeTab state into usePebblebaseStudio when active tab changes
  useEffect(() => {
    if (!activeTab) {
      activeTabIdRef.current = null;
      setIsTableTabActive((prev) => (prev !== false ? false : prev));
      return;
    }
    const isTable = activeTab.type === 'table';
    setIsTableTabActive((prev) => (prev !== isTable ? isTable : prev));

    if (activeTabIdRef.current === activeTab.id) {
      return;
    }
    activeTabIdRef.current = activeTab.id;

    if (isTable && activeTab.tableName) {
      setUserSelectedTable(activeTab.tableName);
      if (activeTab.state) {
        setPage(activeTab.state.page ?? 0);
        setPageSize(activeTab.state.pageSize ?? DEFAULT_PAGE_SIZE);
        setSortBy(activeTab.state.sortBy ?? '');
        setSortDesc(activeTab.state.sortDesc ?? false);
        setFilters(activeTab.state.filters ?? []);
      }
    }
  }, [
    activeTab,
    setUserSelectedTable,
    setPage,
    setPageSize,
    setSortBy,
    setSortDesc,
    setFilters,
  ]);

  const handleQueryTextChange = useCallback(
    (text: string) => {
      updateActiveTabState({ queryText: text });
    },
    [updateActiveTabState]
  );

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
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      // Alt+Q: Toggle / Open Query Console
      if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        if (currentActiveTab?.type === 'query') {
          const tableTab = currentTabs.find((t) => t.type === 'table');
          if (tableTab) {
            setActiveTabId(tableTab.id);
          }
        } else {
          openQueryTab();
        }
        return;
      }

      // Alt+E: Toggle / Open ERD
      if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (currentActiveTab?.type === 'erd') {
          const tableTab = currentTabs.find((t) => t.type === 'table');
          if (tableTab) {
            setActiveTabId(tableTab.id);
          }
        } else {
          openErdTab();
        }
        return;
      }

      // Desktop: Ctrl+Q to quit
      if ((e.metaKey || e.ctrlKey) && (e.key === 'q' || e.key === 'Q')) {
        if (isDesktopApp()) {
          e.preventDefault();
          quitDesktopApp();
        }
        return;
      }

      // Desktop / Web: F11 fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [openQueryTab, openErdTab, setActiveTabId]);

  // Fetch saved queries for current connection
  useEffect(() => {
    if (!activeConnection?.id) {
      setSavedQueries([]);
      return;
    }
    fetchSavedQueries(activeConnection.id)
      .then(setSavedQueries)
      .catch(() => setSavedQueries([]));
  }, [activeConnection?.id]);

  const handleOpenTableWithRecent = useCallback((tableName: string, openInNewTab?: boolean) => {
    openTableTab(tableName, openInNewTab);
    const updated = addRecentItem({
      id: tableName,
      type: 'table',
      title: tableName,
      subtitle: activeConnection ? `${activeConnection.name}` : undefined,
    });
    setRecentItems(updated);
  }, [openTableTab, activeConnection]);

  const handleSelectConnectionWithRecent = useCallback((conn: Connection) => {
    setUserSelectedConnectionId(conn.id);
    setUserSelectedTable(null);
    setBannerError(null);
    const updated = addRecentItem({
      id: conn.id,
      type: 'connection',
      title: conn.name,
      subtitle: conn.type.toUpperCase(),
    });
    setRecentItems(updated);
  }, [setUserSelectedConnectionId, setUserSelectedTable, setBannerError]);

  const handleSelectSavedQueryWithRecent = useCallback((sq: SavedQuery) => {
    openQueryTab(sq.query, sq.title);
    const updated = addRecentItem({
      id: sq.id,
      type: 'query',
      title: sq.title,
      subtitle: sq.query.slice(0, 35),
    });
    setRecentItems(updated);
  }, [openQueryTab]);

  const handlePaletteAction = useCallback((actionId: CommandActionId) => {
    switch (actionId) {
      case 'open_query_console':
        openQueryTab();
        break;
      case 'open_erd':
        openErdTab();
        break;
      case 'open_diff':
        openDiffTab();
        break;
      case 'open_migration':
        if (activeTableSchema) {
          openTableTab(activeTableSchema.name);
        } else if (tables.length > 0) {
          openTableTab(tables[0].name);
        } else {
          openQueryTab(
            '-- Schema Migration Runner\n-- Write your DDL statements here (e.g. ALTER TABLE, CREATE TABLE)',
            'Migration Runner'
          );
        }
        break;
      case 'export_csv':
      case 'export_json': {
        const format = actionId === 'export_csv' ? 'csv' : 'json';
        if (activeConnection && activeTable) {
          exportTableData(activeConnection.id, activeTable, format)
            .then((blob) => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `${activeTable}.${format}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            })
            .catch((err) => console.error('Export error:', err));
        }
        break;
      }
      case 'toggle_theme':
        toggleTheme();
        break;
      case 'open_settings':
        setAdminPanelDefaultTab('users');
        setIsAdminPanelOpen(true);
        break;
      case 'product_tour':
        setIsOnboardingWelcomeOpen(true);
        break;
      case 'sign_out':
        clearRecentItems();
        apiLogout().catch(() => {});
        useAuthStore.getState().clearAuth();
        break;
    }
  }, [openQueryTab, openErdTab, openDiffTab, openTableTab, activeTableSchema, tables, activeConnection, activeTable, toggleTheme]);

  // Sidebar stable callbacks
  const handleCloneConnection = useCallback((conn: Connection) => {
    setCloningConnection(conn);
    setIsConnModalOpen(true);
  }, [setCloningConnection, setIsConnModalOpen]);

  const handleOpenNewConnection = useCallback(() => {
    setCloningConnection(null);
    setIsConnModalOpen(true);
  }, [setCloningConnection, setIsConnModalOpen]);

  const handleRefreshTables = useCallback(async () => {
    await refetchTables();
    if (activeTable) {
      await refetchRows();
    }
  }, [refetchTables, refetchRows, activeTable]);

  const handleOpenAdminPanel = useCallback(() => {
    setAdminPanelDefaultTab('users');
    setIsAdminPanelOpen(true);
  }, []);

  const handleOpenChangePassword = useCallback(() => {
    setAdminPanelDefaultTab('password');
    setIsAdminPanelOpen(true);
  }, []);

  const handleOpenCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(true);
  }, []);

  const handleOpenOnboarding = useCallback(() => {
    setIsOnboardingWelcomeOpen(true);
  }, []);

  // DataGrid stable callbacks
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    updateActiveTabState({ page: newPage });
  }, [setPage, updateActiveTabState]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setPage(0);
    updateActiveTabState({ pageSize: newSize, page: 0 });
  }, [setPageSize, setPage, updateActiveTabState]);

  const handleSortChange = useCallback((col: string, desc: boolean) => {
    setSortBy(col);
    setSortDesc(desc);
    setPage(0);
    updateActiveTabState({ sortBy: col, sortDesc: desc, page: 0 });
  }, [setSortBy, setSortDesc, setPage, updateActiveTabState]);

  const handleFiltersChange = useCallback((newFilters: FilterOption[]) => {
    setFilters(newFilters);
    setPage(0);
    updateActiveTabState({ filters: newFilters, page: 0 });
  }, [setFilters, setPage, updateActiveTabState]);

  const handleRefreshGrid = useCallback(async () => {
    await Promise.all([refetchRows(), refetchTables()]);
  }, [refetchRows, refetchTables]);

  const handleAddRow = useCallback(() => {
    if (activeConnection?.read_only) return;
    setEditingRow(null);
    setIsRowModalOpen(true);
  }, [activeConnection?.read_only, setEditingRow, setIsRowModalOpen]);

  const handleEditRow = useCallback((row: Record<string, unknown>) => {
    if (activeConnection?.read_only) return;
    setEditingRow(row);
    setIsRowModalOpen(true);
  }, [activeConnection?.read_only, setEditingRow, setIsRowModalOpen]);

  const handleDuplicateRow = useCallback((row: Record<string, unknown>) => {
    if (activeConnection?.read_only) return;
    setEditingRow({ ...row, _isDuplicate: true });
    setIsRowModalOpen(true);
  }, [activeConnection?.read_only, setEditingRow, setIsRowModalOpen]);

  const handleDeleteRowAction = useCallback((row: Record<string, unknown>) => {
    if (activeConnection?.read_only) return;
    handleDeleteRowDirectly(row);
  }, [activeConnection?.read_only, handleDeleteRowDirectly]);

  const handleSaveCellAction = useCallback(async (row: Record<string, unknown>, colName: string, newVal: unknown) => {
    if (activeConnection?.read_only) return;
    await handleSaveCell(row, colName, newVal);
  }, [activeConnection?.read_only, handleSaveCell]);

  const handleNavigateRelation = useCallback((targetTable: string, targetColumn: string, value: unknown) => {
    openTableTab(targetTable, false, {
      filters: [{ column: targetColumn, operator: 'eq', value: String(value) }],
      page: 0,
    });
  }, [openTableTab]);

  const handleNavigateToTable = useCallback((tName: string) => {
    openTableTab(tName);
  }, [openTableTab]);

  // Derived memoized values
  const selectedTable = useMemo(
    () => (activeTab?.type === 'table' ? activeTab.tableName || null : null),
    [activeTab?.type, activeTab?.tableName]
  );

  const activeView = useMemo(
    () => (activeTab?.type === 'query' ? 'console' : activeTab?.type === 'erd' ? 'erd' : 'table'),
    [activeTab?.type]
  );

  const queryTabs = useMemo(
    () => tabs.filter((t) => t.type === 'query' && Boolean(activeConnection)),
    [tabs, activeConnection]
  );

  const erdTabs = useMemo(
    () => tabs.filter((t) => t.type === 'erd' && Boolean(activeConnection)),
    [tabs, activeConnection]
  );

  const diffTabs = useMemo(
    () => tabs.filter((t) => t.type === 'diff'),
    [tabs]
  );

  return (
    <div
      style={
        {
          "--titlebar-height": isDesktop ? "38px" : "0px",
        } as React.CSSProperties
      }
      className="h-screen w-screen flex flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans transition-colors"
    >
      <DesktopTitleBar
        activeConnectionName={activeConnection?.name}
        activeDatabaseType={activeConnection?.type}
        onOpenCommandPalette={handleOpenCommandPalette}
      />
      <SidebarProvider defaultOpen={true} className="flex-1 w-full overflow-hidden min-h-0">
        {/* Left Sidebar */}
        <Sidebar
          theme={theme}
          onToggleTheme={toggleTheme}
          connections={connections}
          selectedConnection={activeConnection}
          onSelectConnection={handleSelectConnectionWithRecent}
          onDeleteConnection={handleDeleteConnection}
          onCloneConnection={handleCloneConnection}
          onOpenNewConnection={handleOpenNewConnection}
          tables={tables}
          selectedTable={selectedTable}
          onSelectTable={handleOpenTableWithRecent}
          isLoadingTables={isLoadingTables}
          onRefreshTables={handleRefreshTables}
          activeView={activeView}
          onOpenQueryConsole={openQueryTab}
          onOpenERD={openErdTab}
          onOpenDiff={openDiffTab}
          onOpenAdminPanel={handleOpenAdminPanel}
          onOpenChangePassword={handleOpenChangePassword}
          onOpenCommandPalette={handleOpenCommandPalette}
          onOpenOnboarding={handleOpenOnboarding}
        />

      {/* Main Content Pane */}
      <SidebarInset className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
        {/* Default password warning banner */}
        {isDefaultPassword && (
          <DefaultPasswordBanner
            onChangePassword={handleOpenChangePassword}
          />
        )}

        {/* Chrome/DataGrip Style Tab Bar */}
        {activeConnection && connections.length > 0 && (
          <TabBar
            tabs={tabs}
            activeTabId={activeTabId}
            onSelectTab={setActiveTabId}
            onCloseTab={closeTab}
            onCloseOtherTabs={closeOtherTabs}
            onCloseTabsToRight={closeTabsToRight}
            onDuplicateTab={duplicateTab}
            onNewQueryTab={openQueryTab}
          />
        )}

        {/* Error notification banner */}
        <ErrorBanner message={activeErrorMessage} onDismiss={() => setBannerError(null)} />

        {/* Dynamic Main Views */}
        {connections.length === 0 && !isLoadingConnections ? (
          <WelcomeScreen
            onOpenNewConnection={handleOpenNewConnection}
          />
        ) : (
          <>
            {/* Open Query Tabs (Preserved in DOM with visibility toggle for instant switching) */}
            {queryTabs.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'flex-1 h-full flex flex-col overflow-hidden',
                  activeTabId === t.id ? 'flex' : 'hidden'
                )}
              >
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center text-xs font-mono text-zinc-500">
                      Loading Query Console...
                    </div>
                  }
                >
                  <ErrorBoundary>
                    <QueryConsole
                      connection={activeConnection!}
                      tables={tables}
                      initialQuery={t.state?.queryText}
                      onQueryChange={handleQueryTextChange}
                      onNavigateToTable={handleNavigateToTable}
                    />
                  </ErrorBoundary>
                </Suspense>
              </div>
            ))}

            {/* Open ERD Tabs (Preserved in DOM with visibility toggle) */}
            {erdTabs.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'flex-1 h-full flex flex-col overflow-hidden',
                  activeTabId === t.id ? 'flex' : 'hidden'
                )}
              >
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center text-xs font-mono text-zinc-500">
                      Loading ERD Diagram...
                    </div>
                  }
                >
                  <ERDView
                    connectionId={activeConnection!.id}
                    connectionName={activeConnection!.name}
                    onOpenTable={handleNavigateToTable}
                    onGenerateJoinQuery={openQueryTab}
                  />
                </Suspense>
              </div>
            ))}

            {/* Schema Diff Views */}
            {diffTabs.map((t) => (
              <div
                key={t.id}
                className={cn(
                  'flex-1 h-full flex flex-col overflow-hidden',
                  activeTabId === t.id ? 'flex' : 'hidden'
                )}
              >
                <Suspense
                  fallback={
                    <div className="flex-1 flex items-center justify-center text-xs font-mono text-zinc-500">
                      Loading Schema Diff...
                    </div>
                  }
                >
                  <SchemaDiff
                    connections={connections}
                    activeConnectionId={activeConnection?.id}
                    onOpenQueryConsole={openQueryTab}
                  />
                </Suspense>
              </div>
            ))}

            {/* Table Data View (Preserved when switching to/from console/ERD) */}
            <div
              className={cn(
                'flex-1 h-full flex flex-col overflow-hidden',
                activeTab?.type === 'table' ? 'flex' : 'hidden'
              )}
            >
              {!activeTable || !activeTableSchema ? (
                <EmptyTableScreen
                  connectionName={activeConnection?.name}
                  hasTables={tables.length > 0}
                  onReintrospect={refetchTables}
                />
              ) : (
                <DataGrid
                  key={`grid-${activeTab?.id || activeTable}`}
                  connId={activeConnection?.id}
                  dbType={activeConnection?.type}
                  table={activeTableSchema}
                  rows={rowsResult?.rows || []}
                  totalCount={rowsResult?.total_count || 0}
                  isLoading={isLoadingRows}
                  page={page}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                  sortBy={sortBy}
                  sortDesc={sortDesc}
                  onSortChange={handleSortChange}
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  onRefresh={handleRefreshGrid}
                  isReadOnly={Boolean(activeConnection?.read_only)}
                  onOpenQueryConsole={openQueryTab}
                  onAddRow={handleAddRow}
                  onEditRow={handleEditRow}
                  onDuplicateRow={handleDuplicateRow}
                  onDeleteRow={handleDeleteRowAction}
                  onSaveCell={handleSaveCellAction}
                  onNavigateRelation={handleNavigateRelation}
                />
              )}
            </div>
          </>
        )}
      </SidebarInset>

      {/* Connection Modal */}
      {isConnModalOpen && (
        <Suspense fallback={null}>
          <ConnectionModal
            key={cloningConnection ? `clone-${cloningConnection.id}` : 'new-conn'}
            isOpen={isConnModalOpen}
            onClose={() => {
              setIsConnModalOpen(false);
              setCloningConnection(null);
            }}
            onSubmit={handleCreateConnection}
            cloneData={cloningConnection}
          />
        </Suspense>
      )}

      {/* Row Insert/Edit Modal */}
      {activeTableSchema && isRowModalOpen && (
        <Suspense fallback={null}>
          <RowModal
            key={editingRow ? String((editingRow as Record<string, unknown>).id ?? (editingRow as Record<string, unknown>)._id ?? 'editing-row') : 'new-row'}
            isOpen={isRowModalOpen}
            onClose={() => {
              setIsRowModalOpen(false);
              setEditingRow(null);
            }}
            table={activeTableSchema}
            initialRow={editingRow}
            onSave={handleSaveRow}
            onDelete={
              editingRow
                ? async () => {
                    const where = getWhereCondition(editingRow);
                    await deleteRowMutation.mutateAsync(where);
                  }
                : undefined
            }
          />
        </Suspense>
      )}

      {/* Delete Record Confirmation Dialog */}
      <DeleteRowDialog
        rowToDelete={rowToDelete}
        tableName={activeTable}
        onClose={() => setRowToDelete(null)}
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

      {/* Global Command Palette Modal */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        connections={connections}
        activeConnection={activeConnection}
        onSelectConnection={handleSelectConnectionWithRecent}
        tables={tables}
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
      </SidebarProvider>
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
      const splash = document.getElementById('pb-splash');
      if (splash) {
        splash.classList.add('pb-splash-hidden');
        const timer = setTimeout(() => {
          splash.remove();
          document.body.style.backgroundColor = '';
        }, 350);
        return () => clearTimeout(timer);
      }
    }
  }, [isInitialized]);

  if (!isInitialized) {
    // If the HTML splash overlay exists, let it handle the single continuous loading sequence
    if (typeof document !== 'undefined' && document.getElementById('pb-splash')) {
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
