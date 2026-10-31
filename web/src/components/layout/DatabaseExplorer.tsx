import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Folder,
  HardDrive,
  KeyRound,
  PanelLeftClose,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Table as TableIcon,
  Terminal,
  Workflow,
  Trash2,
  ChevronsDownUp,
  Copy,
  Pencil,
  Unplug,
  type LucideIcon,
} from "lucide-react";
import type { Connection, DatabaseType, TableSchema } from "@/lib/types";
import { DATABASE_ENGINES, ENV_STYLES } from "@/constants";
import { TableDangerModal } from "@/components/modals";
import { exportTableData } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import { TableContextMenu } from "./TableContextMenu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ExplorerConnectionStatus {
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  error?: unknown;
}

interface DatabaseExplorerProps {
  connections: Connection[];
  selectedConnectionId: string | null;
  selectedTable: {
    connectionId: string;
    tableName: string;
    schemaName?: string;
  } | null;
  activeConnectionId: string | null;
  tablesByConnection: Record<string, TableSchema[]>;
  statusByConnection: Record<string, ExplorerConnectionStatus | undefined>;
  expandedNodeIds: string[];
  onToggleNode: (nodeId: string) => void;
  onExpandNodes: (nodeIds: string[]) => void;
  onCollapseAll: () => void;
  onSelectConnection: (connection: Connection) => void;
  onSelectTable: (
    connectionId: string,
    table: TableSchema,
    openInNewTab?: boolean,
  ) => void;
  onOpenQuery: (connectionId: string, query?: string, title?: string) => void;
  onOpenERD: (connectionId: string) => void;
  onOpenNewConnection: () => void;
  onHideToolWindow: () => void;
  onRefreshConnection: (connectionId: string) => void | Promise<void>;
  onDuplicateConnection: (connection: Connection) => void;
  onEditConnection: (connection: Connection) => void;
  onDeleteConnection: (connectionId: string) => void;
}

interface TreeNode {
  id: string;
  parentId: string | null;
  label: string;
  depth: number;
  icon: LucideIcon;
  expandable: boolean;
  expanded: boolean;
  connection?: Connection;
  table?: TableSchema;
  status?: ExplorerConnectionStatus;
  count?: number;
  kind: "connection" | "group" | "schema" | "table";
}

const connectionNodeId = (id: string) => `connection:${encodeURIComponent(id)}`;
const dbGroupId = (id: string) => `${connectionNodeId(id)}:database`;
const objectsGroupId = (id: string) => `${connectionNodeId(id)}:objects`;
const schemaGroupId = (id: string, schema: string) =>
  `${connectionNodeId(id)}:schema:${encodeURIComponent(schema)}`;
const engineIcon = (type: DatabaseType): LucideIcon =>
  type === "mongodb" ? Folder : type === "redis" ? KeyRound : HardDrive;
const tableDisplayName = (connection: Connection, table: TableSchema) =>
  connection.type === "mssql" && !table.schema_name && table.name.includes(".")
    ? table.name.slice(table.name.lastIndexOf(".") + 1)
    : table.name;
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : String(error || "Could not load database objects");
const errorSummary = (error: unknown) => {
  const message = errorMessage(error).split("\n")[0].trim();
  return message.length > 140 ? `${message.slice(0, 137)}…` : message;
};

function queryForTable(
  connection: Connection,
  table: TableSchema,
  mode: "rows" | "count" | "insert",
) {
  if (connection.type === "mongodb") {
    if (mode === "count") return `db.${table.name}.countDocuments()`;
    if (mode === "insert") return `db.${table.name}.insertOne({})`;
    return `db.${table.name}.find().limit(100)`;
  }
  const quote =
    connection.type === "mysql" ? "`" : connection.type === "mssql" ? "[" : '"';
  const endQuote = connection.type === "mssql" ? "]" : quote;
  const [mssqlSchema, mssqlTable] =
    connection.type === "mssql" && table.name.includes(".")
      ? [
          table.name.slice(0, table.name.lastIndexOf(".")),
          table.name.slice(table.name.lastIndexOf(".") + 1),
        ]
      : [undefined, table.name];
  const schemaName = table.schema_name || mssqlSchema;
  const name = schemaName
    ? `${quote}${schemaName}${endQuote}.${quote}${mssqlTable}${endQuote}`
    : `${quote}${table.name}${endQuote}`;
  if (mode === "count") return `SELECT COUNT(*) AS total_count FROM ${name};`;
  if (mode === "insert") {
    const columns = table.columns
      .map((column) => `${quote}${column.name}${quote}`)
      .join(", ");
    const values = table.columns
      .map((_, index) => `'value_${index + 1}'`)
      .join(", ");
    return `INSERT INTO ${name} (${columns})\nVALUES (${values});`;
  }
  return `SELECT * FROM ${name} LIMIT 100;`;
}

function pinnedTablesKey(connectionId: string) {
  return `pebblebase:pinned:${connectionId}`;
}

export function DatabaseExplorer({
  connections,
  selectedConnectionId,
  selectedTable,
  activeConnectionId,
  tablesByConnection,
  statusByConnection,
  expandedNodeIds,
  onToggleNode,
  onExpandNodes,
  onCollapseAll,
  onSelectConnection,
  onSelectTable,
  onOpenQuery,
  onOpenERD,
  onOpenNewConnection,
  onRefreshConnection,
  onDuplicateConnection,
  onEditConnection,
  onDeleteConnection,
  onHideToolWindow,
}: DatabaseExplorerProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<{
    connection: Connection;
    table: TableSchema;
    x: number;
    y: number;
  } | null>(null);
  const [nodeMenu, setNodeMenu] = useState<{
    node: TreeNode;
    x: number;
    y: number;
  } | null>(null);
  const nodeMenuRef = useRef<HTMLDivElement>(null);
  const contextMenuOpenerRef = useRef<HTMLElement | null>(null);
  const [deletingConnection, setDeletingConnection] =
    useState<Connection | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [dangerModal, setDangerModal] = useState<{
    connectionId: string;
    tableName: string;
    action: "truncate" | "drop";
  } | null>(null);
  const [actionMessage, setActionMessage] = useState("");
  const [pinnedByConnection, setPinnedByConnection] = useState<
    Record<string, string[]>
  >(() => {
    const result: Record<string, string[]> = {};
    for (const connection of connections) {
      try {
        const value: unknown = JSON.parse(
          localStorage.getItem(pinnedTablesKey(connection.id)) || "[]",
        );
        result[connection.id] = Array.isArray(value)
          ? value.filter((name): name is string => typeof name === "string")
          : [];
      } catch {
        result[connection.id] = [];
      }
    }
    return result;
  });
  useEffect(() => {
    setPinnedByConnection((current) => {
      const next = { ...current };
      for (const connection of connections) {
        if (connection.id in next) continue;
        try {
          const value: unknown = JSON.parse(
            localStorage.getItem(pinnedTablesKey(connection.id)) || "[]",
          );
          next[connection.id] = Array.isArray(value)
            ? value.filter((name): name is string => typeof name === "string")
            : [];
        } catch {
          next[connection.id] = [];
        }
      }
      return next;
    });
  }, [connections]);
  useEffect(() => {
    if (!nodeMenu && !menu && contextMenuOpenerRef.current) {
      const opener = contextMenuOpenerRef.current;
      contextMenuOpenerRef.current = null;
      window.requestAnimationFrame(() => {
        if (opener.isConnected) opener.focus();
      });
    }
  }, [menu, nodeMenu]);
  useEffect(() => {
    if (!nodeMenu) return;
    nodeMenuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!nodeMenuRef.current?.contains(event.target as Node))
        setNodeMenu(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [nodeMenu]);
  const expanded = useMemo(() => new Set(expandedNodeIds), [expandedNodeIds]);
  const matchingConnections = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return connections;
    const allConnectionsSettled = connections.every((connection) => {
      const status = statusByConnection[connection.id];
      return status?.isSuccess || status?.isError;
    });
    if (!allConnectionsSettled) return connections;
    return connections.filter((connection) => {
      const tables = tablesByConnection[connection.id] || [];
      return (
        connection.name.toLowerCase().includes(term) ||
        connection.db_name.toLowerCase().includes(term) ||
        tables.some(
          (table) =>
            table.name.toLowerCase().includes(term) ||
            (table.schema_name || "").toLowerCase().includes(term),
        )
      );
    });
  }, [connections, filter, statusByConnection, tablesByConnection]);

  const nodes = useMemo(() => {
    const result: TreeNode[] = [];
    const term = filter.trim().toLowerCase();
    const matches = (value: string) =>
      !term || value.toLowerCase().includes(term);
    for (const connection of matchingConnections) {
      const rootId = connectionNodeId(connection.id);
      const status = statusByConnection[connection.id];
      const allTables = tablesByConnection[connection.id] || [];
      const connectionMatches =
        matches(connection.name) || matches(connection.db_name);
      const visibleTables =
        term && !connectionMatches
          ? allTables.filter(
              (table) =>
                matches(table.name) || matches(table.schema_name || ""),
            )
          : allTables;
      const hasMongoDatabase = connection.type === "mongodb";
      // MSSQL's existing adapter returns non-dbo names as `schema.table`, and
      // its table API accepts that qualified identity. Other adapters currently
      // return unqualified names, so optional metadata alone is not enough to
      // safely expose duplicate-name schemas in the tree.
      const schemaForTable = (table: TableSchema) =>
        connection.type === "mssql" && table.name.includes(".")
          ? table.name.slice(0, table.name.lastIndexOf("."))
          : undefined;
      const schemaNames = [
        ...new Set(
          visibleTables
            .map(schemaForTable)
            .filter((name): name is string => Boolean(name)),
        ),
      ].sort();
      const schemaAware =
        connection.type !== "mongodb" && schemaNames.length > 0;
      result.push({
        id: rootId,
        parentId: null,
        label: connection.name,
        depth: 1,
        icon: engineIcon(connection.type),
        expandable: true,
        expanded: expanded.has(rootId) || Boolean(term),
        connection,
        status,
        count: allTables.length,
        kind: "connection",
      });
      if (!expanded.has(rootId) && !term) continue;
      let tableParent = rootId;
      let tableDepth = 2;
      if (hasMongoDatabase) {
        const databaseId = dbGroupId(connection.id);
        result.push({
          id: databaseId,
          parentId: rootId,
          label: connection.db_name || connection.name,
          depth: 2,
          icon: Database,
          expandable: true,
          expanded: expanded.has(databaseId) || Boolean(term),
          connection,
          count: visibleTables.length,
          kind: "group",
        });
        if (!expanded.has(databaseId) && !term) continue;
        tableParent = databaseId;
        tableDepth = 3;
      }
      if (schemaAware) {
        for (const schema of schemaNames) {
          const schemaId = schemaGroupId(connection.id, schema);
          const schemaTables = visibleTables.filter(
            (table) => schemaForTable(table) === schema,
          );
          result.push({
            id: schemaId,
            parentId: rootId,
            label: schema,
            depth: 2,
            icon: Database,
            expandable: true,
            expanded: expanded.has(schemaId) || Boolean(term),
            connection,
            count: schemaTables.length,
            kind: "schema",
          });
          if (expanded.has(schemaId) || term) {
            for (const table of schemaTables)
              result.push({
                id: `${schemaId}:table:${encodeURIComponent(table.name)}`,
                parentId: schemaId,
                label: tableDisplayName(connection, table),
                depth: 3,
                icon: TableIcon,
                expandable: false,
                expanded: false,
                connection,
                table,
                kind: "table",
              });
          }
        }
        const unqualifiedTables = visibleTables.filter(
          (table) => !schemaForTable(table),
        );
        if (unqualifiedTables.length) {
          const groupId = objectsGroupId(connection.id);
          result.push({
            id: groupId,
            parentId: rootId,
            label: t("explorer.tables", "Tables"),
            depth: 2,
            icon: Folder,
            expandable: true,
            expanded: expanded.has(groupId) || Boolean(term),
            connection,
            count: unqualifiedTables.length,
            kind: "group",
          });
          if (expanded.has(groupId) || term) {
            for (const table of unqualifiedTables)
              result.push({
                id: `${groupId}:table:${encodeURIComponent(table.name)}`,
                parentId: groupId,
                label: tableDisplayName(connection, table),
                depth: 3,
                icon: TableIcon,
                expandable: false,
                expanded: false,
                connection,
                table,
                kind: "table",
              });
          }
        }
      } else if (visibleTables.length) {
        const groupId = hasMongoDatabase
          ? `${tableParent}:collections`
          : objectsGroupId(connection.id);
        result.push({
          id: groupId,
          parentId: tableParent,
          label: hasMongoDatabase
            ? t("explorer.collections", "Collections")
            : t(
                connection.type === "redis"
                  ? "explorer.keys"
                  : "explorer.tables",
                connection.type === "redis" ? "Keys" : "Tables",
              ),
          depth: tableDepth,
          icon: Folder,
          expandable: true,
          expanded: expanded.has(groupId) || Boolean(term),
          connection,
          count: visibleTables.length,
          kind: "group",
        });
        if (expanded.has(groupId) || term) {
          for (const table of visibleTables)
            result.push({
              id: `${groupId}:table:${encodeURIComponent(table.name)}`,
              parentId: groupId,
              label: tableDisplayName(connection, table),
              depth: tableDepth + 1,
              icon: TableIcon,
              expandable: false,
              expanded: false,
              connection,
              table,
              kind: "table",
            });
        }
      }
    }
    return result;
  }, [
    connections,
    expanded,
    filter,
    matchingConnections,
    statusByConnection,
    tablesByConnection,
    t,
  ]);

  useEffect(() => {
    if (!filter.trim()) return;
    const missing = nodes
      .filter((node) => node.expandable && !expanded.has(node.id))
      .map((node) => node.id);
    if (missing.length) onExpandNodes(missing);
  }, [expanded, filter, nodes, onExpandNodes]);

  const visibleNodes = useMemo(() => {
    const visible = new Set<string>();
    return nodes.filter((node) => {
      if (!node.parentId || visible.has(node.parentId)) {
        visible.add(node.id);
        return true;
      }
      return false;
    });
  }, [nodes]);

  const togglePin = (connectionId: string, tableName: string) => {
    setPinnedByConnection((current) => {
      const values = current[connectionId] || [];
      const next = values.includes(tableName)
        ? values.filter((name) => name !== tableName)
        : [...values, tableName];
      try {
        localStorage.setItem(
          pinnedTablesKey(connectionId),
          JSON.stringify(next),
        );
      } catch {
        /* storage may be disabled */
      }
      return { ...current, [connectionId]: next };
    });
  };

  const focusTreeItem = (target: HTMLButtonElement | undefined) =>
    target?.focus();
  const handleTreeKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="treeitem"]',
      ),
    ];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const node = visibleNodes[current];
    if (!node) return;
    const toggle = () => onToggleNode(node.id);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusTreeItem(
        items[
          Math.max(
            0,
            Math.min(
              items.length - 1,
              current + (event.key === "ArrowDown" ? 1 : -1),
            ),
          )
        ],
      );
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusTreeItem(items[event.key === "Home" ? 0 : items.length - 1]);
    } else if (event.key === "ArrowRight" && node.expandable) {
      event.preventDefault();
      if (!node.expanded) toggle();
      else focusTreeItem(items[current + 1]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (node.expandable && node.expanded) toggle();
      else if (node.parentId)
        focusTreeItem(
          items.find((item) => item.dataset.nodeId === node.parentId),
        );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (node.kind === "connection" && node.connection)
        onSelectConnection(node.connection);
      if (node.kind === "table" && node.connection && node.table)
        onSelectTable(node.connection.id, node.table);
      if (node.expandable) toggle();
    } else if (
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      const rect = items[current]?.getBoundingClientRect();
      if (!rect) return;
      contextMenuOpenerRef.current = items[current] || null;
      if (node.kind === "table" && node.connection && node.table)
        setMenu({
          connection: node.connection,
          table: node.table,
          x: rect.right,
          y: rect.top,
        });
      else setNodeMenu({ node, x: rect.right, y: rect.top });
    }
  };

  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ||
    null;
  const selectedTableSchema = selectedTable
    ? (tablesByConnection[selectedTable.connectionId] || []).find(
        (table) =>
          table.name === selectedTable.tableName &&
          (table.schema_name || "") === (selectedTable.schemaName || ""),
      )
    : null;
  const selectedTreeTable =
    selectedTableSchema ||
    (selectedConnection
      ? (tablesByConnection[selectedConnection.id] || [])[0]
      : undefined);
  const deleteConfirmed = Boolean(
    deletingConnection &&
    deleteConfirmationInput.trim() === deletingConnection.name.trim(),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-sidebar-border flex h-[30px] shrink-0 items-center justify-between border-b px-2">
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold">
          <Database className="text-muted-foreground size-3.5" />
          <span>{t("explorer.title", "Database")}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("commands.hideToolWindow", "Hide database tool window")}
          title={t("commands.hideToolWindow", "Hide database tool window")}
          onClick={onHideToolWindow}
        >
          <PanelLeftClose className="size-3.5" />
        </Button>
      </div>
      <div className="border-sidebar-border flex items-center gap-1 border-b p-2">
        <div className="relative min-w-0 flex-1">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1.5 left-2 size-3.5"
          />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={t("explorer.filter", "Filter databases and objects…")}
            aria-label={t("explorer.filter", "Filter databases and objects")}
            className="h-7 pl-7 text-xs"
          />
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("sidebar.newConnection", "New connection")}
          title={t("sidebar.newConnection", "New connection")}
          onClick={onOpenNewConnection}
        >
          <Plus className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("explorer.openSelected", "Open selected object")}
          title={t("explorer.openSelected", "Open selected object")}
          disabled={!selectedConnection || !selectedTreeTable}
          onClick={() =>
            selectedConnection &&
            selectedTreeTable &&
            onSelectTable(selectedConnection.id, selectedTreeTable)
          }
        >
          <TableIcon className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("sidebar.queryConsole", "New query console")}
          title={t("sidebar.queryConsole", "New query console")}
          disabled={!selectedConnection}
          onClick={() =>
            selectedConnection && onOpenQuery(selectedConnection.id)
          }
        >
          <Terminal className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("erd.title", "ER Diagram")}
          title={t("erd.title", "ER Diagram")}
          disabled={!selectedConnection || selectedConnection.type === "redis"}
          onClick={() => selectedConnection && onOpenERD(selectedConnection.id)}
        >
          <Workflow className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t("explorer.collapseAll", "Collapse all")}
          title={t("explorer.collapseAll", "Collapse all")}
          onClick={onCollapseAll}
        >
          <ChevronsDownUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={t(
            "sidebar.refreshTablesTooltip",
            "Refresh selected connection",
          )}
          title={t(
            "sidebar.refreshTablesTooltip",
            "Refresh selected connection",
          )}
          disabled={
            !selectedConnection ||
            statusByConnection[selectedConnection.id]?.isFetching
          }
          onClick={() =>
            selectedConnection &&
            void onRefreshConnection(selectedConnection.id)
          }
        >
          <RefreshCw
            className={cn(
              "size-3.5",
              selectedConnection &&
                statusByConnection[selectedConnection.id]?.isFetching &&
                "animate-spin",
            )}
          />
        </Button>
      </div>
      <div
        role="tree"
        aria-label={t("explorer.treeLabel", "Database connections and objects")}
        onKeyDown={handleTreeKeyDown}
        className="min-h-0 flex-1 overflow-auto px-1.5 py-1"
      >
        {connections.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-xs">
            {t("sidebar.noActiveConn", "No saved connections")}
          </div>
        )}
        {connections.length > 0 && visibleNodes.length === 0 && (
          <div className="text-muted-foreground px-3 py-8 text-center text-xs">
            {t(
              "explorer.noMatches",
              "No connections or objects match this filter",
            )}
          </div>
        )}
        {visibleNodes.map((node, index) => {
          const connection = node.connection;
          const isSelectedConnection =
            node.kind === "connection" &&
            connection?.id === selectedConnectionId;
          const isSelectedTable = Boolean(
            node.kind === "table" &&
            node.table &&
            selectedTable &&
            selectedTable.connectionId === connection?.id &&
            selectedTable.tableName === node.table.name &&
            (selectedTable.schemaName || "") === (node.table.schema_name || ""),
          );
          const ConnectionIcon = node.icon;
          const environment = connection?.environment || "local";
          const envStyle = ENV_STYLES[environment] || ENV_STYLES.local;
          const status = node.status;
          return (
            <div key={node.id}>
              <div
                className="group flex h-7 items-center"
                style={{ paddingLeft: `${(node.depth - 1) * 12}px` }}
              >
                <button
                  type="button"
                  role="treeitem"
                  aria-level={node.depth}
                  aria-expanded={node.expandable ? node.expanded : undefined}
                  aria-selected={Boolean(
                    isSelectedConnection || isSelectedTable,
                  )}
                  tabIndex={
                    isSelectedConnection ||
                    isSelectedTable ||
                    (!selectedConnectionId && index === 0)
                      ? 0
                      : -1
                  }
                  data-node-id={node.id}
                  onClick={() => {
                    if (node.kind === "connection" && connection)
                      onSelectConnection(connection);
                    if (node.kind === "table" && connection && node.table)
                      onSelectTable(connection.id, node.table);
                    if (node.expandable) onToggleNode(node.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    contextMenuOpenerRef.current = event.currentTarget;
                    if (node.kind === "table" && connection && node.table)
                      setMenu({
                        connection,
                        table: node.table,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    else
                      setNodeMenu({ node, x: event.clientX, y: event.clientY });
                  }}
                  className={cn(
                    "hover:bg-sidebar-accent focus-visible:ring-ring flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded px-1.5 text-left text-xs outline-none focus-visible:ring-1",
                    (isSelectedConnection || isSelectedTable) &&
                      "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                  )}
                >
                  {node.expandable ? (
                    node.expanded ? (
                      <ChevronDown className="text-muted-foreground size-3 shrink-0" />
                    ) : (
                      <ChevronRight className="text-muted-foreground size-3 shrink-0" />
                    )
                  ) : (
                    <span className="w-3 shrink-0" />
                  )}
                  <ConnectionIcon
                    aria-hidden="true"
                    className={cn(
                      "size-3.5 shrink-0",
                      node.kind === "connection"
                        ? "text-primary"
                        : node.kind === "table"
                          ? "text-muted-foreground"
                          : "text-warning",
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate">{node.label}</span>
                  {node.kind === "connection" && connection && (
                    <>
                      {connection.id === activeConnectionId && (
                        <span
                          title={t(
                            "explorer.activeEditorConnection",
                            "Active editor connection",
                          )}
                          className="bg-success/10 text-success dark:text-success rounded px-1 font-mono text-[8px] font-semibold"
                        >
                          A
                        </span>
                      )}
                      <span
                        title={`${environment} environment`}
                        className={cn(
                          "size-1.5 shrink-0 rounded-full",
                          envStyle.dot,
                        )}
                      />
                      {connection.read_only && (
                        <span
                          title={t(
                            "connection.readOnlyHelp",
                            "Read-only connection",
                          )}
                        >
                          <ShieldAlert className="text-warning size-3 shrink-0" />
                        </span>
                      )}
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-4 shrink-0 px-1 font-mono text-[9px]",
                          DATABASE_ENGINES.find(
                            (engine) => engine.type === connection.type,
                          )?.badge,
                        )}
                      >
                        {connection.type.toUpperCase()}
                      </Badge>
                      {status?.isLoading || status?.isFetching ? (
                        <LoaderCircle className="text-muted-foreground size-3 shrink-0 animate-spin" />
                      ) : status?.isError ? (
                        <Unplug className="text-destructive size-3 shrink-0" />
                      ) : status?.isSuccess ? (
                        <span
                          title={t("explorer.connected", "Loaded")}
                          className="bg-success size-1.5 shrink-0 rounded-full"
                        />
                      ) : null}
                    </>
                  )}
                  {node.count !== undefined && (
                    <span className="text-muted-foreground shrink-0 text-[10px] tabular-nums">
                      {node.count}
                    </span>
                  )}
                </button>
                {node.kind === "connection" && connection && (
                  <div className="hidden shrink-0 items-center gap-0.5 group-focus-within:flex group-hover:flex">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t("connection.editTitle", "Edit connection")}
                      title={t("connection.editTitle", "Edit connection")}
                      onClick={() => onEditConnection(connection)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t(
                        "sidebar.duplicateTooltip",
                        "Duplicate connection",
                      )}
                      title={t(
                        "sidebar.duplicateTooltip",
                        "Duplicate connection",
                      )}
                      onClick={() => onDuplicateConnection(connection)}
                    >
                      <Copy className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t(
                        "sidebar.deleteConnTooltip",
                        "Delete connection",
                      )}
                      title={t(
                        "sidebar.deleteConnTooltip",
                        "Delete connection",
                      )}
                      onClick={() => {
                        setDeleteConfirmationInput("");
                        setDeletingConnection(connection);
                      }}
                    >
                      <Trash2 className="text-destructive size-3" />
                    </Button>
                  </div>
                )}
              </div>
              {node.kind === "connection" &&
                node.expanded &&
                status?.isError && (
                  <div className="border-destructive/30 bg-destructive/5 my-1 mr-1 ml-7 rounded border px-2 py-2 text-[11px]">
                    <div className="text-destructive flex items-center gap-1.5 font-medium">
                      <Unplug className="size-3" />
                      {t("sidebar.connectionFailed", "Connection failed")}
                    </div>
                    <p className="text-muted-foreground mt-1 break-words">
                      {errorSummary(status.error)}
                    </p>
                    <details className="text-muted-foreground mt-1">
                      <summary className="cursor-pointer select-none">
                        {t("explorer.technicalDetails", "Technical details")}
                      </summary>
                      <pre className="bg-background/70 mt-1 max-h-28 overflow-auto rounded p-1.5 font-mono text-[10px] break-words whitespace-pre-wrap">
                        {errorMessage(status.error)}
                      </pre>
                      <button
                        type="button"
                        className="text-primary mt-1 inline-flex items-center gap-1 hover:underline"
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(errorMessage(status.error))
                            .catch(() => undefined)
                        }
                      >
                        <Copy className="size-3" />
                        {t("explorer.copyDiagnostic", "Copy diagnostic")}
                      </button>
                    </details>
                    <div className="mt-1.5 flex gap-2">
                      <button
                        type="button"
                        className="text-primary underline-offset-2 hover:underline"
                        onClick={() => void onRefreshConnection(connection!.id)}
                      >
                        {t("common.retry", "Retry")}
                      </button>
                      <button
                        type="button"
                        className="text-muted-foreground underline-offset-2 hover:underline"
                        onClick={() => onEditConnection(connection!)}
                      >
                        {t("connection.editTitle", "Edit connection")}
                      </button>
                    </div>
                  </div>
                )}
              {node.kind === "connection" &&
                node.expanded &&
                !status?.isError &&
                !status?.isLoading &&
                !status?.isFetching &&
                status?.isSuccess &&
                (node.count || 0) === 0 && (
                  <p className="text-muted-foreground ml-8 py-1 text-[11px]">
                    {t("explorer.empty", "No tables or collections found")}
                  </p>
                )}
            </div>
          );
        })}
      </div>
      {menu && (
        <TableContextMenu
          tableName={menu.table.name}
          x={menu.x}
          y={menu.y}
          isPinned={(pinnedByConnection[menu.connection.id] || []).includes(
            menu.table.name,
          )}
          onClose={() => setMenu(null)}
          onOpenTable={(newTab) =>
            onSelectTable(menu.connection.id, menu.table, newTab)
          }
          onViewSchema={() => {
            onSelectTable(menu.connection.id, menu.table);
            window.dispatchEvent(
              new CustomEvent("pb:switch-subview", { detail: "schema" }),
            );
          }}
          onQuerySelectTop100={() =>
            onOpenQuery(
              menu.connection.id,
              queryForTable(menu.connection, menu.table, "rows"),
              `${menu.table.name} (Top 100)`,
            )
          }
          onQuerySelectCount={() =>
            onOpenQuery(
              menu.connection.id,
              queryForTable(menu.connection, menu.table, "count"),
              `${menu.table.name} (Count)`,
            )
          }
          onQueryInsertTemplate={() =>
            onOpenQuery(
              menu.connection.id,
              queryForTable(menu.connection, menu.table, "insert"),
              `Insert ${menu.table.name}`,
            )
          }
          onCopyTableName={() =>
            void navigator.clipboard.writeText(menu.table.name)
          }
          onCopySelectQuery={() =>
            void navigator.clipboard.writeText(
              queryForTable(menu.connection, menu.table, "rows"),
            )
          }
          onExport={async (format) => {
            try {
              const blob = await exportTableData(
                menu.connection.id,
                menu.table.name,
                format,
              );
              const url = URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.download = `${menu.table.name}.${format}`;
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              setActionMessage(
                t(
                  "explorer.exportComplete",
                  `Exported ${menu.table.name}.${format}`,
                ),
              );
            } catch (error) {
              setActionMessage(errorMessage(error));
            }
          }}
          onTogglePin={() => togglePin(menu.connection.id, menu.table.name)}
          onDangerAction={(action) =>
            setDangerModal({
              connectionId: menu.connection.id,
              tableName: menu.table.name,
              action,
            })
          }
        />
      )}
      {nodeMenu && (
        <div
          ref={nodeMenuRef}
          role="menu"
          aria-label={`${nodeMenu.node.label} actions`}
          className="border-border bg-popover text-popover-foreground fixed z-50 min-w-48 rounded-md border p-1 shadow-lg"
          style={{
            left: Math.min(nodeMenu.x, window.innerWidth - 200),
            top: Math.min(nodeMenu.y, window.innerHeight - 150),
          }}
          onKeyDown={(event) => {
            const items = [
              ...(nodeMenuRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ) || []),
            ];
            const current = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (
              ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
              items.length
            ) {
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (current +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length;
              items[next]?.focus();
            } else if (event.key === "Escape") setNodeMenu(null);
          }}
        >
          {nodeMenu.node.kind === "connection" && nodeMenu.node.connection ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                onClick={() => {
                  onOpenQuery(nodeMenu.node.connection!.id);
                  setNodeMenu(null);
                }}
              >
                <Terminal className="size-3.5" />
                {t("sidebar.queryConsole", "New query console")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                onClick={() => {
                  void onRefreshConnection(nodeMenu.node.connection!.id);
                  setNodeMenu(null);
                }}
              >
                <RefreshCw className="size-3.5" />
                {t("sidebar.refreshTablesTooltip", "Refresh")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                onClick={() => {
                  onEditConnection(nodeMenu.node.connection!);
                  setNodeMenu(null);
                }}
              >
                <Pencil className="size-3.5" />
                {t("connection.editTitle", "Edit connection")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                onClick={() => {
                  onDuplicateConnection(nodeMenu.node.connection!);
                  setNodeMenu(null);
                }}
              >
                <Copy className="size-3.5" />
                {t("explorer.duplicateSettings", "Duplicate settings")}
              </button>
              <button
                type="button"
                role="menuitem"
                className="text-destructive hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                onClick={() => {
                  setDeleteConfirmationInput("");
                  setDeletingConnection(nodeMenu.node.connection!);
                  setNodeMenu(null);
                }}
              >
                <Trash2 className="size-3.5" />
                {t("sidebar.deleteConnTooltip", "Remove connection")}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                role="menuitem"
                className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                onClick={() => {
                  onToggleNode(nodeMenu.node.id);
                  setNodeMenu(null);
                }}
              >
                {nodeMenu.node.expanded ? (
                  <ChevronRight className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
                {nodeMenu.node.expanded
                  ? t("explorer.collapseNode", "Collapse")
                  : t("explorer.expandNode", "Expand")}
              </button>
              {nodeMenu.node.connection && (
                <button
                  type="button"
                  role="menuitem"
                  className="hover:bg-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                  onClick={() => {
                    onOpenQuery(nodeMenu.node.connection!.id);
                    setNodeMenu(null);
                  }}
                >
                  <Terminal className="size-3.5" />
                  {t("sidebar.queryConsole", "New query console")}
                </button>
              )}
            </>
          )}
        </div>
      )}
      {actionMessage && (
        <div
          role="status"
          className="border-sidebar-border text-muted-foreground border-t px-2 py-1 text-[11px]"
        >
          {actionMessage}
          <button
            type="button"
            className="text-primary ml-2"
            onClick={() => setActionMessage("")}
          >
            {t("common.dismiss", "Dismiss")}
          </button>
        </div>
      )}
      <AlertDialog
        open={Boolean(deletingConnection)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingConnection(null);
            setDeleteConfirmationInput("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("sidebar.removeConnTitle", "Remove connection?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("sidebar.removeConnDesc", { name: deletingConnection?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="text-muted-foreground space-y-2 text-xs">
            {t("sidebar.removeConnConfirmHelp", {
              name: deletingConnection?.name,
            })}
            <Input
              value={deleteConfirmationInput}
              onChange={(event) =>
                setDeleteConfirmationInput(event.target.value)
              }
              placeholder={deletingConnection?.name}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  deleteConfirmed &&
                  deletingConnection
                ) {
                  onDeleteConnection(deletingConnection.id);
                  setDeletingConnection(null);
                }
              }}
            />
          </label>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t("rowModal.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!deleteConfirmed}
              onClick={() => {
                if (deletingConnection && deleteConfirmed) {
                  onDeleteConnection(deletingConnection.id);
                  setDeletingConnection(null);
                }
              }}
              className="bg-destructive text-destructive-foreground"
            >
              {t("sidebar.deleteConnButton", "Delete connection")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {dangerModal && (
        <TableDangerModal
          isOpen
          actionType={dangerModal.action}
          tableName={dangerModal.tableName}
          connection={
            connections.find(
              (connection) => connection.id === dangerModal.connectionId,
            ) || null
          }
          onClose={() => setDangerModal(null)}
          onSuccess={(message) => {
            setActionMessage(message);
            void onRefreshConnection(dangerModal.connectionId);
          }}
        />
      )}
      <div className="sr-only" aria-live="polite">
        {t("explorer.activeEditorConnection", "Active editor connection")}:{" "}
        {connections.find((item) => item.id === activeConnectionId)?.name ||
          t("sidebar.noActiveConn", "None")}
      </div>
    </div>
  );
}
