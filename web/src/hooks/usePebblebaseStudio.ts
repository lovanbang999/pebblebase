import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Connection, ConnectionInput, FilterOption } from '../lib/types';
import {
  fetchConnections,
  createConnection,
  deleteConnection,
  fetchTables,
  fetchRows,
  insertRow,
  updateRow,
  deleteRow,
} from '../lib/api';

export interface UsePebblebaseStudioOptions {
  isTableTabActive?: boolean;
}

export function usePebblebaseStudio(options: UsePebblebaseStudioOptions = {}) {
  const { isTableTabActive = true } = options;
  const qc = useQueryClient();
  const { t } = useTranslation();

  // Selection states
  const [userSelectedConnectionId, setUserSelectedConnectionId] = useState<string | null>(null);
  const [userSelectedTable, setUserSelectedTable] = useState<string | null>(null);

  // Modals state
  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [cloningConnection, setCloningConnection] = useState<Connection | null>(null);
  const [isRowModalOpen, setIsRowModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(null);
  const [rowToDelete, setRowToDelete] = useState<Record<string, unknown> | null>(null);

  // Theme state
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

  const activeConnection =
    connections.find((c) => c.id === userSelectedConnectionId) || connections[0] || null;

  // 2. Fetch Tables
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

  const activeTable =
    tables.find((t) => t.name === userSelectedTable)?.name || tables[0]?.name || null;
  const activeTableSchema = tables.find((t) => t.name === activeTable);

  const handleSelectConnection = (connId: string) => {
    setUserSelectedConnectionId(connId);
    setUserSelectedTable(null);
    setBannerError(null);
  };

  const handleSelectTable = (tblName: string) => {
    setUserSelectedTable(tblName);
    setPage(0);
    setSortBy('');
    setSortDesc(false);
    setFilters([]);
    setBannerError(null);
  };

  // 3. Fetch Rows
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
    enabled: Boolean(activeConnection?.id && activeTable && isTableTabActive),
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
    mutationFn: (values: Record<string, unknown>) =>
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
      where: Record<string, unknown>;
      values: Record<string, unknown>;
    }) => updateRow(activeConnection!.id, activeTable!, where, values),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rows'] });
      setBannerError(null);
    },
  });

  const deleteRowMutation = useMutation({
    mutationFn: (where: Record<string, unknown>) =>
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

  const getWhereCondition = (row: Record<string, unknown>): Record<string, unknown> => {
    if (!activeTableSchema) return row;
    const pkCols = activeTableSchema.columns.filter((c) => c.is_primary_key);
    if (pkCols.length > 0) {
      const where: Record<string, unknown> = {};
      pkCols.forEach((c) => {
        where[c.name] = row[c.name];
      });
      return where;
    }
    return row;
  };

  const handleSaveRow = async (values: Record<string, unknown>) => {
    if (editingRow) {
      const where = getWhereCondition(editingRow);
      await updateRowMutation.mutateAsync({ where, values });
    } else {
      await insertRowMutation.mutateAsync(values);
    }
  };

  const handleSaveCell = async (
    row: Record<string, unknown>,
    columnName: string,
    newValue: unknown
  ) => {
    const where = getWhereCondition(row);
    const values = { [columnName]: newValue };
    await updateRowMutation.mutateAsync({ where, values });
  };

  const handleNavigateToRelatedTable = (
    targetTable: string,
    targetColumn: string,
    value: unknown
  ) => {
    setUserSelectedTable(targetTable);
    setPage(0);
    setSortBy('');
    setSortDesc(false);
    setFilters([{ column: targetColumn, operator: 'eq', value: String(value) }]);
    setBannerError(null);
  };

  const handleDeleteRowDirectly = (row: Record<string, unknown>) => {
    setRowToDelete(row);
  };

  const handleConfirmDeleteRow = async () => {
    if (!rowToDelete) return;
    const where = getWhereCondition(rowToDelete);
    try {
      await deleteRowMutation.mutateAsync(where);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('app.failedToDelete');
      setBannerError(message);
    } finally {
      setRowToDelete(null);
    }
  };

  const activeErrorMessage =
    bannerError ||
    (tablesError instanceof Error ? tablesError.message : null) ||
    (rowsError instanceof Error ? rowsError.message : null);

  return {
    // State
    theme,
    toggleTheme,
    connections,
    isLoadingConnections,
    activeConnection,
    setUserSelectedConnectionId,
    setUserSelectedTable,
    handleSelectConnection,
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

    // Modals
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

    // Action Handlers
    handleCreateConnection,
    handleDeleteConnection,
    handleSaveRow,
    handleSaveCell,
    handleConfirmDeleteRow,
    handleNavigateToRelatedTable,
    handleDeleteRowDirectly,
    deleteRowMutation,
    getWhereCondition,
  };
}
