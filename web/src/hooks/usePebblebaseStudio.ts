import { useCallback, useMemo, useState } from "react";
import {
  useQueries,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type {
  Connection,
  ConnectionInput,
  ExplorerSelection,
  StudioTab,
  TableSchema,
} from "../lib/types";
import {
  fetchConnections,
  createConnection,
  deleteConnection,
  fetchTables,
  fetchRows,
  insertRow,
  updateRow,
  deleteRow,
} from "../lib/api";
import { STORAGE_KEYS, DEFAULT_PAGE_SIZE } from "@/constants";

export interface UsePebblebaseStudioOptions {
  tabs: StudioTab[];
  activeTab: StudioTab | null;
  selectedExplorerNode: ExplorerSelection;
}

export function usePebblebaseStudio({
  tabs,
  activeTab,
  selectedExplorerNode,
}: UsePebblebaseStudioOptions) {
  const qc = useQueryClient();
  const { t } = useTranslation();

  // Explorer selection and editor context are deliberately independent.
  const [themeValue, setTheme] = useState<"dark" | "light">(
    () =>
      (localStorage.getItem(STORAGE_KEYS.THEME) as "dark" | "light") || "dark",
  );
  const toggleTheme = useCallback(() => {
    const nextTheme = themeValue === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
  }, [setTheme, themeValue]);

  const [isConnModalOpen, setIsConnModalOpen] = useState(false);
  const [cloningConnection, setCloningConnection] = useState<Connection | null>(
    null,
  );
  const [isRowModalOpen, setIsRowModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<Record<string, unknown> | null>(
    null,
  );
  const [rowToDelete, setRowToDelete] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [operationErrors, setOperationErrors] = useState<
    Record<string, string>
  >({});

  const { data: connections = [], isLoading: isLoadingConnections } = useQuery({
    queryKey: ["connections"],
    queryFn: fetchConnections,
  });

  const selectedConnectionId =
    selectedExplorerNode?.connectionId || connections[0]?.id || null;
  const selectedConnection =
    connections.find((item) => item.id === selectedConnectionId) || null;
  const activeConnection = activeTab
    ? connections.find((item) => item.id === activeTab.connectionId) || null
    : null;

  // Introspect only connections currently represented in the workspace or
  // selected in the explorer. React Query gives every connection its own
  // cache entry, loading flag, error, retry and cancellation signal.
  const relevantConnectionIds = useMemo(
    () => [
      ...new Set([
        ...(selectedConnectionId ? [selectedConnectionId] : []),
        ...tabs.map((tab) => tab.connectionId),
        ...tabs.flatMap((tab) =>
          [
            tab.state?.diffSourceConnectionId,
            tab.state?.diffTargetConnectionId,
          ].filter((id): id is string => Boolean(id)),
        ),
      ]),
    ],
    [selectedConnectionId, tabs],
  );
  const relevantConnections = connections.filter((item) =>
    relevantConnectionIds.includes(item.id),
  );
  const tableQueryResults = useQueries({
    queries: relevantConnections.map((connection) => ({
      queryKey: ["tables", connection.id],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchTables(connection.id, signal),
    })),
  });
  const tableStatusByConnection = useMemo(() => {
    const result: Record<string, (typeof tableQueryResults)[number]> = {};
    relevantConnections.forEach((connection, index) => {
      const query = tableQueryResults[index];
      if (query) result[connection.id] = query;
    });
    return result;
  }, [relevantConnections, tableQueryResults]);
  const tablesByConnection = useMemo(() => {
    const result: Record<string, TableSchema[]> = {};
    for (const connection of relevantConnections) {
      result[connection.id] =
        tableStatusByConnection[connection.id]?.data || [];
    }
    return result;
  }, [relevantConnections, tableStatusByConnection]);
  const loadedTableConnectionIds = relevantConnections
    .filter((connection) => tableStatusByConnection[connection.id]?.isSuccess)
    .map((connection) => connection.id);

  const tables = selectedConnectionId
    ? tablesByConnection[selectedConnectionId] || []
    : [];
  const selectedTablesQuery = selectedConnectionId
    ? tableStatusByConnection[selectedConnectionId]
    : undefined;
  const isLoadingTables = Boolean(
    selectedTablesQuery?.isLoading || selectedTablesQuery?.isFetching,
  );
  const tablesError = selectedTablesQuery?.error || null;

  const activeTables = activeConnection
    ? tablesByConnection[activeConnection.id] || []
    : [];
  const activeTable =
    activeTab?.type === "table" ? activeTab.tableName || null : null;
  const activeTableSchema = activeTable
    ? activeTables.find(
        (table) =>
          table.name === activeTable &&
          (table.schema_name || "") === (activeTab?.schemaName || ""),
      ) || null
    : null;

  const rowTabs = tabs.filter(
    (tab) =>
      tab.type === "table" &&
      Boolean(tab.tableName) &&
      connections.some((conn) => conn.id === tab.connectionId),
  );
  const rowQueryResults = useQueries({
    queries: rowTabs.map((tab) => {
      const state = tab.state || {
        page: 0,
        pageSize: DEFAULT_PAGE_SIZE,
        filters: [],
        sortBy: "",
        sortDesc: false,
      };
      const page = Math.max(0, state.page || 0);
      const pageSize = state.pageSize || DEFAULT_PAGE_SIZE;
      const schemaName = tab.schemaName || "";
      const schemaReady = Boolean(
        tablesByConnection[tab.connectionId]?.some(
          (table) =>
            table.name === tab.tableName &&
            (table.schema_name || "") === schemaName,
        ),
      );
      return {
        queryKey: [
          "rows",
          tab.connectionId,
          tab.tableName,
          schemaName,
          page,
          pageSize,
          state.sortBy || "",
          Boolean(state.sortDesc),
          state.filters || [],
        ],
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          fetchRows(
            tab.connectionId,
            tab.tableName!,
            {
              limit: pageSize,
              offset: page * pageSize,
              sort_by: state.sortBy || undefined,
              sort_desc: Boolean(state.sortDesc),
              filters: state.filters || [],
            },
            signal,
          ),
        enabled: schemaReady,
      };
    }),
  });
  const rowsByTabId = useMemo(() => {
    const result: Record<string, (typeof rowQueryResults)[number]> = {};
    rowTabs.forEach((tab, index) => {
      const query = rowQueryResults[index];
      if (query) result[tab.id] = query;
    });
    return result;
  }, [rowTabs, rowQueryResults]);
  const activeRowsQuery = activeTab ? rowsByTabId[activeTab.id] : undefined;
  const rowsResult = activeRowsQuery?.data;
  const isLoadingRows = Boolean(
    activeRowsQuery?.isLoading || activeRowsQuery?.isFetching,
  );

  const createConnMutation = useMutation({
    mutationFn: createConnection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
  const deleteConnMutation = useMutation({
    mutationFn: deleteConnection,
    onSuccess: (_data, connectionId) => {
      qc.removeQueries({ queryKey: ["tables", connectionId] });
      qc.removeQueries({ queryKey: ["rows", connectionId] });
      qc.invalidateQueries({ queryKey: ["connections"] });
    },
  });

  const errorKey = (connectionId: string, tableName: string) =>
    `${connectionId}:${tableName}:write`;
  const invalidateTableRows = (connectionId: string, tableName: string) => {
    void qc.invalidateQueries({ queryKey: ["rows", connectionId, tableName] });
    void qc.invalidateQueries({
      queryKey: ["table-stats", connectionId, tableName],
    });
  };
  const insertRowMutation = useMutation({
    mutationFn: ({
      connectionId,
      tableName,
      values,
    }: {
      connectionId: string;
      tableName: string;
      values: Record<string, unknown>;
    }) => insertRow(connectionId, tableName, values),
    onSuccess: (_data, variables) => {
      setOperationErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey(variables.connectionId, variables.tableName)];
        return next;
      });
      invalidateTableRows(variables.connectionId, variables.tableName);
    },
    onError: (error, variables) =>
      setOperationErrors((prev) => ({
        ...prev,
        [errorKey(variables.connectionId, variables.tableName)]:
          error instanceof Error ? error.message : t("app.failedToSave"),
      })),
  });
  const updateRowMutation = useMutation({
    mutationFn: ({
      connectionId,
      tableName,
      where,
      values,
    }: {
      connectionId: string;
      tableName: string;
      where: Record<string, unknown>;
      values: Record<string, unknown>;
    }) => updateRow(connectionId, tableName, where, values),
    onSuccess: (_data, variables) => {
      setOperationErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey(variables.connectionId, variables.tableName)];
        return next;
      });
      invalidateTableRows(variables.connectionId, variables.tableName);
    },
    onError: (error, variables) =>
      setOperationErrors((prev) => ({
        ...prev,
        [errorKey(variables.connectionId, variables.tableName)]:
          error instanceof Error ? error.message : t("app.failedToSave"),
      })),
  });
  const deleteRowMutation = useMutation({
    mutationFn: ({
      connectionId,
      tableName,
      where,
    }: {
      connectionId: string;
      tableName: string;
      where: Record<string, unknown>;
    }) => deleteRow(connectionId, tableName, where),
    onSuccess: (_data, variables) => {
      setOperationErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey(variables.connectionId, variables.tableName)];
        return next;
      });
      invalidateTableRows(variables.connectionId, variables.tableName);
    },
    onError: (error, variables) =>
      setOperationErrors((prev) => ({
        ...prev,
        [errorKey(variables.connectionId, variables.tableName)]:
          error instanceof Error ? error.message : t("app.failedToDelete"),
      })),
  });

  const handleCreateConnection = useCallback(
    (input: ConnectionInput) => createConnMutation.mutateAsync(input),
    [createConnMutation],
  );
  const handleDeleteConnection = useCallback(
    (id: string) => deleteConnMutation.mutateAsync(id),
    [deleteConnMutation],
  );
  const getWhereCondition = useCallback(
    (connectionId: string, tableName: string, row: Record<string, unknown>) => {
      const table = tablesByConnection[connectionId]?.find(
        (item) => item.name === tableName,
      );
      const primaryKeys =
        table?.columns.filter((column) => column.is_primary_key) || [];
      if (!primaryKeys.length) return row;
      return Object.fromEntries(
        primaryKeys.map((column) => [column.name, row[column.name]]),
      );
    },
    [tablesByConnection],
  );
  const handleSaveRow = useCallback(
    async (
      connectionId: string,
      tableName: string,
      originalRow: Record<string, unknown> | null,
      values: Record<string, unknown>,
    ) => {
      if (originalRow) {
        const where = getWhereCondition(connectionId, tableName, originalRow);
        await updateRowMutation.mutateAsync({
          connectionId,
          tableName,
          where,
          values,
        });
      } else {
        await insertRowMutation.mutateAsync({
          connectionId,
          tableName,
          values,
        });
      }
    },
    [getWhereCondition, insertRowMutation, updateRowMutation],
  );
  const handleSaveCell = useCallback(
    async (
      connectionId: string,
      tableName: string,
      row: Record<string, unknown>,
      columnName: string,
      newValue: unknown,
    ) => {
      const where = getWhereCondition(connectionId, tableName, row);
      await updateRowMutation.mutateAsync({
        connectionId,
        tableName,
        where,
        values: { [columnName]: newValue },
      });
    },
    [getWhereCondition, updateRowMutation],
  );
  const handleDeleteRow = useCallback(
    async (
      connectionId: string,
      tableName: string,
      row: Record<string, unknown>,
    ) => {
      await deleteRowMutation.mutateAsync({
        connectionId,
        tableName,
        where: getWhereCondition(connectionId, tableName, row),
      });
    },
    [deleteRowMutation, getWhereCondition],
  );

  const handleRetrySelectedConnection = useCallback(async () => {
    if (selectedConnectionId)
      await tableStatusByConnection[selectedConnectionId]?.refetch();
  }, [selectedConnectionId, tableStatusByConnection]);
  const handleRetryActiveContext = useCallback(async () => {
    if (!activeTab) return handleRetrySelectedConnection();
    if (activeTab.type === "table") {
      await Promise.all([
        tableStatusByConnection[activeTab.connectionId]?.refetch(),
        activeRowsQuery?.refetch(),
      ]);
    } else if (activeTab.type === "erd") {
      await tableStatusByConnection[activeTab.connectionId]?.refetch();
    }
  }, [
    activeTab,
    activeRowsQuery,
    handleRetrySelectedConnection,
    tableStatusByConnection,
  ]);

  const activeTablesError = activeConnection
    ? tableStatusByConnection[activeConnection.id]?.error || null
    : null;
  const activeOperationError =
    activeTab?.tableName && activeTab.connectionId
      ? operationErrors[
          errorKey(activeTab.connectionId, activeTab.tableName)
        ] || null
      : null;
  const activeErrorMessage =
    activeOperationError ||
    (activeTab?.type === "table"
      ? activeRowsQuery?.error instanceof Error
        ? activeRowsQuery.error.message
        : activeTablesError instanceof Error
          ? activeTablesError.message
          : null
      : null);
  const setTabError = useCallback((tabId: string, message: string | null) => {
    setOperationErrors((prev) => {
      const key = `tab:${tabId}`;
      if (!message) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: message };
    });
  }, []);
  const activeTabError = activeTab
    ? operationErrors[`tab:${activeTab.id}`] || null
    : null;
  const activeMessage = activeTabError || activeErrorMessage;
  const handleDismissBanner = useCallback(() => {
    if (activeTab) setTabError(activeTab.id, null);
    if (activeTab?.tableName)
      setOperationErrors((prev) => {
        const next = { ...prev };
        delete next[errorKey(activeTab.connectionId, activeTab.tableName!)];
        return next;
      });
  }, [activeTab, setTabError]);

  const refreshConnectionTables = useCallback(
    async (connectionId: string) => {
      await tableStatusByConnection[connectionId]?.refetch();
    },
    [tableStatusByConnection],
  );
  const refreshActiveRows = useCallback(async () => {
    await activeRowsQuery?.refetch();
  }, [activeRowsQuery]);

  return {
    theme: themeValue,
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
    rowsResult,
    rowsByTabId,
    isLoadingRows,
    refreshConnectionTables,
    refreshActiveRows,
    activeErrorMessage: activeMessage,
    setTabError,
    handleDismissBanner,
    handleRetry: handleRetryActiveContext,
    isRetrying: Boolean(
      selectedTablesQuery?.isFetching || activeRowsQuery?.isFetching,
    ),

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
    getWhereCondition,
    deleteRowMutation,
  };
}
