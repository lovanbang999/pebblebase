import { useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Connection } from './lib/types';
import { ConnectionModal } from './components/ConnectionModal';
import { Sidebar } from './components/Sidebar';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { usePebblebaseStudio } from './hooks/usePebblebaseStudio';
import { useTabs } from './hooks/useTabs';
import { useAuthStore } from './lib/auth';
import { fetchMe } from './lib/api';

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

  const isDefaultPassword = useAuthStore((s) => s.isDefaultPassword);

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

  return (
    <SidebarProvider defaultOpen={true} className="h-screen w-screen overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 font-sans transition-colors">
      {/* Left Sidebar */}
      <Sidebar
        theme={theme}
        onToggleTheme={toggleTheme}
        connections={connections}
        selectedConnection={activeConnection}
        onSelectConnection={(conn: Connection) => {
          setUserSelectedConnectionId(conn.id);
          setUserSelectedTable(null);
          setBannerError(null);
        }}
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
        onSelectTable={(tableName, openInNewTab) => {
          openTableTab(tableName, openInNewTab);
        }}
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
