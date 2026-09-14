import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Connection } from './lib/types';
import { ConnectionModal } from './components/ConnectionModal';
import { Sidebar } from './components/Sidebar';
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
    handleSelectTable,
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
    handleNavigateToRelatedTable,
    handleDeleteRowDirectly,
    deleteRowMutation,
    getWhereCondition,
  } = usePebblebaseStudio();

  const [mainView, setMainView] = useState<'table' | 'console'>('table');
  const [consoleInitialQuery, setConsoleInitialQuery] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'q' || e.key === 'Q')) {
        e.preventDefault();
        setMainView((prev) => (prev === 'console' ? 'table' : 'console'));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenQueryConsole = (customQuery?: string) => {
    if (customQuery) {
      setConsoleInitialQuery(customQuery);
    } else if (activeTable) {
      const isMongo = activeConnection?.type === 'mongodb';
      const isMysql = activeConnection?.type === 'mysql';
      setConsoleInitialQuery(
        isMongo
          ? `db.${activeTable}.find({}).limit(50)`
          : isMysql
          ? `SELECT * FROM \`${activeTable}\` LIMIT 50;`
          : `SELECT * FROM "${activeTable}" LIMIT 50;`
      );
    } else {
      setConsoleInitialQuery(undefined);
    }
    setMainView('console');
  };

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
          setConsoleInitialQuery(undefined);
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
        selectedTable={activeTable}
        onSelectTable={(tableName) => {
          handleSelectTable(tableName);
          setMainView('table');
        }}
        isLoadingTables={isLoadingTables}
        onRefreshTables={() => refetchTables()}
        activeView={mainView}
        onOpenQueryConsole={() => handleOpenQueryConsole()}
      />

      {/* Main Content Pane */}
      <SidebarInset className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
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
        ) : mainView === 'console' && activeConnection ? (
          <QueryConsole
            key={`console-${activeConnection.id}`}
            connection={activeConnection}
            tables={tables}
            initialQuery={consoleInitialQuery}
            onNavigateToTable={(tName) => {
              handleSelectTable(tName);
              setMainView('table');
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
            table={activeTableSchema}
            rows={rowsResult?.rows || []}
            totalCount={rowsResult?.total_count || 0}
            isLoading={isLoadingRows}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setPage(0);
            }}
            sortBy={sortBy}
            sortDesc={sortDesc}
            onSortChange={(col, desc) => {
              setSortBy(col);
              setSortDesc(desc);
              setPage(0);
            }}
            filters={filters}
            onFiltersChange={(newFilters) => {
              setFilters(newFilters);
              setPage(0);
            }}
            onRefresh={() => refetchRows()}
            isReadOnly={Boolean(activeConnection?.read_only)}
            onOpenQueryConsole={() => handleOpenQueryConsole()}
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
            onNavigateRelation={handleNavigateToRelatedTable}
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
