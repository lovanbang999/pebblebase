import { useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
  Database,
  Table as TableIcon,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  ChevronDown,
  HardDrive,
  Key,
  Layers,
  CheckCircle2,
  Sun,
  Moon,
  Copy,
} from "lucide-react";
import type { Connection, DatabaseType, TableSchema } from "../lib/types";
import packageJson from "../../package.json";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  onSelectTable: (tableName: string) => void;
  isLoadingTables: boolean;
  onRefreshTables: () => void;
}

const ENGINE_CONFIG: { type: DatabaseType; label: string; badge: string }[] = [
  {
    type: "postgres",
    label: "PostgreSQL",
    badge:
      "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20",
  },
  {
    type: "mysql",
    label: "MySQL",
    badge:
      "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  },
  {
    type: "mongodb",
    label: "MongoDB",
    badge:
      "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  },
];

const ENV_DOTS: Record<string, string> = {
  local: "bg-emerald-500 ring-emerald-500/20",
  development: "bg-amber-500 ring-amber-500/20",
  staging: "bg-orange-500 ring-orange-500/20",
  production: "bg-rose-500 ring-rose-500/20",
};

const ENV_STYLES: Record<
  string,
  { bg: string; text: string; dot: string; border: string }
> = {
  local: {
    bg: "bg-emerald-500/10 dark:bg-emerald-500/15",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
    border: "border-emerald-500/25",
  },
  development: {
    bg: "bg-sky-500/10 dark:bg-sky-500/15",
    text: "text-sky-700 dark:text-sky-400",
    dot: "bg-sky-500",
    border: "border-sky-500/25",
  },
  staging: {
    bg: "bg-amber-500/10 dark:bg-amber-500/15",
    text: "text-amber-700 dark:text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-500/25",
  },
  production: {
    bg: "bg-rose-500/10 dark:bg-rose-500/15",
    text: "text-rose-700 dark:text-rose-400",
    dot: "bg-rose-500",
    border: "border-rose-500/25",
  },
};

export const Sidebar: FC<SidebarProps> = ({
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
  onRefreshTables,
}) => {
  const { t } = useTranslation();
  const [tableSearch, setTableSearch] = useState("");
  const [deletingConnection, setDeletingConnection] =
    useState<Connection | null>(null);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState("");

  const isDeleteConfirmed = Boolean(
    deletingConnection &&
    deleteConfirmationInput.trim() === deletingConnection.name.trim(),
  );

  const filteredTables = tables.filter((t) =>
    t.name.toLowerCase().includes(tableSearch.toLowerCase()),
  );

  return (
    <SidebarPrimitive
      collapsible="icon"
      className="select-none transition-colors border-r border-sidebar-border bg-sidebar"
    >
      {/* Brand Header & Quick Actions */}
      <SidebarHeader className="p-2 gap-2 border-b border-sidebar-border">
        <div className="flex items-center justify-between h-9 px-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="size-7 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Database className="size-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="font-semibold text-xs tracking-wider uppercase text-zinc-900 dark:text-zinc-100 font-mono truncate group-data-[collapsible=icon]:hidden">
              Pebblebase
            </span>
          </div>

          <div className="flex items-center gap-0.5 group-data-[collapsible=icon]:hidden">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onOpenNewConnection}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <Plus className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">{t('sidebar.newConnection')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Active Connection Switcher */}
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    tooltip={
                      selectedConnection
                        ? `${selectedConnection.name} (${selectedConnection.db_name}) • [${(selectedConnection.environment || "local").toUpperCase()}]`
                        : t('sidebar.selectConnection')
                    }
                    className="w-full data-[state=open]:bg-sidebar-accent cursor-pointer group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                  >
                    <div className="size-7 rounded bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center shrink-0">
                      <HardDrive className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex flex-col gap-1 leading-none truncate flex-1 text-left group-data-[collapsible=icon]:hidden">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          {t("sidebar.activeDb")}
                        </span>
                        {selectedConnection &&
                          (() => {
                            const envKey =
                              selectedConnection.environment || "local";
                            const style =
                              ENV_STYLES[envKey] || ENV_STYLES.local;
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-full border text-[9px] font-mono font-semibold uppercase leading-none select-none shrink-0",
                                  style.bg,
                                  style.text,
                                  style.border,
                                )}
                              >
                                <span
                                  className={cn(
                                    "size-1.5 rounded-full shrink-0",
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
                      <span className="text-xs font-semibold truncate text-zinc-900 dark:text-zinc-100">
                        {selectedConnection
                          ? selectedConnection.name
                          : t('sidebar.selectConnection')}
                      </span>
                    </div>
                    <ChevronDown className="ml-auto size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden shrink-0" />
                  </SidebarMenuButton>
                }
              />
              <DropdownMenuContent
                className="w-76 sm:w-80 p-0 overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 rounded-xl bg-popover"
                align="start"
                side="bottom"
              >
                {/* Fixed Header (Never scrolls away) */}
                <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between bg-zinc-50/70 dark:bg-zinc-900/60">
                  <div className="flex items-center gap-1.5">
                    <Database className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
                      {t('sidebar.connectionsHeader')}
                    </span>
                    <Badge
                      variant="secondary"
                      className="text-[10px] px-1.5 py-0 h-4 font-mono font-medium"
                    >
                      {connections.length}
                    </Badge>
                  </div>
                  <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-mono">
                    {t('sidebar.groupedByEngine')}
                  </span>
                </div>

                {/* Scrollable Connection List */}
                <div className="max-h-60 overflow-y-auto px-1.5 py-1.5 custom-scrollbar">
                  {ENGINE_CONFIG.map(({ type, label, badge }) => {
                    const engineConns = connections.filter(
                      (c) => c.type === type,
                    );
                    if (engineConns.length === 0) return null;

                    return (
                      <div key={type} className="mb-2.5 last:mb-0.5">
                        <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground font-semibold flex items-center justify-between bg-zinc-100/50 dark:bg-zinc-900/40 rounded mb-1">
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[9px] px-1.5 py-0 h-4 font-mono",
                              badge,
                            )}
                          >
                            {label}
                          </Badge>
                          <span className="text-[10px] text-zinc-400 font-mono">
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
                              className={`flex items-center justify-between text-xs cursor-pointer py-1.5 px-2 my-0.5 rounded-md transition-colors ${
                                isCurrent
                                  ? "text-emerald-700 dark:text-emerald-300 font-medium bg-emerald-500/10 dark:bg-emerald-950/40 border border-emerald-500/30"
                                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                              }`}
                            >
                              <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                                {isCurrent ? (
                                  <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                ) : (
                                  <span
                                    className={cn(
                                      "size-2 rounded-full shrink-0 ring-1",
                                      dotColor,
                                    )}
                                    title={`Environment: ${env}`}
                                  />
                                )}
                                <div className="flex flex-col truncate min-w-0">
                                  <span className="truncate text-xs font-medium leading-tight text-zinc-900 dark:text-zinc-100">
                                    {c.name}
                                  </span>
                                  <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-mono truncate leading-tight mt-0.5">
                                    {c.db_name} • {c.host}:{c.port}
                                  </span>
                                </div>
                              </div>

                              <div
                                className="flex items-center gap-0.5 shrink-0 ml-2"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  title={t('sidebar.duplicateTooltip')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCloneConnection(c);
                                  }}
                                  className="text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 h-6 w-6 rounded hover:bg-zinc-200/70 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  <Copy className="size-3.5" />
                                </Button>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  title={t('sidebar.deleteConnTooltip')}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDeleteConfirmationInput("");
                                    setDeletingConnection(c);
                                  }}
                                  className="text-zinc-400 hover:text-rose-500 h-6 w-6 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
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
                <div className="p-1.5 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/60">
                  <DropdownMenuItem
                    onClick={onOpenNewConnection}
                    className="text-xs text-emerald-600 dark:text-emerald-400 font-medium cursor-pointer flex items-center justify-center gap-1.5 py-1.5 rounded-md hover:bg-emerald-500/10 dark:hover:bg-emerald-500/20 transition-colors"
                  >
                    <Plus className="size-3.5" />
                    {t('sidebar.newConnectionEllipsis')}
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Tables Explorer Content */}
      <SidebarContent className="gap-0">
        {/* Table Filter Input (Hidden when collapsed) */}
        <div className="p-2 border-b border-sidebar-border group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="size-3.5 text-zinc-400 absolute left-2 top-2 pointer-events-none" />
              <Input
                type="text"
                placeholder={t("sidebar.filterTables")}
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="pl-7 pr-2 h-7 text-xs font-mono"
              />
            </div>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onRefreshTables}
                    disabled={isLoadingTables || !selectedConnection}
                    className="text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 h-7 w-7 shrink-0"
                  >
                    <RefreshCw
                      className={cn(
                        "size-3.5",
                        isLoadingTables && "animate-spin",
                      )}
                    />
                  </Button>
                }
              />
              <TooltipContent side="right">{t('sidebar.refreshTablesTooltip')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Tables Group */}
        <SidebarGroup className="p-1.5 flex-1 overflow-y-auto">
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono px-2 mb-1 group-data-[collapsible=icon]:hidden">
            {t("sidebar.tablesHeader")}{" "}
            {tables.length > 0
              ? `(${filteredTables.length}/${tables.length})`
              : ""}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            {!selectedConnection ? (
              <div className="py-8 px-2 text-center group-data-[collapsible=icon]:hidden">
                <Database className="size-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  {t('sidebar.noActiveConn')}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-500 mt-1">
                  {t('sidebar.connectToIntrospect')}
                </p>
              </div>
            ) : isLoadingTables ? (
              <div className="p-1 space-y-1 animate-in fade-in duration-150">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-2 py-1.5 rounded bg-zinc-100/60 dark:bg-zinc-900/50 border border-zinc-200/60 dark:border-zinc-900 group-data-[collapsible=icon]:justify-center"
                  >
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-3.5 rounded" />
                      <Skeleton
                        className="h-3 rounded group-data-[collapsible=icon]:hidden"
                        style={{ width: `${65 + (i % 4) * 20}px` }}
                      />
                    </div>
                    <Skeleton className="h-3 w-4 rounded group-data-[collapsible=icon]:hidden" />
                  </div>
                ))}
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="py-8 px-2 text-center text-xs text-zinc-500 font-mono group-data-[collapsible=icon]:hidden">
                {tables.length === 0
                  ? t('sidebar.noUserTablesFound')
                  : t('sidebar.noTablesMatching', { term: tableSearch })}
              </div>
            ) : (
              <SidebarMenu>
                {filteredTables.map((tbl) => {
                  const isSelected = selectedTable === tbl.name;
                  const hasPk = tbl.columns.some((c) => c.is_primary_key);
                  const hasFk = tbl.columns.some((c) => c.is_foreign_key);

                  const colCount = tbl.columns.length;

                  return (
                    <SidebarMenuItem key={tbl.name}>
                      <SidebarMenuButton
                        isActive={isSelected}
                        onClick={() => onSelectTable(tbl.name)}
                        tooltip={`${tbl.name} (${colCount} cols)`}
                        className={cn(
                          "font-mono text-xs cursor-pointer h-7 px-2 transition-colors",
                          isSelected
                            ? "bg-emerald-500/10 text-emerald-900 dark:text-emerald-200 font-semibold border border-emerald-500/30"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100",
                        )}
                      >
                        <TableIcon
                          className={cn(
                            "size-3.5 shrink-0",
                            isSelected
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-zinc-400 dark:text-zinc-500",
                          )}
                        />
                        <span className="truncate group-data-[collapsible=icon]:hidden">
                          {tbl.name}
                        </span>

                        <div className="ml-auto flex items-center gap-1 shrink-0 group-data-[collapsible=icon]:hidden">
                          {hasPk && (
                            <span title={t('sidebar.primaryKeyTooltip')}>
                              <Key className="size-2.5 text-amber-500 dark:text-amber-400/80" />
                            </span>
                          )}
                          {hasFk && (
                            <span title={t('sidebar.foreignRelationsTooltip')}>
                              <Layers className="size-2.5 text-sky-500 dark:text-sky-400/80" />
                            </span>
                          )}
                          <Badge
                            variant={isSelected ? "default" : "secondary"}
                            className={cn(
                              "h-4 min-w-4 p-0 text-[10px] font-mono font-medium tabular-nums leading-none rounded-full inline-flex items-center justify-center text-center gap-0 shrink-0 select-none",
                              colCount > 9 ? "px-1.5 min-w-5" : "px-0",
                            )}
                          >
                            <span className="inline-block translate-y-px leading-none">
                              {colCount}
                            </span>
                          </Badge>
                        </div>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer & Collapsed Shortcuts */}
      <SidebarFooter className="border-t border-sidebar-border p-0 h-11 px-3 flex flex-col justify-center group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:p-2 group-data-[collapsible=icon]:px-1">
        {/* In collapsed icon mode: quick language, theme and new conn stacked vertically */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col items-center justify-center gap-1.5 w-full">
          <LanguageSwitcher compact />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onToggleTheme}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  {theme === "dark" ? (
                    <Sun className="size-3.5 text-amber-400" />
                  ) : (
                    <Moon className="size-3.5 text-indigo-600" />
                  )}
                </Button>
              }
            />
            <TooltipContent side="right">
              {theme === "dark"
                ? t("common.themeLight")
                : t("common.themeDark")}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={onOpenNewConnection}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                >
                  <Plus className="size-3.5" />
                </Button>
              }
            />
            <TooltipContent side="right">{t('sidebar.newConnection')}</TooltipContent>
          </Tooltip>
        </div>

        {/* In expanded mode: clean brand label + language & theme toggles on the right */}
        <div className="group-data-[collapsible=icon]:hidden text-[11px] text-zinc-500 dark:text-zinc-400 font-mono flex items-center justify-between w-full">
          <div className="flex items-center gap-1.5 truncate">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">
              Pebblebase
            </span>
            <span className="text-[10px] text-zinc-400 font-normal">
              v{packageJson.version}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <LanguageSwitcher />
            <span className="h-3.5 w-px bg-zinc-200 dark:bg-zinc-800 shrink-0 self-center" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onToggleTheme}
                    className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    {theme === "dark" ? (
                      <Sun className="size-3.5 text-amber-400" />
                    ) : (
                      <Moon className="size-3.5 text-indigo-600" />
                    )}
                  </Button>
                }
              />
              <TooltipContent side="top">
                {theme === "dark"
                  ? t("common.themeLight")
                  : t("common.themeDark")}
              </TooltipContent>
            </Tooltip>
          </div>
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
        <AlertDialogContent className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 rounded-xl">
              <Trash2 className="size-5" />
            </AlertDialogMedia>
            <AlertDialogTitle className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {t('sidebar.removeConnTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {t('sidebar.removeConnDesc', { name: deletingConnection?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Sensitive confirmation input */}
          <div className="space-y-2 py-1">
            <label className="text-xs text-zinc-600 dark:text-zinc-400 font-medium block">
              {t('sidebar.removeConnConfirmHelp', { name: deletingConnection?.name })}
            </label>
            <Input
              value={deleteConfirmationInput}
              onChange={(e) => setDeleteConfirmationInput(e.target.value)}
              placeholder={t('sidebar.typeToConfirmPlaceholder', { name: deletingConnection?.name || "" })}
              className="h-9 text-xs font-mono bg-zinc-50/70 dark:bg-zinc-900/60 border-zinc-200 dark:border-zinc-800 focus-visible:ring-rose-500/30 focus-visible:border-rose-500/50"
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

          <AlertDialogFooter className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 -mx-4 -mb-4 px-4 py-3 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-end gap-2">
            <AlertDialogCancel
              onClick={() => {
                setDeletingConnection(null);
                setDeleteConfirmationInput("");
              }}
              className="text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border-zinc-200 dark:border-zinc-800 cursor-pointer"
            >
              {t('rowModal.cancel')}
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
                  ? "bg-rose-600 hover:bg-rose-500 dark:bg-rose-600 dark:hover:bg-rose-500 text-white cursor-pointer opacity-100"
                  : "bg-rose-600/30 dark:bg-rose-600/20 text-white/40 dark:text-white/30 cursor-not-allowed pointer-events-none border border-transparent shadow-none",
              )}
            >
              {t('sidebar.deleteConnButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarPrimitive>
  );
};
