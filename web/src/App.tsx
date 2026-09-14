import { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Connection } from './lib/types';
import { ConnectionModal } from './components/ConnectionModal';
import { Sidebar } from './components/Sidebar';
import { TabBar } from './components/TabBar';
import { DataGrid } from './components/DataGrid';
import { QueryConsole } from './components/QueryConsole';
import { RowModal } from './components/RowModal';
import { ErrorBanner } from './components/ErrorBanner';
import { WelcomeScreen } from './components/WelcomeScreen';
import { EmptyTableScreen } from './components/EmptyTableScreen';
import { DeleteRowDialog } from './components/DeleteRowDialog';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { usePebblebaseStudio } from './hooks/usePebblebaseStudio';
import { useTabs } from './hooks/useTabs';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PebblebaseStudio() {
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

  // Alt + Q shortcut to toggle or open query console tab
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, tabs, openQueryTab, setActiveTabId]);

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
        activeView={activeTab?.type === 'query' ? 'console' : 'table'}
        onOpenQueryConsole={() => openQueryTab()}
      />

      {/* Main Content Pane */}
      <SidebarInset className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
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
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PebblebaseStudio />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
