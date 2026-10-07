import { useState, useEffect, useMemo, useCallback, type FC } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import {
  GitCompare,
  ArrowLeftRight,
  RefreshCw,
  Copy,
  Check,
  Terminal,
  Search,
  CheckCircle2,
  AlertTriangle,
  PlusCircle,
  MinusCircle,
  Code2,
  Table as TableIcon,
  Key,
  Layers,
} from "lucide-react";
import type { Connection, SchemaDiffResult, DiffStatus } from "@/lib/types";
import { fetchSchemaDiff } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "cn";

interface SchemaDiffProps {
  connections: Connection[];
  activeConnectionId?: string | null;
  onOpenQueryConsole?: (query?: string, title?: string) => void;
}

export const SchemaDiff: FC<SchemaDiffProps> = ({
  connections,
  activeConnectionId,
  onOpenQueryConsole,
}) => {
  const { t } = useTranslation();

  // Relational connections only (ignore MongoDB)
  const relationalConnections = useMemo(() => {
    return connections.filter((c) => c.type !== "mongodb");
  }, [connections]);

  const [fromId, setFromId] = useState<string>(() => {
    if (
      activeConnectionId &&
      relationalConnections.some((c) => c.id === activeConnectionId)
    ) {
      return activeConnectionId;
    }
    return relationalConnections[0]?.id || "";
  });

  const [toId, setToId] = useState<string>(() => {
    const others = relationalConnections.filter((c) => c.id !== fromId);
    return others[0]?.id || "";
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffResult, setDiffResult] = useState<SchemaDiffResult | null>(null);

  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "diffs" | DiffStatus
  >("all");

  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Sync default connections when relationalConnections loads or changes
  useEffect(() => {
    if (!fromId && relationalConnections.length > 0) {
      setFromId(relationalConnections[0].id);
    }
    if (!toId && relationalConnections.length > 1) {
      const other = relationalConnections.find(
        (c) => c.id !== (fromId || relationalConnections[0]?.id),
      );
      if (other) setToId(other.id);
    }
  }, [relationalConnections, fromId, toId]);

  const runCompare = useCallback(async () => {
    if (!fromId || !toId) {
      setError(t("diff.same_connection"));
      return;
    }
    if (fromId === toId) {
      setError(t("diff.same_connection"));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchSchemaDiff(fromId, toId);
      setDiffResult(res);
      if (res.tables && res.tables.length > 0) {
        // Select first table that has differences or first table
        const firstDiffTable =
          res.tables.find((tbl) => tbl.status !== "unchanged") || res.tables[0];
        setSelectedTable(firstDiffTable.name);
      } else {
        setSelectedTable(null);
      }
    } catch (err: any) {
      setError(err?.message || t("diff.failed_compare"));
    } finally {
      setIsLoading(false);
    }
  }, [fromId, toId, t]);

  // Initial compare on mount if two connections are available
  useEffect(() => {
    if (fromId && toId && fromId !== toId) {
      runCompare();
    }
  }, [fromId, toId, runCompare]);

  const handleSwap = () => {
    const prevFrom = fromId;
    setFromId(toId);
    setToId(prevFrom);
  };

  // Filter tables in navigator
  const filteredTables = useMemo(() => {
    if (!diffResult || !diffResult.tables) return [];
    return diffResult.tables.filter((tbl) => {
      if (tableSearch) {
        if (!tbl.name.toLowerCase().includes(tableSearch.toLowerCase())) {
          return false;
        }
      }
      if (statusFilter === "diffs") {
        return tbl.status !== "unchanged";
      }
      if (statusFilter !== "all") {
        return tbl.status === statusFilter;
      }
      return true;
    });
  }, [diffResult, tableSearch, statusFilter]);

  const currentTableDiff = useMemo(() => {
    if (!diffResult || !diffResult.tables || !selectedTable) return null;
    return diffResult.tables.find((t) => t.name === selectedTable) || null;
  }, [diffResult, selectedTable]);

  const handleCopySQL = useCallback(() => {
    if (!diffResult?.migration_sql) return;
    navigator.clipboard.writeText(diffResult.migration_sql);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [diffResult]);

  const handleRunInConsole = useCallback(() => {
    if (!diffResult?.migration_sql || !onOpenQueryConsole) return;
    const title = `Migrate: ${diffResult.from_connection.name} -> ${diffResult.to_connection.name}`;
    onOpenQueryConsole(diffResult.migration_sql, title);
    setIsMigrationModalOpen(false);
  }, [diffResult, onOpenQueryConsole]);

  const codemirrorExtensions = useMemo(() => {
    const engine = diffResult?.to_connection.engine?.toLowerCase();
    let sqlExt;
    if (engine === "postgres" || engine === "postgresql") {
      sqlExt = sql({ dialect: PostgreSQL });
    } else if (engine === "mysql") {
      sqlExt = sql({ dialect: MySQL });
    } else {
      sqlExt = sql({ dialect: SQLite });
    }
    return [sqlExt];
  }, [diffResult?.to_connection.engine]);

  const isDark = document.documentElement.classList.contains("dark");

  const fromConnObj = relationalConnections.find((c) => c.id === fromId);
  const toConnObj = relationalConnections.find((c) => c.id === toId);

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Top Controls Bar */}
      <div className="shrink-0 border-b border-zinc-200 bg-zinc-50 p-3 lg:px-4 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Connection Selectors */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Source Connection */}
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                {t("diff.source")}:
              </span>
              <Select
                value={fromId}
                onValueChange={(val) => {
                  if (typeof val === "string") setFromId(val);
                }}
              >
                <SelectTrigger className="h-7 min-w-44 cursor-pointer border-zinc-200 bg-white font-mono text-xs text-zinc-800 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  <SelectValue placeholder={t("diff.source")} />
                </SelectTrigger>
                <SelectContent side="bottom" align="start">
                  {relationalConnections.map((c) => (
                    <SelectItem
                      key={`from-${c.id}`}
                      value={c.id}
                      className="font-mono text-xs"
                    >
                      {c.name} ({c.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleSwap}
                    aria-label={t("diff.swap")}
                    className="size-7 shrink-0 cursor-pointer rounded-full p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
                  >
                    <ArrowLeftRight className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">{t("diff.swap")}</TooltipContent>
            </Tooltip>

            {/* Target Connection */}
            <div className="flex items-center gap-1.5">
              <span className="shrink-0 font-mono text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                {t("diff.target")}:
              </span>
              <Select
                value={toId}
                onValueChange={(val) => {
                  if (typeof val === "string") setToId(val);
                }}
              >
                <SelectTrigger className="h-7 min-w-44 cursor-pointer border-zinc-200 bg-white font-mono text-xs text-zinc-800 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  <SelectValue placeholder={t("diff.target")} />
                </SelectTrigger>
                <SelectContent side="bottom" align="start">
                  {relationalConnections.map((c) => (
                    <SelectItem
                      key={`to-${c.id}`}
                      value={c.id}
                      className="font-mono text-xs"
                    >
                      {c.name} ({c.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={runCompare}
              disabled={isLoading || !fromId || !toId || fromId === toId}
              className="h-7 cursor-pointer gap-1.5 bg-emerald-600 px-3 text-xs font-medium text-white shadow-2xs transition-colors hover:bg-emerald-500 disabled:opacity-50 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-500"
            >
              <RefreshCw
                className={cn("size-3.5", isLoading && "animate-spin")}
              />
              {isLoading ? t("diff.comparing") : t("diff.compare")}
            </Button>
          </div>

          {/* Action: Generate Migration SQL */}
          <div className="flex items-center gap-2">
            {diffResult && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsMigrationModalOpen(true)}
                className="h-7 gap-1.5 border-indigo-200 bg-indigo-50/50 text-xs font-medium text-indigo-700 shadow-sm hover:bg-indigo-100 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300 dark:hover:bg-indigo-950/80"
              >
                <Code2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                {t("diff.generate_migration")}
              </Button>
            )}
          </div>
        </div>

        {/* Summary Metrics Bar */}
        {diffResult && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-zinc-200/60 pt-2.5 text-xs dark:border-zinc-800/60">
            <span className="mr-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
              {t("diff.title")}:
            </span>
            <Badge
              variant="outline"
              className={cn(
                "gap-1 px-2 py-0.5 font-mono text-[11px]",
                diffResult.summary.tables_added > 0
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500",
              )}
            >
              <PlusCircle className="h-3 w-3" />
              {diffResult.summary.tables_added} {t("diff.added").toLowerCase()}
            </Badge>

            <Badge
              variant="outline"
              className={cn(
                "gap-1 px-2 py-0.5 font-mono text-[11px]",
                diffResult.summary.tables_modified > 0
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500",
              )}
            >
              <AlertTriangle className="h-3 w-3" />
              {diffResult.summary.tables_modified}{" "}
              {t("diff.modified").toLowerCase()}
            </Badge>

            <Badge
              variant="outline"
              className={cn(
                "gap-1 px-2 py-0.5 font-mono text-[11px]",
                diffResult.summary.tables_removed > 0
                  ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-400"
                  : "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500",
              )}
            >
              <MinusCircle className="h-3 w-3" />
              {diffResult.summary.tables_removed}{" "}
              {t("diff.removed").toLowerCase()}
            </Badge>

            <span className="ml-auto font-mono text-[10px] text-zinc-400 dark:text-zinc-400">
              {t("diff.column_changes", {
                count:
                  diffResult.summary.columns_added +
                  diffResult.summary.columns_modified +
                  diffResult.summary.columns_removed,
              })}
              {", "}
              {t("diff.index_changes", {
                count:
                  diffResult.summary.indexes_added +
                  diffResult.summary.indexes_modified +
                  diffResult.summary.indexes_removed,
              })}
            </span>
          </div>
        )}
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 border-b border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Diff Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Tables Navigator */}
        <div className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-950/50">
          <div className="flex flex-col gap-2 border-b border-zinc-200 p-2 dark:border-zinc-800">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                type="text"
                placeholder={t("diff.search_tables")}
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="h-7 border-zinc-200 bg-white pr-2 pl-8 text-xs dark:border-zinc-800 dark:bg-zinc-900"
              />
            </div>

            {/* Filter Tabs */}
            <Tabs
              value={statusFilter}
              onValueChange={(val) => {
                if (val === "all" || val === "diffs") {
                  setStatusFilter(val);
                }
              }}
              className="w-full"
            >
              <TabsList className="grid h-7 w-full grid-cols-2 rounded-md border border-zinc-200 bg-zinc-200/60 p-0.5 font-mono text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
                <TabsTrigger
                  value="all"
                  className="h-6 cursor-pointer font-mono text-[11px] transition-all data-active:bg-white data-active:text-zinc-900 data-active:shadow-2xs dark:data-active:bg-zinc-800 dark:data-active:text-zinc-100"
                >
                  {t("diff.filter_all")}
                </TabsTrigger>
                <TabsTrigger
                  value="diffs"
                  className="h-6 cursor-pointer font-mono text-[11px] transition-all data-active:bg-white data-active:text-zinc-900 data-active:shadow-2xs dark:data-active:bg-zinc-800 dark:data-active:text-zinc-100"
                >
                  {t("diff.filter_diff")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Tables List */}
          <div className="flex-1 divide-y divide-zinc-100 overflow-y-auto p-1 dark:divide-zinc-900/60">
            {isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 rounded-md bg-zinc-100/50 p-2 dark:bg-zinc-900/50"
                  >
                    <Skeleton className="size-3.5 rounded" />
                    <Skeleton className="h-3.5 flex-1 rounded" />
                    <Skeleton className="h-4 w-12 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="p-6 text-center font-mono text-xs text-zinc-400 dark:text-zinc-500">
                {diffResult
                  ? t("diff.no_tables_match")
                  : t("diff.no_schema_loaded")}
              </div>
            ) : (
              filteredTables.map((tbl) => {
                const isSelected = tbl.name === selectedTable;
                return (
                  <button
                    key={tbl.name}
                    type="button"
                    onClick={() => setSelectedTable(tbl.name)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md p-2.5 text-left font-mono text-xs transition-all",
                      isSelected
                        ? "border border-zinc-200 bg-white font-semibold text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
                        : "text-zinc-700 hover:bg-zinc-100/70 dark:text-zinc-300 dark:hover:bg-zinc-900/50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <TableIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span className="truncate">{tbl.name}</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {tbl.status === "added" && (
                        <Badge
                          variant="outline"
                          className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1 py-0 text-[9px] text-emerald-600 dark:text-emerald-400"
                        >
                          + {t("diff.added")}
                        </Badge>
                      )}
                      {tbl.status === "removed" && (
                        <Badge
                          variant="outline"
                          className="h-4 border-rose-500/30 bg-rose-500/10 px-1 py-0 text-[9px] text-rose-600 dark:text-rose-400"
                        >
                          - {t("diff.removed")}
                        </Badge>
                      )}
                      {tbl.status === "modified" && (
                        <Badge
                          variant="outline"
                          className="h-4 border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-600 dark:text-amber-400"
                        >
                          ~ {t("diff.modified")}
                        </Badge>
                      )}
                      {tbl.status === "unchanged" && (
                        <span className="text-[10px] font-normal text-zinc-400">
                          {t("diff.unchanged")}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side: Side-by-side Table Columns Diff */}
        <div className="flex flex-1 flex-col overflow-y-auto bg-white dark:bg-zinc-950">
          {isLoading ? (
            <div className="space-y-6 p-6">
              <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-5 rounded" />
                  <Skeleton className="h-5 w-40 rounded" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-32 rounded" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-28 rounded" />
                <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="grid grid-cols-2 gap-4 bg-zinc-100 p-3 dark:bg-zinc-900">
                    <Skeleton className="h-4 w-36 rounded" />
                    <Skeleton className="h-4 w-36 rounded" />
                  </div>
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-2 gap-4 border-b border-zinc-100 py-2 dark:border-zinc-900"
                      >
                        <Skeleton className="h-4 w-44 rounded" />
                        <Skeleton className="h-4 w-44 rounded" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : !diffResult ? (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center text-zinc-500 select-none dark:text-zinc-400">
              <GitCompare className="mb-3 size-12 stroke-1 text-zinc-400 dark:text-zinc-500" />
              <h3 className="mb-1 font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t("diff.title")}
              </h3>
              <p className="max-w-sm font-mono text-xs">{t("diff.subtitle")}</p>
            </div>
          ) : diffResult.summary.tables_added === 0 &&
            diffResult.summary.tables_removed === 0 &&
            diffResult.summary.tables_modified === 0 ? (
            /* No Differences State */
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-400">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t("diff.no_differences")}
              </h3>
              <p className="mt-1 max-w-md font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {t("diff.all_synced_desc", {
                  source: diffResult.from_connection.name,
                  target: diffResult.to_connection.name,
                })}
              </p>
            </div>
          ) : !currentTableDiff ? (
            <div className="flex flex-1 items-center justify-center p-8 font-mono text-xs text-zinc-400">
              {t("diff.select_table_to_view")}
            </div>
          ) : (
            <div className="space-y-6 p-4 lg:p-6">
              {/* Table Header */}
              <div className="flex items-center justify-between gap-4 border-b border-zinc-200 pb-3 dark:border-zinc-800">
                <div className="flex items-center gap-2 font-mono">
                  <TableIcon className="h-5 w-5 shrink-0 text-zinc-500" />
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {currentTableDiff.name}
                  </h2>
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-2 py-0.5 text-xs",
                      currentTableDiff.status === "added" &&
                        "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                      currentTableDiff.status === "removed" &&
                        "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
                      currentTableDiff.status === "modified" &&
                        "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      currentTableDiff.status === "unchanged" &&
                        "border-zinc-500/30 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
                    )}
                  >
                    {t(`diff.${currentTableDiff.status}`).toUpperCase()}
                  </Badge>
                </div>

                <div className="font-mono text-xs text-zinc-400">
                  {t("diff.columns_count", {
                    count: currentTableDiff.columns?.length || 0,
                  })}{" "}
                  ·{" "}
                  {t("diff.indexes_count", {
                    count: currentTableDiff.indexes?.length || 0,
                  })}
                </div>
              </div>

              {/* Columns Diff Grid */}
              <div className="space-y-2">
                <h3 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
                  <Layers className="h-3.5 w-3.5 text-zinc-500" />
                  {t("diff.columns")}
                </h3>

                <div className="overflow-x-auto rounded-lg border border-zinc-200 shadow-sm dark:border-zinc-800">
                  <div className="min-w-125">
                    {/* Grid Headers */}
                    <div className="grid grid-cols-2 divide-x divide-zinc-200 bg-zinc-100 px-3 py-2 font-mono text-xs font-semibold text-zinc-700 dark:divide-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                      <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {t("diff.source")}:{" "}
                        {fromConnObj?.name || t("diff.source")}
                      </div>
                      <div className="flex items-center gap-1.5 pl-3 text-indigo-700 dark:text-indigo-400">
                        <span className="h-2 w-2 rounded-full bg-indigo-500" />
                        {t("diff.target")}:{" "}
                        {toConnObj?.name || t("diff.target")}
                      </div>
                    </div>

                    {/* Column Rows */}
                    <div className="divide-y divide-zinc-100 font-mono text-xs dark:divide-zinc-800/60">
                      {currentTableDiff.columns?.map((col) => {
                        const isAdded = col.status === "added";
                        const isRemoved = col.status === "removed";
                        const isModified = col.status === "modified";

                        return (
                          <div
                            key={col.name}
                            className={cn(
                              "grid grid-cols-2 divide-x divide-zinc-200 transition-colors dark:divide-zinc-800/80",
                              isAdded &&
                                "bg-emerald-50/40 dark:bg-emerald-950/20",
                              isRemoved && "bg-rose-50/40 dark:bg-rose-950/20",
                              isModified &&
                                "bg-amber-50/40 dark:bg-amber-950/20",
                            )}
                          >
                            {/* Left Column (Source) */}
                            <div className="p-3">
                              {col.from_column ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    {isAdded && (
                                      <PlusCircle className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                                    )}
                                    {isModified && (
                                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                                    )}
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                      {col.from_column.name}
                                    </span>
                                    {col.from_column.is_primary_key && (
                                      <Badge
                                        variant="outline"
                                        className="h-4 border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-600"
                                      >
                                        <Key className="mr-0.5 h-2.5 w-2.5" />{" "}
                                        PK
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                                      {col.from_column.type}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      {col.from_column.nullable
                                        ? "NULL"
                                        : "NOT NULL"}
                                    </span>
                                    {col.from_column.default_value && (
                                      <>
                                        <span>·</span>
                                        <span className="text-zinc-400">
                                          DEFAULT{" "}
                                          {col.from_column.default_value}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded border border-dashed border-zinc-200 px-2 py-1 text-center text-[11px] text-zinc-400 italic dark:border-zinc-800 dark:text-zinc-600">
                                  {t("diff.not_in_source")}
                                </div>
                              )}
                            </div>

                            {/* Right Column (Target) */}
                            <div className="p-3 pl-4">
                              {col.to_column ? (
                                <div className="space-y-1">
                                  <div className="flex items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-1.5">
                                      {isRemoved && (
                                        <MinusCircle className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
                                      )}
                                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                        {col.to_column.name}
                                      </span>
                                      {col.to_column.is_primary_key && (
                                        <Badge
                                          variant="outline"
                                          className="h-4 border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-600"
                                        >
                                          <Key className="mr-0.5 h-2.5 w-2.5" />{" "}
                                          PK
                                        </Badge>
                                      )}
                                    </div>

                                    {isModified && (
                                      <div className="flex flex-wrap gap-1">
                                        {col.changes?.map(
                                          (chg: string, idx: number) => (
                                            <Badge
                                              key={idx}
                                              variant="outline"
                                              className="h-4 border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-700 dark:text-amber-300"
                                            >
                                              {chg}
                                            </Badge>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                    <span className="font-medium text-indigo-600 dark:text-indigo-400">
                                      {col.to_column.type}
                                    </span>
                                    <span>·</span>
                                    <span>
                                      {col.to_column.nullable
                                        ? "NULL"
                                        : "NOT NULL"}
                                    </span>
                                    {col.to_column.default_value && (
                                      <>
                                        <span>·</span>
                                        <span className="text-zinc-400">
                                          DEFAULT {col.to_column.default_value}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="rounded border border-dashed border-zinc-200 px-2 py-1 text-center text-[11px] text-zinc-400 italic dark:border-zinc-800 dark:text-zinc-600">
                                  {t("diff.not_in_target")}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Indexes Diff Section */}
              {currentTableDiff.indexes &&
                currentTableDiff.indexes.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
                      <Key className="h-3.5 w-3.5 text-zinc-500" />
                      {t("diff.indexes")}
                    </h3>

                    <div className="divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 font-mono text-xs dark:divide-zinc-800/60 dark:border-zinc-800">
                      {currentTableDiff.indexes.map((idx) => {
                        const isAdded = idx.status === "added";
                        const isRemoved = idx.status === "removed";
                        const isModified = idx.status === "modified";

                        const cols =
                          idx.from_index?.columns?.join(", ") ||
                          idx.to_index?.columns?.join(", ") ||
                          "";

                        return (
                          <div
                            key={idx.name}
                            className={cn(
                              "flex items-center justify-between gap-3 p-3",
                              isAdded &&
                                "bg-emerald-50/40 dark:bg-emerald-950/20",
                              isRemoved && "bg-rose-50/40 dark:bg-rose-950/20",
                              isModified &&
                                "bg-amber-50/40 dark:bg-amber-950/20",
                            )}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                  {idx.name}
                                </span>
                                {(idx.from_index?.unique ||
                                  idx.to_index?.unique) && (
                                  <Badge
                                    variant="outline"
                                    className="h-4 border-indigo-500/30 bg-indigo-500/10 px-1 py-0 text-[9px] text-indigo-600"
                                  >
                                    UNIQUE
                                  </Badge>
                                )}
                              </div>
                              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                {t("diff.columns")}: ({cols})
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {idx.changes?.map((c: string, i: number) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="h-4 border-amber-500/40 bg-amber-500/10 px-1 py-0 text-[9px] text-amber-700 dark:text-amber-300"
                                >
                                  {c}
                                </Badge>
                              ))}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-4 px-1.5 py-0 text-[9px] uppercase",
                                  isAdded &&
                                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                  isRemoved &&
                                    "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
                                  isModified &&
                                    "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                                  idx.status === "unchanged" && "text-zinc-400",
                                )}
                              >
                                {t(`diff.${idx.status}`)}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* Migration SQL Preview Modal */}
      <Dialog
        open={isMigrationModalOpen}
        onOpenChange={setIsMigrationModalOpen}
      >
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden border-zinc-200 bg-white p-0 shadow-2xl sm:max-w-3xl dark:border-zinc-800 dark:bg-zinc-950">
          <DialogHeader className="flex flex-row items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <Code2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                {t("diff.migration_preview")}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("diff.migration_warning")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* CodeMirror SQL Editor */}
          <div className="min-h-75 flex-1 overflow-auto bg-zinc-900 p-4">
            <CodeMirror
              value={diffResult?.migration_sql || ""}
              height="350px"
              theme={isDark ? "dark" : "light"}
              extensions={codemirrorExtensions}
              editable={false}
              className="overflow-hidden rounded border border-zinc-800 font-mono text-xs"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="flex items-center justify-between border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <div className="font-mono text-xs text-zinc-500">
              {t("diff.target_engine")}:{" "}
              <span className="font-semibold uppercase">
                {diffResult?.to_connection.engine}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopySQL}
                className="gap-1.5 font-mono text-xs"
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {t("diff.copied")}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{t("diff.copy_sql")}</span>
                  </>
                )}
              </Button>

              {onOpenQueryConsole && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRunInConsole}
                  className="gap-1.5 bg-indigo-600 text-xs font-medium text-white shadow-sm hover:bg-indigo-500"
                >
                  <Terminal className="h-3.5 w-3.5" />
                  <span>{t("diff.run_in_console")}</span>
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
