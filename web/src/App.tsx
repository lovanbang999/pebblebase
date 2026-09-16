import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Connection, SavedQuery } from './lib/types';
import { ConnectionModal } from './components/ConnectionModal';
import Sidebar from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { DataGrid } from './components/DataGrid';
import { QueryConsole } from './components/QueryConsole';
import ERDView from './components/ERDView';
import { RowModal } from './components/RowModal';
import { ErrorBanner } from './components/ErrorBanner';
import { WelcomeScreen } from './components/WelcomeScreen';
import { EmptyTableScreen } from './components/EmptyTableScreen';
import { DeleteRowDialog } from './components/DeleteRowDialog';
import { LoginScreen } from './components/LoginScreen';
import { DefaultPasswordBanner } from './components/DefaultPasswordBanner';
import { AdminPanel } from './components/AdminPanel';
import { CommandPalette, type CommandActionId } from './components/CommandPalette';
import { OnboardingTour } from './components/onboarding/OnboardingTour';
import { getRecentItems, addRecentItem, clearRecentItems, type RecentItem } from './lib/recentItems';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { usePebblebaseStudio } from './hooks/usePebblebaseStudio';
import { useTabs } from './hooks/useTabs';
import { useAuthStore } from './lib/auth';
import { fetchMe, fetchSavedQueries, exportTableData, apiLogout } from './lib/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PebblebaseStudio() {
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
  useEffect(() => {
    if (!currentUser) return;
    const storageKey = `pebblebase_onboarding_completed_${currentUser.id || 'guest'}`;
    const hasCompleted = localStorage.getItem(storageKey);
    if (!hasCompleted) {
      const timer = setTimeout(() => {
        setIsOnboardingWelcomeOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentUser]);

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
  } = usePebblebaseStudio();

  const {
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
  } = useTabs({
    connectionId: activeConnection?.id || null,
    tables,
  });

  const activeTabIdRef = useRef<string | null>(null);

  // Sync activeTab state into usePebblebaseStudio when active tab changes
  useEffect(() => {
    if (!activeTab) {
      activeTabIdRef.current = null;
      return;
    }
    if (activeTabIdRef.current === activeTab.id) {
      return;
    }
    activeTabIdRef.current = activeTab.id;

    if (activeTab.type === 'table' && activeTab.tableName) {
      setUserSelectedTable(activeTab.tableName);
      if (activeTab.state) {
        setPage(activeTab.state.page ?? 0);
        setPageSize(activeTab.state.pageSize ?? 50);
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

  // Alt + Q and Alt + E shortcuts to toggle or open query console / ERD tab
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        if (activeTab?.type === 'query') {
          const tableTab = tabs.find((t) => t.type === 'table');
          if (tableTab) {
            setActiveTabId(tableTab.id);
          }
        } else {
          openQueryTab();
        }
      } else if (e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        if (activeTab?.type === 'erd') {
          const tableTab = tabs.find((t) => t.type === 'table');
          if (tableTab) {
            setActiveTabId(tableTab.id);
          }
        } else {
          openErdTab();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, tabs, openQueryTab, openErdTab, setActiveTabId]);

  // Cmd+K / Ctrl+K Command Palette trigger
  useEffect(() => {
    const handleCmdK = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleCmdK);
    return () => window.removeEventListener('keydown', handleCmdK);
  }, []);

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

  const handleOpenTableWithRecent = (tableName: string, openInNewTab?: boolean) => {
    openTableTab(tableName, openInNewTab);
    const updated = addRecentItem({
      id: tableName,
      type: 'table',
      title: tableName,
      subtitle: activeConnection ? `${activeConnection.name}` : undefined,
    });
    setRecentItems(updated);
  };

  const handleSelectConnectionWithRecent = (conn: Connection) => {
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
  };

  const handleSelectSavedQueryWithRecent = (sq: SavedQuery) => {
    openQueryTab(sq.query, sq.title);
    const updated = addRecentItem({
      id: sq.id,
      type: 'query',
      title: sq.title,
      subtitle: sq.query.slice(0, 35),
    });
    setRecentItems(updated);
  };

  const handlePaletteAction = (actionId: CommandActionId) => {
    switch (actionId) {
      case 'open_query_console':
        openQueryTab();
        break;
      case 'open_erd':
        openErdTab();
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
  };

  return (
    <SidebarProvider defaultOpen={true} className="h-screen w-screen overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans transition-colors">
      {/* Left Sidebar */}
      <Sidebar
        theme={theme}
        onToggleTheme={toggleTheme}
        connections={connections}
        selectedConnection={activeConnection}
        onSelectConnection={handleSelectConnectionWithRecent}
        onDeleteConnection={handleDeleteConnection}
        onCloneConnection={(conn: Connection) => {
          setCloningConnection(conn);
          setIsConnModalOpen(true);
        }}
        onOpenNewConnection={() => {
          setCloningConnection(null);
          setIsConnModalOpen(true);
        }}
        tables={tables}
        selectedTable={activeTab?.type === 'table' ? activeTab.tableName || null : null}
        onSelectTable={handleOpenTableWithRecent}
        isLoadingTables={isLoadingTables}
        onRefreshTables={() => refetchTables()}
        activeView={activeTab?.type === 'query' ? 'console' : activeTab?.type === 'erd' ? 'erd' : 'table'}
        onOpenQueryConsole={() => openQueryTab()}
        onOpenERD={() => openErdTab()}
        onOpenAdminPanel={() => {
          setAdminPanelDefaultTab('users');
          setIsAdminPanelOpen(true);
        }}
        onOpenChangePassword={() => {
          setAdminPanelDefaultTab('password');
          setIsAdminPanelOpen(true);
        }}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onOpenOnboarding={() => setIsOnboardingWelcomeOpen(true)}
      />

      {/* Main Content Pane */}
      <SidebarInset className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
        {/* Default password warning banner */}
        {isDefaultPassword && (
          <DefaultPasswordBanner
            onChangePassword={() => {
              setAdminPanelDefaultTab('password');
              setIsAdminPanelOpen(true);
            }}
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
            onNewQueryTab={() => openQueryTab()}
          />
        )}

        {/* Error notification banner */}
        <ErrorBanner message={activeErrorMessage} onDismiss={() => setBannerError(null)} />

        {/* Dynamic Main Views */}
        {connections.length === 0 && !isLoadingConnections ? (
          <WelcomeScreen
            onOpenNewConnection={() => {
              setCloningConnection(null);
              setIsConnModalOpen(true);
            }}
          />
        ) : activeTab?.type === 'query' && activeConnection ? (
          <QueryConsole
            key={`console-${activeTab.id}`}
            connection={activeConnection}
            tables={tables}
            initialQuery={activeTab.state?.queryText}
            onQueryChange={(text) => updateActiveTabState({ queryText: text })}
            onNavigateToTable={(tName) => {
              openTableTab(tName);
            }}
          />
        ) : activeTab?.type === 'erd' && activeConnection ? (
          <ERDView
            key={`erd-${activeTab.id}`}
            connectionId={activeConnection.id}
            connectionName={activeConnection.name}
            onOpenTable={(tName) => {
              openTableTab(tName);
            }}
            onGenerateJoinQuery={(query, title) => {
              openQueryTab(query, title);
            }}
          />
        ) : !activeTable || !activeTableSchema ? (
          <EmptyTableScreen
            connectionName={activeConnection?.name}
            hasTables={tables.length > 0}
            onReintrospect={() => refetchTables()}
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
            onPageChange={(newPage) => {
              setPage(newPage);
              updateActiveTabState({ page: newPage });
            }}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(0);
              updateActiveTabState({ pageSize: newSize, page: 0 });
            }}
            sortBy={sortBy}
            sortDesc={sortDesc}
            onSortChange={(col, desc) => {
              setSortBy(col);
              setSortDesc(desc);
              setPage(0);
              updateActiveTabState({ sortBy: col, sortDesc: desc, page: 0 });
            }}
            filters={filters}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters);
              setPage(0);
              updateActiveTabState({ filters: newFilters, page: 0 });
            }}
            onRefresh={() => refetchRows()}
            isReadOnly={Boolean(activeConnection?.read_only)}
            onOpenQueryConsole={() => openQueryTab()}
            onAddRow={() => {
              if (activeConnection?.read_only) return;
              setEditingRow(null);
              setIsRowModalOpen(true);
            }}
            onEditRow={(row) => {
              if (activeConnection?.read_only) return;
              setEditingRow(row);
              setIsRowModalOpen(true);
            }}
            onDeleteRow={(row) => {
              if (activeConnection?.read_only) return;
              handleDeleteRowDirectly(row);
            }}
            onSaveCell={async (row, colName, newVal) => {
              if (activeConnection?.read_only) return;
              await handleSaveCell(row, colName, newVal);
            }}
            onNavigateRelation={(targetTable, targetColumn, value) => {
              openTableTab(targetTable, false, {
                filters: [{ column: targetColumn, operator: 'eq', value: String(value) }],
                page: 0,
              });
            }}
          />
        )}
      </SidebarInset>

      {/* Connection Modal */}
      <ConnectionModal
        key={isConnModalOpen ? (cloningConnection ? `clone-${cloningConnection.id}` : 'new-conn') : 'closed'}
        isOpen={isConnModalOpen}
        onClose={() => {
          setIsConnModalOpen(false);
          setCloningConnection(null);
        }}
        onSubmit={handleCreateConnection}
        cloneData={cloningConnection}
      />

      {/* Row Insert/Edit Modal */}
      {activeTableSchema && isRowModalOpen && (
        <RowModal
          key={editingRow ? JSON.stringify(editingRow) : 'new-row'}
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
      )}

      {/* Delete Record Confirmation Dialog */}
      <DeleteRowDialog
        rowToDelete={rowToDelete}
        tableName={activeTable}
        onClose={() => setRowToDelete(null)}
        onConfirm={handleConfirmDeleteRow}
      />
      {/* Admin Panel Modal */}
      <AdminPanel
        isOpen={isAdminPanelOpen}
        onClose={() => setIsAdminPanelOpen(false)}
        defaultTab={adminPanelDefaultTab}
      />

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
      <OnboardingTour
        userId={currentUser?.id}
        isWelcomeOpen={isOnboardingWelcomeOpen}
        onCloseWelcome={() => setIsOnboardingWelcomeOpen(false)}
        isTourActive={isSpotlightTourActive}
        onStartTour={() => setIsSpotlightTourActive(true)}
        onCloseTour={() => setIsSpotlightTourActive(false)}
      />
    </SidebarProvider>
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

  if (!isInitialized) {
    // Minimal loading state while we validate the token.
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!token) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGuard>
          <PebblebaseStudio />
        </AuthGuard>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
