import React, { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "cn";
import { ErrorBoundary } from "@/components/common";
import { WorkspaceHome } from "@/components/common/WorkspaceHome";
import { RedisCliConsole } from "@/components/redis/RedisCliConsole";
import { DataGrid, EmptyTableScreen } from "@/components/grid";
import { canManageSettings, canManageUsers, type AuthUser } from "@/lib/auth";
import { pushReferenceNavigation } from "@/lib/referenceNavigation";
import type { NavigationHistory } from "@/lib/navigationHistory";
import { DEFAULT_PAGE_SIZE } from "@/constants";
import type {
  Connection,
  StudioTab,
  StudioTabState,
  TableSchema,
} from "@/lib/types";

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

const RedisStudio = lazy(() =>
  import("@/components/redis").then((m) => ({
    default: m.RedisStudio,
  })),
);

export interface StudioTabContentProps {
  activeTab: StudioTab | null;
  activeTabId: string | null;
  tabs: StudioTab[];
  queryTabs: StudioTab[];
  erdTabs: StudioTab[];
  diffTabs: StudioTab[];
  connections: Connection[];
  selectedConnection: Connection | null;
  activeConnection: Connection | null;
  scopedConnections: Connection[];
  tablesByConnection: Record<string, TableSchema[]>;
  tableStatusByConnection: Record<
    string,
    { isLoading?: boolean; error?: unknown }
  >;
  rowsByTabId: Record<
    string,
    {
      data?: {
        rows?: Record<string, unknown>[];
        total_count?: number;
        query_time_ms?: number;
      };
      isLoading?: boolean;
      isFetching?: boolean;
      refetch?: () => Promise<unknown>;
    }
  >;
  namedWorkspacesScopeId?: string;
  currentUser: AuthUser | null;
  handleOpenQueryForExplorer: (query?: string, title?: string) => void;
  handleOpenErdForExplorer: () => void;
  handleOpenNewConnection: () => void;
  setAdminPanelDefaultTab: (tab: "users" | "password") => void;
  setIsAdminPanelOpen: (open: boolean) => void;
  handleOpenWelcomeHistory: () => void;
  handleOpenCommandPalette: () => void;
  updateTabState: (tabId: string, state: Partial<StudioTabState>) => void;
  handleOpenTableForConnection: (
    connectionId: string,
    tableName: string,
  ) => void;
  handleOpenAISettings: () => void;
  openQueryTab: (
    connectionId: string,
    query?: string,
    title?: string,
  ) => string | undefined;
  setTabError: (tabId: string, message: string) => void;
  refreshConnectionTables: (connectionId: string) => Promise<unknown>;
  openFindEverywhere: (value?: string) => void;
  findFocusedValues: React.MutableRefObject<Record<string, string | undefined>>;
  selectedCells: React.MutableRefObject<
    Record<string, { column: string; rowIdentity?: string } | undefined>
  >;
  activeTabRef: React.MutableRefObject<StudioTab | null>;
  setNavigationHistory: React.Dispatch<React.SetStateAction<NavigationHistory>>;
  onOpenRowModal: (
    connectionId: string,
    tableName: string,
    tabId: string,
    row: Record<string, unknown> | null,
    duplicate?: boolean,
  ) => void;
  handleSaveRow: (
    connectionId: string,
    table: string,
    original: Record<string, any> | null,
    values: Record<string, any>,
  ) => Promise<unknown>;
  handleDeleteRow: (
    connectionId: string,
    table: string,
    row: Record<string, any>,
  ) => Promise<unknown>;
  openTableTab: (
    connectionId: string,
    table: string,
    readOnly?: boolean,
    state?: Partial<StudioTabState>,
  ) => string | undefined;
}

export function StudioTabContent({
  activeTab,
  activeTabId,
  tabs,
  queryTabs,
  erdTabs,
  diffTabs,
  connections,
  selectedConnection,
  activeConnection,
  scopedConnections,
  tablesByConnection,
  tableStatusByConnection,
  rowsByTabId,
  namedWorkspacesScopeId,
  currentUser,
  handleOpenQueryForExplorer,
  handleOpenErdForExplorer,
  handleOpenNewConnection,
  setAdminPanelDefaultTab,
  setIsAdminPanelOpen,
  handleOpenWelcomeHistory,
  handleOpenCommandPalette,
  updateTabState,
  handleOpenTableForConnection,
  handleOpenAISettings,
  openQueryTab,
  setTabError,
  refreshConnectionTables,
  openFindEverywhere,
  findFocusedValues,
  selectedCells,
  activeTabRef,
  setNavigationHistory,
  onOpenRowModal,
  handleSaveRow,
  handleDeleteRow,
  openTableTab,
}: StudioTabContentProps) {
  const { t } = useTranslation();

  if (!activeTab) {
    return (
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
          (selectedConnection || activeConnection)?.type !== "redis" &&
          (selectedConnection || activeConnection),
        )}
        canHistory={Boolean(selectedConnection || activeConnection)}
        canSettings={canManageSettings(currentUser?.role)}
        canManageSources={canManageSettings(currentUser?.role)}
      />
    );
  }

  return (
    <>
      {/* Open Query Tabs (Preserved in DOM with visibility toggle for instant switching) */}
      {queryTabs.map((tab) => {
        const connection = connections.find(
          (item) => item.id === tab.connectionId,
        );
        if (!connection) return null;
        return (
          <div
            key={tab.id}
            className={cn(
              "flex h-full flex-1 flex-col overflow-hidden",
              activeTabId === tab.id ? "flex" : "hidden",
            )}
          >
            <Suspense
              fallback={
                <div className="text-muted-foreground flex flex-1 items-center justify-center font-mono text-xs">
                  {t("console.loadingQueryConsole", "Loading Query Console...")}
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
                    initialCommand={tab.state?.queryText}
                    workspaceTabId={tab.id}
                    onCommandChange={(queryText) =>
                      updateTabState(tab.id, { queryText })
                    }
                  />
                ) : (
                  <QueryConsole
                    connection={connection}
                    workspaceTabId={tab.id}
                    tables={tablesByConnection[tab.connectionId] || []}
                    initialQuery={tab.state?.queryText}
                    onQueryChange={(queryText) =>
                      updateTabState(tab.id, { queryText })
                    }
                    onNavigateToTable={(tableName) =>
                      handleOpenTableForConnection(tab.connectionId, tableName)
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
      {erdTabs.map((tab) => {
        const connection = connections.find(
          (item) => item.id === tab.connectionId,
        );
        if (!connection) return null;
        return (
          <div
            key={tab.id}
            className={cn(
              "flex h-full flex-1 flex-col overflow-hidden",
              activeTabId === tab.id ? "flex" : "hidden",
            )}
          >
            <Suspense
              fallback={
                <div className="text-muted-foreground flex flex-1 items-center justify-center font-mono text-xs">
                  {t("erd.loading", "Loading ERD Diagram...")}
                </div>
              }
            >
              <ERDView
                connectionId={connection.id}
                connectionName={connection.name}
                onOpenTable={(tableName) =>
                  handleOpenTableForConnection(tab.connectionId, tableName)
                }
                onGenerateJoinQuery={(query, title) =>
                  openQueryTab(tab.connectionId, query, title)
                }
              />
            </Suspense>
          </div>
        );
      })}

      {/* Schema Diff Views */}
      {diffTabs.map((tab) => (
        <div
          key={tab.id}
          className={cn(
            "flex h-full flex-1 flex-col overflow-hidden",
            activeTabId === tab.id ? "flex" : "hidden",
          )}
        >
          <Suspense
            fallback={
              <div className="text-muted-foreground flex flex-1 items-center justify-center font-mono text-xs">
                {t("diff.loadingSchemaDiff", "Loading Schema Diff...")}
              </div>
            }
          >
            <SchemaDiff
              connections={connections}
              sourceConnectionId={tab.state?.diffSourceConnectionId}
              targetConnectionId={tab.state?.diffTargetConnectionId}
              onConnectionPairChange={(source, target) =>
                updateTabState(tab.id, {
                  diffSourceConnectionId: source,
                  diffTargetConnectionId: target,
                })
              }
              onOpenQueryConsole={(query, title, destinationId) =>
                openQueryTab(
                  destinationId ||
                    tab.state?.diffTargetConnectionId ||
                    tab.connectionId,
                  query,
                  title,
                )
              }
              onError={(message) => {
                if (message) setTabError(tab.id, message);
              }}
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
                      {t("redis.loadingStudio", "Loading Redis Studio...")}
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
                  workspaceId={namedWorkspacesScopeId}
                  workspaceConnections={scopedConnections}
                  isTabActive={isSelectedTab}
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
                  onPageChange={(page) => updateTabState(tab.id, { page })}
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
                      rowQuery?.refetch?.(),
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
                        const current = history.entries[history.cursor];
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
                  onAddRow={() =>
                    onOpenRowModal(tab.connectionId, tableName, tab.id, null)
                  }
                  onEditRow={(row) =>
                    onOpenRowModal(tab.connectionId, tableName, tab.id, row)
                  }
                  onDuplicateRow={(row) =>
                    onOpenRowModal(
                      tab.connectionId,
                      tableName,
                      tab.id,
                      row,
                      true,
                    )
                  }
                  onCommitRow={async (original, values) => {
                    await handleSaveRow(
                      tab.connectionId,
                      tableName,
                      original,
                      values,
                    );
                  }}
                  onCommitDeleteRow={async (row) => {
                    await handleDeleteRow(tab.connectionId, tableName, row);
                  }}
                  onNavigateRelation={(targetTable, targetColumn, value) =>
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
                  onNavigateReference={(
                    connectionId,
                    targetTable,
                    targetColumn,
                    value,
                    rowIdentity,
                    targetFilters,
                  ) => {
                    const sourceId = activeTabRef.current?.id;
                    const targetConnection = connections.find(
                      (candidate) => candidate.id === connectionId,
                    );
                    const targetId =
                      targetConnection?.type === "redis"
                        ? openTableTab(connectionId, "Redis keys", false, {
                            redisSearchKey: String(value ?? ""),
                          })
                        : openTableTab(connectionId, targetTable, false, {
                            filters: targetFilters?.length
                              ? targetFilters
                              : [
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
                          });
                    if (targetId)
                      setNavigationHistory((history) => {
                        return pushReferenceNavigation(
                          history,
                          {
                            tabId: sourceId ?? targetId,
                            selectedCell: sourceId
                              ? selectedCells.current[sourceId]
                              : undefined,
                          },
                          {
                            tabId: targetId,
                            selectedCell: {
                              column: targetColumn,
                              rowIdentity:
                                rowIdentity ?? JSON.stringify([value]),
                            },
                          },
                        );
                      });
                  }}
                />
              )}
            </div>
          );
        })}
    </>
  );
}
