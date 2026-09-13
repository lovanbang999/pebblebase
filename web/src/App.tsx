import { useState } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Database,
  Plus,
  Terminal,
  ShieldCheck,
  Zap,
  Layers,
  AlertCircle,
} from 'lucide-react';
import type {
  Connection,
  ConnectionInput,
  FilterOption,
} from './lib/types';
import {
  fetchConnections,
  createConnection,
  deleteConnection,
  fetchTables,
  fetchRows,
  insertRow,
  updateRow,
  deleteRow,
} from './lib/api';
import { ConnectionModal } from './components/ConnectionModal';
import { Sidebar } from './components/Sidebar';
import { DataGrid } from './components/DataGrid';
import { RowModal } from './components/RowModal';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function PebblebaseStudio() {
  const qc = useQueryClient();

  // User-selected states (null means default to first available)
  const [userSelectedConnectionId, setUserSelectedConnectionId] = useState<string | null>(null);
  const [userSelectedTable, setUserSelectedTable] = useState<string | null>(null);

  // Modals state
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [isRowModalOpen, setIsRowModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, any> | null>(null);

  // Theme state ('dark' | 'light')
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('pb_theme') as 'dark' | 'light') || 'dark';
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('pb_theme', nextTheme);
    if (nextTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Data grid state
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sortBy, setSortBy] = useState('');
  const [sortDesc, setSortDesc] = useState(false);
  const [filters, setFilters] = useState<FilterOption[]>([]);
  const [bannerError, setBannerError] = useState<string | null>(null);

  // 1. Fetch Connections
  const {
    data: connections = [],
    isLoading: isLoadingConnections,
  } = useQuery({
    queryKey: ['connections'],
    queryFn: fetchConnections,
  });

  // Derive active connection
  const activeConnection =
    connections.find((c) => c.id === userSelectedConnectionId) || connections[0] || null;

  // 2. Fetch Tables for active connection
  const {
    data: tables = [],
    isLoading: isLoadingTables,
    refetch: refetchTables,
    error: tablesError,
  } = useQuery({
    queryKey: ['tables', activeConnection?.id],
    queryFn: () => fetchTables(activeConnection!.id),
    enabled: Boolean(activeConnection?.id),
  });

  // Derive active table
  const activeTable =
    tables.find((t) => t.name === userSelectedTable)?.name || tables[0]?.name || null;
  const activeTableSchema = tables.find((t) => t.name === activeTable);

  const handleSelectTable = (tblName: string) => {
    setUserSelectedTable(tblName);
    setPage(0);
    setSortBy('');
    setSortDesc(false);
    setFilters([]);
    setBannerError(null);
  };

  // 3. Fetch Rows for active table
  const {
    data: rowsResult,
    isLoading: isLoadingRows,
    refetch: refetchRows,
    error: rowsError,
  } = useQuery({
    queryKey: [
      'rows',
      activeConnection?.id,
      activeTable,
      page,
      pageSize,
      sortBy,
      sortDesc,
      filters,
    ],
    queryFn: () =>
      fetchRows(activeConnection!.id, activeTable!, {
        limit: pageSize,
        offset: page * pageSize,
        sort_by: sortBy || undefined,
        sort_desc: sortDesc,
        filters,
      }),
    enabled: Boolean(activeConnection?.id && activeTable),
  });

  // 4. Mutations
  const createConnMutation = useMutation({
    mutationFn: createConnection,
    onSuccess: (newConn) => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setUserSelectedConnectionId(newConn.id);
      setUserSelectedTable(null);
      setBannerError(null);
    },
  });

  const deleteConnMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['connections'] });
      setUserSelectedConnectionId(null);
      setUserSelectedTable(null);
    },
  });

  const insertRowMutation = useMutation({
    mutationFn: (values: Record<string, any>) =>
      insertRow(activeConnection!.id, activeTable!, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rows'] });
      setBannerError(null);
    },
  });

  const updateRowMutation = useMutation({
    mutationFn: ({
      where,
      values,
    }: {
      where: Record<string, any>;
      values: Record<string, any>;
    }) => updateRow(activeConnection!.id, activeTable!, where, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rows'] });
      setBannerError(null);
    },
  });

  const deleteRowMutation = useMutation({
    mutationFn: (where: Record<string, any>) =>
      deleteRow(activeConnection!.id, activeTable!, where),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rows'] });
      setBannerError(null);
    },
  });

  const handleCreateConnection = async (input: ConnectionInput) => {
    await createConnMutation.mutateAsync(input);
  };

  const handleDeleteConnection = async (id: string) => {
    await deleteConnMutation.mutateAsync(id);
  };

  // Helper to extract primary key where condition
  const getWhereCondition = (row: Record<string, any>) => {
    if (!activeTableSchema) return row;
    const pkCols = activeTableSchema.columns.filter((c) => c.is_primary_key);
    if (pkCols.length > 0) {
      const where: Record<string, any> = {};
      pkCols.forEach((c) => {
        where[c.name] = row[c.name];
      });
      return where;
    }
    return row;
  };

  const handleSaveRow = async (values: Record<string, any>) => {
    if (editingRow) {
      const where = getWhereCondition(editingRow);
      await updateRowMutation.mutateAsync({ where, values });
    } else {
      await insertRowMutation.mutateAsync(values);
    }
  };

  const handleNavigateToRelatedTable = (targetTable: string, targetColumn: string, value: any) => {
    setUserSelectedTable(targetTable);
    setPage(0);
    setSortBy('');
    setSortDesc(false);
    setFilters([{ column: targetColumn, operator: 'eq', value: String(value) }]);
    setBannerError(null);
  };

  const handleDeleteRowDirectly = async (row: Record<string, any>) => {
    if (!confirm('Delete this record permanently?')) return;
    const where = getWhereCondition(row);
    try {
      await deleteRowMutation.mutateAsync(where);
    } catch (err: any) {
      setBannerError(err.message || 'Failed to delete record');
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
        onSelectConnection={(conn: Connection) => {
          setUserSelectedConnectionId(conn.id);
          setUserSelectedTable(null);
          setBannerError(null);
        }}
        onDeleteConnection={handleDeleteConnection}
        onOpenNewConnection={() => setIsConnModalOpen(true)}
        tables={tables}
        selectedTable={activeTable}
        onSelectTable={handleSelectTable}
        isLoadingTables={isLoadingTables}
        onRefreshTables={() => refetchTables()}
      />

      {/* Main Content Pane */}
      <SidebarInset className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
        {/* Error notification banner */}
        {(bannerError || tablesError || rowsError) && (
          <Alert variant="destructive" className="rounded-none border-x-0 border-t-0 text-xs flex items-center justify-between font-mono py-2 px-4">
            <div className="flex items-center gap-2 truncate">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <AlertDescription className="truncate text-xs font-mono">
                {bannerError ||
                  (tablesError as Error)?.message ||
                  (rowsError as Error)?.message}
              </AlertDescription>
            </div>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => setBannerError(null)}
              className="text-xs text-rose-400 hover:text-rose-100 p-0 h-auto underline ml-4 shrink-0"
            >
              Dismiss
            </Button>
          </Alert>
        )}

        {/* Dynamic Main Views */}
        {connections.length === 0 && !isLoadingConnections ? (
          /* Empty State: No connections at all */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
            <div className="h-11 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5 bg-white dark:bg-zinc-900/30">
              <SidebarTrigger className="-ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer" />
              <Separator orientation="vertical" className="h-4 bg-zinc-200 dark:bg-zinc-800" />
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                Pebblebase Studio
              </span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
              <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 flex items-center justify-center mb-6 shadow-xl dark:shadow-2xl">
                <Database className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>

              <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2 font-mono">
                Welcome to Pebblebase
              </h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mb-8 leading-relaxed">
                Connect to your local or remote database to explore schemas, query records,
                and execute mutations directly from a single binary.
              </p>

              <Button
                type="button"
                size="lg"
                onClick={() => setIsConnModalOpen(true)}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/20 dark:shadow-emerald-950"
              >
                <Plus className="w-4 h-4" />
                Add First Connection
              </Button>

              {/* Feature Badges */}
              <div className="grid grid-cols-3 gap-6 max-w-xl mt-16 pt-8 border-t border-zinc-200 dark:border-zinc-900 text-left">
                <div className="p-3 rounded bg-zinc-50 border border-zinc-200/80 dark:bg-zinc-900/40 dark:border-zinc-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">AES-256 Storage</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Passwords encrypted at rest with hardware GCM key.
                  </p>
                </div>

                <div className="p-3 rounded bg-zinc-50 border border-zinc-200/80 dark:bg-zinc-900/40 dark:border-zinc-900">
                  <Terminal className="w-4 h-4 text-sky-600 dark:text-sky-400 mb-1.5" />
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">DataGrip UX</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Switch between structured forms and raw DSN URLs.
                  </p>
                </div>

                <div className="p-3 rounded bg-zinc-50 border border-zinc-200/80 dark:bg-zinc-900/40 dark:border-zinc-900">
                  <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 mb-1.5" />
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">TanStack Virtual</h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                    High-speed data grid with zero client memory leaks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : !activeTable || !activeTableSchema ? (
          /* Empty State: Connection active but no table selected */
          <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
            <div className="h-11 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5 bg-white dark:bg-zinc-900/30">
              <SidebarTrigger className="-ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer" />
              <Separator orientation="vertical" className="h-4 bg-zinc-200 dark:bg-zinc-800" />
              <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {activeConnection?.name}
              </span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <Layers className="w-12 h-12 text-zinc-300 dark:text-zinc-800 mb-4" />
              <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-200 font-mono mb-1">
                {activeConnection?.name}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4 font-mono">
                {tables.length > 0
                  ? 'Select a table from the sidebar to inspect records'
                  : 'No tables discovered in public schema'}
              </p>
              {tables.length === 0 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => refetchTables()}
                  className="text-xs"
                >
                  Re-introspect Database
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Active Data Grid */
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
            onAddRow={() => {
              setEditingRow(null);
              setIsRowModalOpen(true);
            }}
            onEditRow={(row) => {
              setEditingRow(row);
              setIsRowModalOpen(true);
            }}
            onDeleteRow={handleDeleteRowDirectly}
            onNavigateRelation={handleNavigateToRelatedTable}
          />
        )}
      </SidebarInset>

      {/* Connection Modal */}
      <ConnectionModal
        isOpen={isConnModalOpen}
        onClose={() => setIsConnModalOpen(false)}
        onSubmit={handleCreateConnection}
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
