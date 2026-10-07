import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher, ThemeToggle } from "@/components/common";
import {
  Database,
  Table as TableIcon,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronsUpDown,
  HardDrive,
  Key,
  Layers,
  CheckCircle2,
  Copy,
  ShieldAlert,
  Terminal,
  LogOut,
  Shield,
  KeyRound,
  Eye,
  Workflow,
  HelpCircle,
  Pin,
  GitCompare,
  MoreHorizontal,
  Unplug,
} from "lucide-react";
import type { Connection, TableSchema } from "@/lib/types";
import { SHORTCUTS, getShortcutTooltip } from "@/lib/platform";
import { useAuthStore } from "@/lib/auth";
import { apiLogout, exportTableData } from "@/lib/api";
import { TableContextMenu } from "./TableContextMenu";
import { TableDangerModal, type DangerActionType } from "@/components/modals";
import packageJson from "../../../package.json";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  DATABASE_ENGINES,
  ENV_DOTS,
  ENV_STYLES,
  STORAGE_KEYS,
  TOAST_DURATION_MS,
} from "@/constants";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Sidebar as SidebarPrimitive,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

interface SidebarProps {
  theme: "dark" | "light";
  onToggleTheme: () => void;
  connections: Connection[];
  selectedConnection: Connection | null;
  onSelectConnection: (conn: Connection) => void;
  onDeleteConnection: (id: string) => void;
  onCloneConnection: (conn: Connection) => void;
  onOpenNewConnection: () => void;
  tables: TableSchema[];
  selectedTable: string | null;
  onSelectTable: (tableName: string, openInNewTab?: boolean) => void;
  isLoadingTables: boolean;
  tablesError?: string | Error | null;
  onRefreshTables: () => void | Promise<void>;
  activeView?: "table" | "console" | "erd";
  onOpenQueryConsole?: (initialQuery?: string, title?: string) => void;
  onOpenERD?: () => void;
  onOpenDiff?: () => void;
  onOpenAdminPanel?: () => void;
  onOpenChangePassword?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenOnboarding?: () => void;
}

const ENGINE_CONFIG = DATABASE_ENGINES;

function buildSelectQuery(
  tbl: TableSchema,
  dbType?: string,
  limit = 100,
): string {
  if (dbType === "mongodb") {
    return `db.${tbl.name}.find().limit(${limit})`;
  }
  if (dbType === "mysql") {
    return `SELECT * FROM \`${tbl.name}\` LIMIT ${limit};`;
  }
  return `SELECT * FROM "${tbl.name}" LIMIT ${limit};`;
}

function buildCountQuery(tbl: TableSchema, dbType?: string): string {
  if (dbType === "mongodb") {
    return `db.${tbl.name}.countDocuments()`;
  }
  if (dbType === "mysql") {
    return `SELECT COUNT(*) AS total_count FROM \`${tbl.name}\`;`;
  }
  return `SELECT COUNT(*) AS total_count FROM "${tbl.name}";`;
}

function buildInsertTemplate(tbl: TableSchema, dbType?: string): string {
  if (dbType === "mongodb") {
    const sampleDoc: Record<string, any> = {};
    tbl.columns.slice(0, 5).forEach((c) => {
      sampleDoc[c.name] = c.is_primary_key ? "auto" : "value";
    });
    return `db.${tbl.name}.insertOne(${JSON.stringify(sampleDoc, null, 2)})`;
  }
  const cols = tbl.columns.map((c) => c.name);
  if (dbType === "mysql") {
    const colList = cols.map((c) => `\`${c}\``).join(", ");
    const valList = cols.map((_, i) => `'val_${i + 1}'`).join(", ");
    return `INSERT INTO \`${tbl.name}\` (${colList})\nVALUES (${valList});`;
  }
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const valList = cols.map((_, i) => `'val_${i + 1}'`).join(", ");
  return `INSERT INTO "${tbl.name}" (${colList})\nVALUES (${valList});`;
}

function getStoredPinnedTables(connectionId?: string): string[] {
  if (!connectionId) return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.pinnedTables(connectionId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    /* ignore storage errors */
  }
  return [];
}

export default function Sidebar({
  theme,
  onToggleTheme,
  connections,
  selectedConnection,
  onSelectConnection,
  onDeleteConnection,
  onCloneConnection,
  onOpenNewConnection,
  tables,
  selectedTable,
  onSelectTable,
  isLoadingTables,
  tablesError,
  onRefreshTables,
  activeView = "table",
  onOpenQueryConsole,
  onOpenERD,
  onOpenDiff,
  onOpenAdminPanel,
  onOpenChangePassword,
  onOpenCommandPalette,
  onOpenOnboarding,
}: SidebarProps) {
  const { t } = useTranslation();
  const [tableSearch, setTableSearch] = useState("");
  const [deletingConnection, setDeletingConnection] =
    useState<Connection | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing || isLoadingTables || !selectedConnection) return;
    setIsRefreshing(true);
    try {
      await onRefreshTables();
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  async function handleSignOut() {
    try {
      await apiLogout();
    } catch {
      /* ignore */
    }
    clearAuth();
  }

  const isDeleteConfirmed = Boolean(
    deletingConnection &&
    deleteConfirmationInput.trim() === deletingConnection.name.trim(),
  );

  const [pinnedTableNames, setPinnedTableNames] = useState<string[]>(() =>
    getStoredPinnedTables(selectedConnection?.id),
  );
  const [pinToast, setPinToast] = useState<string | null>(null);

  // Table Context Menu & Actions
  const [tableContextMenu, setTableContextMenu] = useState<{
    tableName: string;
    x: number;
    y: number;
  } | null>(null);

  const [dangerModal, setDangerModal] = useState<{
    isOpen: boolean;
    actionType: DangerActionType;
    tableName: string;
  } | null>(null);

  const [actionToast, setActionToast] = useState<string | null>(null);

  useEffect(() => {
    if (!actionToast) return;
    const timer = setTimeout(() => setActionToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [actionToast]);

  useEffect(() => {
    setPinnedTableNames(getStoredPinnedTables(selectedConnection?.id));
  }, [selectedConnection?.id]);

  useEffect(() => {
    if (!pinToast) return;
    const timer = setTimeout(() => setPinToast(null), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [pinToast]);

  const handleTogglePin = (tableName: string) => {
    if (!selectedConnection) return;
    const connId = selectedConnection.id;
    setPinnedTableNames((prev) => {
      const isPinned = prev.includes(tableName);
      let next: string[];
      if (isPinned) {
        next = prev.filter((name) => name !== tableName);
      } else {
        if (prev.length >= 10) {
          setPinToast(t("sidebar.pin.max"));
          return prev;
        }
        next = [...prev, tableName];
      }
      try {
        localStorage.setItem(
          STORAGE_KEYS.pinnedTables(connId),
          JSON.stringify(next),
        );
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  };

  const pinnedTables = useMemo(() => {
    const tableMap = new Map(tables.map((t) => [t.name, t]));
    return pinnedTableNames
      .map((name) => tableMap.get(name))
      .filter((t): t is TableSchema => Boolean(t));
  }, [tables, pinnedTableNames]);

  const unpinnedTables = useMemo(() => {
    const pinnedSet = new Set(pinnedTableNames);
    return tables.filter((t) => !pinnedSet.has(t.name));
  }, [tables, pinnedTableNames]);

  const filteredPinnedTables = useMemo(() => {
    if (!tableSearch) return pinnedTables;
    const query = tableSearch.toLowerCase();
    return pinnedTables.filter((t) => t.name.toLowerCase().includes(query));
  }, [pinnedTables, tableSearch]);

  const filteredUnpinnedTables = useMemo(() => {
    if (!tableSearch) return unpinnedTables;
    const query = tableSearch.toLowerCase();
    return unpinnedTables.filter((t) => t.name.toLowerCase().includes(query));
  }, [unpinnedTables, tableSearch]);

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase()),
  );

  const renderTableItem = (tbl: TableSchema, isPinned: boolean) => {
    const isSelected = selectedTable === tbl.name;
    const isMenuOpen = tableContextMenu?.tableName === tbl.name;
    const hasPk = tbl.columns.some((c) => c.is_primary_key);
    const hasFk = tbl.columns.some((c) => c.is_foreign_key);
    const colCount = tbl.columns.length;

    return (
      <SidebarMenuItem
        key={tbl.name}
        className="group/menu-item relative flex items-center"
      >
        <SidebarMenuButton
          isActive={isSelected}
          onClick={(e) => onSelectTable(tbl.name, e.ctrlKey || e.metaKey)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setTableContextMenu({
              tableName: tbl.name,
              x: e.clientX,
              y: e.clientY,
            });
          }}
          tooltip={
            isPinned
              ? `⭐ ${tbl.name} (${colCount} cols)`
              : `${tbl.name} (${colCount} cols)`
          }
          className={cn(
            "h-7 cursor-pointer px-2 pr-14 font-mono text-xs transition-colors",
            isSelected
              ? "border border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-900 dark:text-emerald-200"
              : isMenuOpen
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-zinc-100",
          )}
        >
          <TableIcon
            className={cn(
              "size-3.5 shrink-0",
              isSelected
                ? "text-emerald-600 dark:text-emerald-400"
                : isPinned
                  ? "text-amber-500 dark:text-amber-400"
                  : "text-zinc-400 dark:text-zinc-500",
            )}
          />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {tbl.name}
          </span>

          {/* Normal State: Metadata badges (smoothly fades out on hover) */}
          <div
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1 transition-opacity duration-150 group-data-[collapsible=icon]:hidden",
              isMenuOpen
                ? "pointer-events-none opacity-0"
                : "group-hover/menu-item:opacity-0",
            )}
          >
            {isPinned && (
              <span title={t("sidebar.pinned")}>
                <Pin className="size-2.5 rotate-45 fill-amber-500 text-amber-500" />
              </span>
            )}
            {hasPk && (
              <span title={t("sidebar.primaryKeyTooltip")}>
                <Key className="size-2.5 text-amber-500 dark:text-amber-400/80" />
              </span>
            )}
            {hasFk && (
              <span title={t("sidebar.foreignRelationsTooltip")}>
                <Layers className="size-2.5 text-sky-500 dark:text-sky-400/80" />
              </span>
            )}
            <Badge
              variant={isSelected ? "default" : "secondary"}
              className={cn(
                "inline-flex h-4 min-w-4 shrink-0 items-center justify-center gap-0 rounded-full p-0 text-center font-mono text-[10px] leading-none font-medium tabular-nums select-none",
                colCount > 9 ? "min-w-5 px-1.5" : "px-0",
              )}
            >
              <span className="inline-block translate-y-px leading-none">
                {colCount}
              </span>
            </Badge>
          </div>
        </SidebarMenuButton>

        {/* Hover / Active Action Toolbar: Pin + More (•••) */}
        <div
          className={cn(
            "pointer-events-none absolute top-1/2 right-1.5 z-10 flex -translate-y-1/2 items-center gap-0.5 rounded-md p-0.5 transition-all duration-150 group-data-[collapsible=icon]:hidden",
            isMenuOpen
              ? "pointer-events-auto bg-zinc-200/90 opacity-100 shadow-xs dark:bg-zinc-800/90"
              : "opacity-0 group-hover/menu-item:pointer-events-auto group-hover/menu-item:bg-zinc-200/80 group-hover/menu-item:opacity-100 dark:group-hover/menu-item:bg-zinc-800/80",
          )}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleTogglePin(tbl.name);
            }}
            className={cn(
              "flex h-5 w-5 cursor-pointer items-center justify-center rounded transition-colors",
              isPinned
                ? "text-amber-500 hover:bg-amber-500/20 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
                : "text-zinc-500 hover:bg-zinc-300/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/80 dark:hover:text-zinc-100",
            )}
            title={isPinned ? t("sidebar.pin.remove") : t("sidebar.pin.add")}
          >
            <Pin
              className={cn(
                "size-3 transition-transform",
                isPinned && "rotate-45 fill-current",
              )}
            />
            <span className="sr-only">
              {isPinned ? t("sidebar.pin.remove") : t("sidebar.pin.add")}
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setTableContextMenu({
                tableName: tbl.name,
                x: rect.right + 4,
                y: rect.top,
              });
            }}
            className={cn(
              "flex h-5 w-5 cursor-pointer items-center justify-center rounded transition-colors",
              isMenuOpen
                ? "bg-zinc-300/80 text-zinc-900 dark:bg-zinc-700/80 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-300/80 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-700/80 dark:hover:text-zinc-100",
            )}
            title={t("sidebar.tableMenu.actionsTooltip")}
          >
            <MoreHorizontal className="size-3" />
            <span className="sr-only">
              {t("sidebar.tableMenu.actionsTooltip")}
            </span>
          </button>
        </div>
      </SidebarMenuItem>
    );
  };

  return (
    <SidebarPrimitive
      collapsible="icon"
      className="border-sidebar-border bg-sidebar border-r transition-colors select-none"
    >
      {/* Brand Header & Quick Actions */}
      <SidebarHeader
        className="border-sidebar-border wails-drag gap-2 border-b p-2"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex h-9 items-center justify-between px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <div className="pointer-events-none flex items-center gap-2 overflow-hidden">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 p-1">
              <img
                src="/favicon.svg"
                alt="Pebblebase"
                className="size-full object-contain"
              />
            </div>
            <span className="truncate font-mono text-xs font-semibold tracking-wider text-zinc-900 uppercase group-data-[collapsible=icon]:hidden dark:text-zinc-100">
              Pebblebase
            </span>
          </div>

          <div
            className="wails-no-drag flex items-center gap-0.5 group-data-[collapsible=icon]:hidden"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            {onOpenCommandPalette && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={onOpenCommandPalette}
                      className="wails-no-drag text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                      style={
                        { WebkitAppRegion: "no-drag" } as React.CSSProperties
                      }
                    >
                      <Search className="size-3.5" />
                    </Button>
                  }
                />
                <TooltipContent side="bottom">
                  {getShortcutTooltip("commandPalette")}
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onOpenNewConnection}
                    className="wails-no-drag text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    style={
                      { WebkitAppRegion: "no-drag" } as React.CSSProperties
                    }
                  >
                    <Plus className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">
                {t("sidebar.newConnection")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Active Connection Switcher */}
        <SidebarMenu
          className="wails-no-drag"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={
                      selectedConnection
                        ? `${selectedConnection.name} (${selectedConnection.db_name}) • [${(selectedConnection.environment || "local").toUpperCase()}]`
                        : t("sidebar.selectConnection")
                    }
                    className="data-[state=open]:bg-sidebar-accent w-full cursor-pointer group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                  >
                    <div className="flex size-7 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                      <HardDrive className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex flex-1 flex-col gap-1 truncate text-left leading-none group-data-[collapsible=icon]:hidden">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-muted-foreground font-mono text-[10px] tracking-wider uppercase">
                          {t("sidebar.activeDb")}
                        </span>
                        <div className="flex items-center gap-1">
                          {selectedConnection?.read_only && (
                            <span
                              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] leading-none font-semibold text-amber-700 uppercase select-none dark:bg-amber-500/15 dark:text-amber-400"
                              title={t("connection.readOnlyHelp")}
                            >
                              <ShieldAlert className="size-2.5 shrink-0" />
                              <span className="leading-none">RO</span>
                            </span>
                          )}
                          {selectedConnection &&
                            (() => {
                              const envKey =
                                selectedConnection.environment || "local";
                              const style =
                                ENV_STYLES[envKey] || ENV_STYLES.local;
                              return (
                                <span
                                  className={cn(
                                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-1.5 py-0.5 font-mono text-[9px] leading-none font-semibold uppercase select-none",
                                    style.bg,
                                    style.text,
                                    style.border,
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "size-1.5 shrink-0 rounded-full",
                                      style.dot,
                                    )}
                                  />
                                  <span className="inline-block translate-y-px leading-none">
                                    {envKey}
                                  </span>
                                </span>
                              );
                            })()}
                        </div>
                      </div>
                      <span className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {selectedConnection
                          ? selectedConnection.name
                          : t("sidebar.selectConnection")}
                      </span>
                    </div>
                    <ChevronDown className="text-muted-foreground ml-auto size-3.5 shrink-0 group-data-[collapsible=icon]:hidden" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                className="bg-popover w-76 overflow-hidden rounded-xl border border-zinc-200 p-0 shadow-2xl sm:w-80 dark:border-zinc-800"
                align="start"
                side="bottom"
              >
                {/* Fixed Header (Never scrolls away) */}
                <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                  <div className="flex items-center gap-1.5">
                    <Database className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {t("sidebar.connectionsHeader")}
                    </span>
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 py-0 font-mono text-[10px] font-medium"
                    >
                      {connections.length}
                    </Badge>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                    {t("sidebar.groupedByEngine")}
                  </span>
                </div>

                {/* Scrollable Connection List */}
                <div className="custom-scrollbar max-h-60 overflow-y-auto px-1.5 py-1.5">
                  {ENGINE_CONFIG.map(({ type, label, badge }) => {
                    const engineConns = connections.filter(
                      (c) => c.type === type,
                    );
                    if (engineConns.length === 0) return null;

                    return (
                      <div key={type} className="mb-2.5 last:mb-0.5">
                        <div className="text-muted-foreground mb-1 flex items-center justify-between rounded bg-zinc-100/50 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider uppercase dark:bg-zinc-900/40">
                          <Badge
                            variant="outline"
                            className={cn(
                              "h-4 px-1.5 py-0 font-mono text-[9px]",
                              badge,
                            )}
                          >
                            {label}
                          </Badge>
                          <span className="font-mono text-[10px] text-zinc-400">
                            {engineConns.length}
                          </span>
                        </div>

                        {engineConns.map((c) => {
                          const isCurrent = c.id === selectedConnection?.id;
                          const env = c.environment || "local";
                          const dotColor = ENV_DOTS[env] || "bg-emerald-500";

                          return (
                            <DropdownMenuItem
                              key={c.id}
                              onClick={() => onSelectConnection(c)}
                              className={`my-0.5 flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors ${
                                isCurrent
                                  ? "border border-emerald-500/30 bg-emerald-500/10 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                  : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2.5 truncate">
                                {isCurrent ? (
                                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                ) : (
                                  <span
                                    className={cn(
                                      "size-2 shrink-0 rounded-full ring-1",
                                      dotColor,
                                    )}
                                    title={`Environment: ${env}`}
                                  />
                                )}
                                <div className="flex min-w-0 flex-col truncate">
                                  <div className="flex items-center gap-1.5 truncate">
                                    <span className="truncate text-xs leading-tight font-medium text-zinc-900 dark:text-zinc-100">
                                      {c.name}
                                    </span>
                                    {c.read_only && (
                                      <span
                                        className="py-0.2 inline-flex shrink-0 items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1 font-mono text-[8px] leading-none font-semibold text-amber-700 uppercase dark:bg-amber-500/15 dark:text-amber-400"
                                        title={t("connection.readOnlyHelp")}
                                      >
                                        <ShieldAlert className="size-2 shrink-0" />
                                        <span>RO</span>
                                      </span>
                                    )}
                                  </div>
                                  <span className="mt-0.5 truncate font-mono text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                                    {c.db_name} • {c.host}:{c.port}
                                  </span>
                                </div>
                              </div>

                              <div
                                className="ml-2 flex shrink-0 items-center gap-0.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  title={t("sidebar.duplicateTooltip")}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCloneConnection(c);
                                  }}
                                  className="h-6 w-6 rounded text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
                                >
                                  <Copy className="size-3.5" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  title={t("sidebar.deleteConnTooltip")}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDeleteConfirmationInput("");
                                    setDeletingConnection(c);
                                  }}
                                  className="h-6 w-6 rounded text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-950/40"
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                {/* Fixed Footer (Always visible) */}
                <div className="border-t border-zinc-100 bg-zinc-50/70 p-1.5 dark:border-zinc-800/80 dark:bg-zinc-900/60">
                  <DropdownMenuItem
                    onClick={onOpenNewConnection}
                    className="flex cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:bg-emerald-500/20"
                  >
                    <Plus className="size-3.5" />
                    {t("sidebar.newConnectionEllipsis")}
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Tables Explorer Content */}
      <SidebarContent className="gap-0">
        {/* Navigation Quick Actions (Query Console, ERD & Schema Diff) */}
        {selectedConnection &&
          (onOpenQueryConsole || onOpenERD || onOpenDiff) && (
            <div className="border-sidebar-border space-y-1 border-b p-2 pb-1.5">
              {onOpenQueryConsole && (
                <Button
                  type="button"
                  data-tour="nav-query-console"
                  variant={activeView === "console" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => onOpenQueryConsole?.()}
                  title={getShortcutTooltip("queryConsole")}
                  className={cn(
                    "h-8 w-full cursor-pointer justify-between px-2 font-mono text-xs group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                    activeView === "console"
                      ? "border border-emerald-500/30 bg-emerald-500/10 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  <div className="flex items-center gap-2 truncate leading-none">
                    <Terminal className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span className="translate-y-px truncate leading-none group-data-[collapsible=icon]:hidden">
                      {t("sidebar.queryConsole")}
                    </span>
                  </div>
                  <kbd className="translate-y-px rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] leading-none text-zinc-400 group-data-[collapsible=icon]:hidden dark:border-zinc-700 dark:bg-zinc-800">
                    {SHORTCUTS.queryConsole}
                  </kbd>
                </Button>
              )}

              {onOpenERD && (
                <Button
                  type="button"
                  data-tour="nav-erd"
                  variant={activeView === "erd" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => onOpenERD?.()}
                  title={getShortcutTooltip("erd")}
                  className={cn(
                    "h-8 w-full cursor-pointer justify-between px-2 font-mono text-xs group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
                    activeView === "erd"
                      ? "border border-indigo-500/30 bg-indigo-500/10 font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400"
                      : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                >
                  <div className="flex items-center gap-2 truncate leading-none">
                    <Workflow className="size-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span className="translate-y-px truncate leading-none group-data-[collapsible=icon]:hidden">
                      {t("erd.title")}
                    </span>
                  </div>
                  <kbd className="translate-y-px rounded border border-zinc-200 bg-zinc-100 px-1.5 py-0.5 font-mono text-[9px] leading-none text-zinc-400 group-data-[collapsible=icon]:hidden dark:border-zinc-700 dark:bg-zinc-800">
                    {SHORTCUTS.erd}
                  </kbd>
                </Button>
              )}

              {onOpenDiff && selectedConnection.type !== "mongodb" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenDiff?.()}
                  title={t("diff.title")}
                  className="h-8 w-full cursor-pointer justify-between px-2 font-mono text-xs text-zinc-600 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  <div className="flex items-center gap-2 truncate leading-none">
                    <GitCompare className="size-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
                    <span className="translate-y-px truncate leading-none group-data-[collapsible=icon]:hidden">
                      {t("diff.title")}
                    </span>
                  </div>
                </Button>
              )}
            </div>
          )}

        {/* Table Filter Input (Hidden when collapsed) */}
        <div className="border-sidebar-border border-b p-2 group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-zinc-400" />
              <Input
                type="text"
                placeholder={t("sidebar.filterTables")}
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="h-7 pr-8 pl-7 font-mono text-xs"
              />
              {onOpenCommandPalette && (
                <button
                  type="button"
                  onClick={onOpenCommandPalette}
                  title={getShortcutTooltip("commandPalette")}
                  className="absolute top-1 right-1.5 cursor-pointer rounded border border-zinc-200 bg-zinc-100 px-1 py-0.5 font-mono text-[9px] font-medium text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                >
                  {SHORTCUTS.commandPalette}
                </button>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={handleRefresh}
                    disabled={
                      isLoadingTables || isRefreshing || !selectedConnection
                    }
                    className="h-7 w-7 shrink-0 cursor-pointer text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 active:bg-zinc-200 dark:text-zinc-400 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100 dark:active:bg-zinc-700/80"
                  >
                    <RefreshCw
                      className={cn(
                        "size-3.5 transition-colors",
                        (isLoadingTables || isRefreshing) &&
                          "animate-spin text-indigo-600 dark:text-indigo-400",
                      )}
                    />
                  </Button>
                }
              />
              <TooltipContent side="right">
                {t("sidebar.refreshTablesTooltip")}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Tables Group */}
        <SidebarGroup
          data-tour="sidebar-tables"
          className="flex-1 overflow-y-auto p-1.5"
        >
          {pinnedTables.length === 0 && (
            <SidebarGroupLabel className="mb-1 px-2 font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase group-data-[collapsible=icon]:hidden dark:text-zinc-400">
              {t("sidebar.tablesHeader")}{" "}
              {tables.length > 0
                ? `(${filteredTables.length}/${tables.length})`
                : ""}
            </SidebarGroupLabel>
          )}

          <SidebarGroupContent>
            {!selectedConnection ? (
              <div className="px-2 py-8 text-center group-data-[collapsible=icon]:hidden">
                <Database className="mx-auto mb-2 size-8 text-zinc-300 dark:text-zinc-700" />
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {t("sidebar.noActiveConn")}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-500">
                  {t("sidebar.connectToIntrospect")}
                </p>
              </div>
            ) : isLoadingTables || isRefreshing ? (
              <SidebarMenu className="animate-in fade-in space-y-0.5 duration-150">
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <SidebarMenuItem key={i}>
                    <div className="flex h-7 items-center gap-2 rounded-md px-2 transition-colors">
                      <Skeleton className="size-3.5 shrink-0 rounded bg-zinc-200/90 dark:bg-zinc-800/90" />
                      <Skeleton
                        className="h-3 rounded bg-zinc-200/80 group-data-[collapsible=icon]:hidden dark:bg-zinc-800/80"
                        style={{ width: `${58 + ((i * 19) % 45)}px` }}
                      />
                      <div className="ml-auto flex shrink-0 items-center gap-1.5 group-data-[collapsible=icon]:hidden">
                        {i % 2 === 0 && (
                          <Skeleton className="size-2.5 rounded-full bg-amber-400/35 dark:bg-amber-400/25" />
                        )}
                        {i % 3 === 0 && (
                          <Skeleton className="size-2.5 rounded-full bg-sky-400/35 dark:bg-sky-400/25" />
                        )}
                        <Skeleton className="h-4 w-4 rounded-full bg-zinc-200/90 dark:bg-zinc-800/90" />
                      </div>
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            ) : tablesError && tables.length === 0 ? (
              <div className="mx-2 my-2 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-center group-data-[collapsible=icon]:hidden dark:border-rose-500/25 dark:bg-rose-500/10">
                <div className="mx-auto mb-1.5 flex size-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-500">
                  <Unplug className="size-4" />
                </div>
                <p className="font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">
                  {t("sidebar.connectionFailed", "Connection Failed")}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t("sidebar.couldNotLoadTables", "Could not load tables")}
                </p>
                <div className="mt-2.5 flex items-center justify-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={onRefreshTables}
                    disabled={isLoadingTables || isRefreshing}
                    className="h-6 cursor-pointer gap-1 border-rose-300/60 px-2 font-mono text-[10px] text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/60"
                  >
                    <RefreshCw
                      className={cn(
                        "size-2.5",
                        (isLoadingTables || isRefreshing) && "animate-spin",
                      )}
                    />
                    <span>{t("common.retry", "Retry")}</span>
                  </Button>
                  {onCloneConnection && selectedConnection && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => onCloneConnection(selectedConnection)}
                      className="h-6 cursor-pointer px-2 font-mono text-[10px] text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      {t("sidebar.edit", "Edit")}
                    </Button>
                  )}
                </div>
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="px-2 py-8 text-center font-mono text-xs text-zinc-500 group-data-[collapsible=icon]:hidden">
                {tables.length === 0
                  ? t("sidebar.noUserTablesFound")
                  : t("sidebar.noTablesMatching", { term: tableSearch })}
              </div>
            ) : (
              <div className="space-y-3">
                {/* Pinned Section */}
                {filteredPinnedTables.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-amber-600 uppercase group-data-[collapsible=icon]:hidden dark:text-amber-400">
                      <span>⭐ {t("sidebar.pinned")}</span>
                      <span className="font-normal text-zinc-400 dark:text-zinc-500">
                        ({filteredPinnedTables.length})
                      </span>
                    </div>
                    <SidebarMenu>
                      {filteredPinnedTables.map((tbl) =>
                        renderTableItem(tbl, true),
                      )}
                    </SidebarMenu>
                  </div>
                )}

                {/* All / Unpinned Tables Section */}
                {filteredUnpinnedTables.length > 0 && (
                  <div>
                    {pinnedTables.length > 0 && (
                      <div className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] font-semibold tracking-wider text-zinc-500 uppercase group-data-[collapsible=icon]:hidden dark:text-zinc-400">
                        <span>{t("sidebar.tablesHeader")}</span>
                        {tables.length > 0 && (
                          <span className="font-normal text-zinc-400 dark:text-zinc-500">
                            ({filteredUnpinnedTables.length}/
                            {unpinnedTables.length})
                          </span>
                        )}
                      </div>
                    )}
                    <SidebarMenu>
                      {filteredUnpinnedTables.map((tbl) =>
                        renderTableItem(tbl, false),
                      )}
                    </SidebarMenu>
                  </div>
                )}
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer & Collapsed Shortcuts */}
      <SidebarFooter className="border-sidebar-border flex flex-col gap-0 border-t p-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:p-2">
        {/* User menu — shown when authenticated */}
        {user && (
          <div className="w-full p-2 pb-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="group relative flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-zinc-200/50 bg-zinc-50/60 p-1.5 shadow-2xs transition-all duration-200 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800/60 dark:bg-zinc-900/40 dark:hover:border-zinc-700/80 dark:hover:bg-zinc-800/70">
                    {/* Avatar with gradient & online dot */}
                    <div className="relative flex size-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/30 bg-linear-to-br from-indigo-500/20 via-indigo-600/15 to-violet-500/25 shadow-xs transition-colors group-hover:border-indigo-500/50">
                      <span className="font-mono text-xs font-semibold tracking-tight text-indigo-400 uppercase dark:text-indigo-300">
                        {user.username.slice(0, 2)}
                      </span>
                      <span className="absolute -right-0.5 -bottom-0.5 size-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-zinc-950" />
                    </div>

                    {/* User Info */}
                    <div className="min-w-0 flex-1 text-left group-data-[collapsible=icon]:hidden">
                      <div className="truncate text-xs font-semibold text-zinc-800 transition-colors group-hover:text-zinc-950 dark:text-zinc-200 dark:group-hover:text-white">
                        {user.username}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        {user.role === "admin" ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                            <Shield className="size-2.5 shrink-0" />
                            {t("auth.role.admin")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
                            <Eye className="size-2.5 shrink-0" />
                            {t("auth.role.viewer")}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Chevrons */}
                    <ChevronsUpDown className="ml-auto size-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600 group-data-[collapsible=icon]:hidden dark:text-zinc-500 dark:group-hover:text-zinc-300" />
                  </button>
                }
              />
              <DropdownMenuContent
                align="end"
                side="top"
                sideOffset={8}
                className="w-56 rounded-xl border border-zinc-200 bg-white p-1.5 text-zinc-900 shadow-xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              >
                {/* Account Header */}
                <div className="mb-1 flex items-center gap-2.5 rounded-lg border border-zinc-200/60 bg-zinc-50 px-2.5 py-2 dark:border-zinc-800/60 dark:bg-zinc-950/60">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md border border-indigo-500/30 bg-indigo-500/20">
                    <span className="font-mono text-[11px] font-bold text-indigo-400 uppercase">
                      {user.username.slice(0, 2)}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-100">
                      {user.username}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                      {user.role === "admin" ? (
                        <span className="flex items-center gap-0.5 font-medium text-indigo-500 dark:text-indigo-400">
                          <Shield className="size-2.5" /> {t("auth.role.admin")}
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-zinc-500 dark:text-zinc-400">
                          <Eye className="size-2.5" /> {t("auth.role.viewer")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <DropdownMenuItem
                  onClick={onOpenChangePassword}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
                >
                  <KeyRound className="size-3.5 text-zinc-400" />
                  {t("auth.changePassword")}
                </DropdownMenuItem>

                {user.role === "admin" && (
                  <DropdownMenuItem
                    onClick={onOpenAdminPanel}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
                  >
                    <Shield className="size-3.5 text-indigo-400" />
                    <span className="flex-1">{t("auth.adminPanel")}</span>
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator className="my-1 bg-zinc-200 dark:bg-zinc-800" />

                <DropdownMenuItem
                  onClick={handleSignOut}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-rose-600 transition-colors hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300"
                >
                  <LogOut className="size-3.5" />
                  {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Version + Language + Theme bar */}
        <div className="border-sidebar-border flex h-9 items-center justify-between border-t bg-zinc-50/40 px-3 group-data-[collapsible=icon]:hidden dark:bg-zinc-950/30">
          <div className="flex flex-1 items-center gap-1.5 truncate">
            <span className="font-mono text-[11px] font-semibold tracking-tight text-zinc-600 dark:text-zinc-400">
              Pebblebase
            </span>
            <Badge
              variant="outline"
              className="inline-flex h-4 items-center justify-center border-zinc-200 bg-zinc-100/60 px-1.5 py-0 font-mono text-[9px] leading-none font-normal text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60"
            >
              <span className="translate-y-0.5">v{packageJson.version}</span>
            </Badge>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onOpenOnboarding && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={onOpenOnboarding}
                      className="flex h-6 w-6 items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                    >
                      <HelpCircle className="size-3.5 text-zinc-500 transition-colors hover:text-emerald-500 dark:text-zinc-400 dark:hover:text-emerald-400" />
                    </Button>
                  }
                />
                <TooltipContent side="top">
                  {t("onboarding.replayTour", "Quick Tour & Feature Guide")}
                </TooltipContent>
              </Tooltip>
            )}
            <LanguageSwitcher />
            <span className="mx-0.5 h-3 w-px shrink-0 self-center bg-zinc-200 dark:bg-zinc-800" />
            <ThemeToggle
              theme={theme}
              onToggleTheme={onToggleTheme}
              side="top"
            />
          </div>
        </div>

        {/* Collapsed icon mode: vertical stack */}
        <div className="hidden w-full flex-col items-center justify-center gap-1.5 py-1 group-data-[collapsible=icon]:flex">
          {onOpenOnboarding && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onOpenOnboarding}
              title={t("onboarding.replayTour", "Quick Tour & Feature Guide")}
              className="flex h-6 w-6 items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <HelpCircle className="size-3.5 text-zinc-500 transition-colors hover:text-emerald-500 dark:text-zinc-400 dark:hover:text-emerald-400" />
            </Button>
          )}
          <LanguageSwitcher compact />
          <ThemeToggle
            theme={theme}
            onToggleTheme={onToggleTheme}
            side="right"
          />
        </div>
      </SidebarFooter>

      {/* Edge Rail for smooth click-to-toggle */}
      <SidebarRail />

      {/* Remove Connection Confirmation Dialog */}
      <AlertDialog
        open={Boolean(deletingConnection)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingConnection(null);
            setDeleteConfirmationInput("");
          }
        }}
      >
        <AlertDialogContent className="rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
          <AlertDialogHeader>
            <AlertDialogMedia className="rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t("sidebar.removeConnTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t("sidebar.removeConnDesc", { name: deletingConnection?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Sensitive confirmation input */}
          <div className="space-y-2 py-1">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              {t("sidebar.removeConnConfirmHelp", {
                name: deletingConnection?.name,
              })}
            </label>
            <Input
              value={deleteConfirmationInput}
              onChange={(e) => setDeleteConfirmationInput(e.target.value)}
              placeholder={t("sidebar.typeToConfirmPlaceholder", {
                name: deletingConnection?.name || "",
              })}
              className="h-9 border-zinc-200 bg-zinc-50/70 font-mono text-xs focus-visible:border-rose-500/50 focus-visible:ring-rose-500/30 dark:border-zinc-800 dark:bg-zinc-900/60"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && isDeleteConfirmed) {
                  e.preventDefault();
                  if (deletingConnection) {
                    onDeleteConnection(deletingConnection.id);
                    setDeletingConnection(null);
                    setDeleteConfirmationInput("");
                  }
                }
              }}
            />
          </div>

          <AlertDialogFooter className="-mx-4 -mb-4 flex items-center justify-end gap-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 pt-3 dark:border-zinc-800/80 dark:bg-zinc-900/30">
            <AlertDialogCancel
              onClick={() => {
                setDeletingConnection(null);
                setDeleteConfirmationInput("");
              }}
              className="cursor-pointer border-zinc-200 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t("rowModal.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!isDeleteConfirmed}
              onClick={() => {
                if (deletingConnection && isDeleteConfirmed) {
                  onDeleteConnection(deletingConnection.id);
                  setDeletingConnection(null);
                  setDeleteConfirmationInput("");
                }
              }}
              className={cn(
                "text-xs font-semibold shadow-xs transition-all",
                isDeleteConfirmed
                  ? "cursor-pointer bg-rose-600 text-white opacity-100 hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500"
                  : "pointer-events-none cursor-not-allowed border border-transparent bg-rose-600/30 text-white/40 shadow-none dark:bg-rose-600/20 dark:text-white/30",
              )}
            >
              {t("sidebar.deleteConnButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pin limit toast */}
      {pinToast && (
        <div
          role="status"
          aria-live="polite"
          className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-100 shadow-xl dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Pin className="size-3.5 shrink-0 rotate-45 fill-amber-500 text-amber-500" />
          <span>{pinToast}</span>
        </div>
      )}

      {/* Action Toast (copy, export, danger success) */}
      {actionToast && (
        <div
          role="status"
          aria-live="polite"
          className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-900 px-3 py-2 font-mono text-xs font-medium text-zinc-100 shadow-xl dark:border-zinc-300 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400 dark:text-emerald-600" />
          <span>{actionToast}</span>
        </div>
      )}

      {/* Table Context Menu */}
      {tableContextMenu && (
        <TableContextMenu
          tableName={tableContextMenu.tableName}
          x={tableContextMenu.x}
          y={tableContextMenu.y}
          isPinned={pinnedTableNames.includes(tableContextMenu.tableName)}
          onClose={() => setTableContextMenu(null)}
          onOpenTable={(openInNewTab) => {
            onSelectTable(tableContextMenu.tableName, openInNewTab);
          }}
          onViewSchema={() => {
            onSelectTable(tableContextMenu.tableName, false);
            window.dispatchEvent(
              new CustomEvent("pb:switch-subview", { detail: "schema" }),
            );
          }}
          onQuerySelectTop100={() => {
            const targetTable = tables.find(
              (t) => t.name === tableContextMenu.tableName,
            );
            if (targetTable) {
              const q = buildSelectQuery(
                targetTable,
                selectedConnection?.type,
                100,
              );
              onOpenQueryConsole?.(q, `${targetTable.name} (Top 100)`);
            }
          }}
          onQuerySelectCount={() => {
            const targetTable = tables.find(
              (t) => t.name === tableContextMenu.tableName,
            );
            if (targetTable) {
              const q = buildCountQuery(targetTable, selectedConnection?.type);
              onOpenQueryConsole?.(q, `${targetTable.name} (Count)`);
            }
          }}
          onQueryInsertTemplate={() => {
            const targetTable = tables.find(
              (t) => t.name === tableContextMenu.tableName,
            );
            if (targetTable) {
              const q = buildInsertTemplate(
                targetTable,
                selectedConnection?.type,
              );
              onOpenQueryConsole?.(q, `Insert ${targetTable.name}`);
            }
          }}
          onCopyTableName={() => {
            navigator.clipboard.writeText(tableContextMenu.tableName);
            setActionToast(`Copied "${tableContextMenu.tableName}"`);
          }}
          onCopySelectQuery={() => {
            const targetTable = tables.find(
              (t) => t.name === tableContextMenu.tableName,
            );
            if (targetTable) {
              const q = buildSelectQuery(
                targetTable,
                selectedConnection?.type,
                100,
              );
              navigator.clipboard.writeText(q);
              setActionToast(`Copied SELECT query`);
            }
          }}
          onExport={async (format) => {
            if (!selectedConnection) return;
            const tName = tableContextMenu.tableName;
            setActionToast(`Exporting ${tName} (${format.toUpperCase()})...`);
            try {
              const blob = await exportTableData(
                selectedConnection.id,
                tName,
                format,
              );
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${tName}_${Date.now()}.${format}`;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              setActionToast(`Exported ${tName}.${format}`);
            } catch (err: any) {
              console.error("Export error:", err);
              setActionToast(`Export failed: ${err.message || "error"}`);
            }
          }}
          onTogglePin={() => {
            handleTogglePin(tableContextMenu.tableName);
          }}
          onDangerAction={(type) => {
            setDangerModal({
              isOpen: true,
              actionType: type,
              tableName: tableContextMenu.tableName,
            });
          }}
        />
      )}

      {/* Table Danger Modal (Truncate / Drop) */}
      {dangerModal && (
        <TableDangerModal
          isOpen={dangerModal.isOpen}
          actionType={dangerModal.actionType}
          tableName={dangerModal.tableName}
          connection={selectedConnection}
          onClose={() => setDangerModal(null)}
          onSuccess={(msg) => {
            setActionToast(msg);
            onRefreshTables();
          }}
        />
      )}
    </SidebarPrimitive>
  );
}
