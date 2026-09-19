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
    if (fromId && toId && fromId !== toId && !diffResult && !isLoading) {
      runCompare();
    }
  }, [fromId, toId, diffResult, isLoading, runCompare]);

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
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Top Controls Bar */}
      <div className="shrink-0 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-3 lg:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Connection Selectors */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1 shadow-sm">
              <span className="font-semibold text-emerald-600 dark:text-emerald-400 font-mono text-[11px] shrink-0">
                {t("diff.source")}:
              </span>
              <select
                className="bg-transparent text-zinc-800 dark:text-zinc-200 font-medium focus:outline-none cursor-pointer text-xs"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
              >
                {relationalConnections.map((c) => (
                  <option
                    key={`from-${c.id}`}
                    value={c.id}
                    className="dark:bg-zinc-900"
                  >
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleSwap}
              title={t("diff.swap")}
              className="h-7 w-7 p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 rounded-full"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </Button>

            <div className="flex items-center gap-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md px-2 py-1 shadow-sm">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400 font-mono text-[11px] shrink-0">
                {t("diff.target")}:
              </span>
              <select
                className="bg-transparent text-zinc-800 dark:text-zinc-200 font-medium focus:outline-none cursor-pointer text-xs"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
              >
                {relationalConnections.map((c) => (
                  <option
                    key={`to-${c.id}`}
                    value={c.id}
                    className="dark:bg-zinc-900"
                  >
                    {c.name} ({c.type})
                  </option>
                ))}
              </select>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={runCompare}
              disabled={isLoading || !fromId || !toId || fromId === toId}
              className="h-7 px-3 text-xs bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 gap-1.5 shadow-sm font-medium"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
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
                className="h-7 text-xs border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/80 gap-1.5 font-medium shadow-sm"
              >
                <Code2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                {t("diff.generate_migration")}
              </Button>
            )}
          </div>
        </div>

        {/* Summary Metrics Bar */}
        {diffResult && (
          <div className="flex flex-wrap items-center gap-2 mt-2.5 pt-2.5 border-t border-zinc-200/60 dark:border-zinc-800/60 text-xs">
            <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px] mr-1">
              {t("diff.title")}:
            </span>
            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[11px] gap-1 px-2 py-0.5",
                diffResult.summary.tables_added > 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800/60"
                  : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800",
              )}
            >
              <PlusCircle className="w-3 h-3" />
              {diffResult.summary.tables_added} {t("diff.added").toLowerCase()}
            </Badge>

            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[11px] gap-1 px-2 py-0.5",
                diffResult.summary.tables_modified > 0
                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800/60"
                  : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800",
              )}
            >
              <AlertTriangle className="w-3 h-3" />
              {diffResult.summary.tables_modified}{" "}
              {t("diff.modified").toLowerCase()}
            </Badge>

            <Badge
              variant="outline"
              className={cn(
                "font-mono text-[11px] gap-1 px-2 py-0.5",
                diffResult.summary.tables_removed > 0
                  ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800/60"
                  : "bg-zinc-50 text-zinc-500 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-500 dark:border-zinc-800",
              )}
            >
              <MinusCircle className="w-3 h-3" />
              {diffResult.summary.tables_removed}{" "}
              {t("diff.removed").toLowerCase()}
            </Badge>

            <span className="text-zinc-400 dark:text-zinc-600 font-mono text-[10px] ml-auto">
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
        <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border-b border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Diff Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Tables Navigator */}
        <div className="w-72 shrink-0 border-r border-zinc-200 dark:border-zinc-800 flex flex-col bg-zinc-50/50 dark:bg-zinc-950/50">
          <div className="p-2 border-b border-zinc-200 dark:border-zinc-800 flex flex-col gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <Input
                type="text"
                placeholder={t("diff.search_tables")}
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="h-7 pl-8 pr-2 text-xs bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={cn(
                  "px-2 py-0.5 rounded cursor-pointer transition-colors",
                  statusFilter === "all"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
                )}
              >
                {t("diff.filter_all")}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("diffs")}
                className={cn(
                  "px-2 py-0.5 rounded cursor-pointer transition-colors",
                  statusFilter === "diffs"
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
                )}
              >
                {t("diff.filter_diff")}
              </button>
            </div>
          </div>

          {/* Tables List */}
          <div className="flex-1 overflow-y-auto p-1 divide-y divide-zinc-100 dark:divide-zinc-900/60">
            {filteredTables.length === 0 ? (
              <div className="p-6 text-center text-xs text-zinc-400 dark:text-zinc-500 font-mono">
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
                      "w-full text-left p-2.5 rounded-md flex items-center justify-between gap-2 transition-all cursor-pointer font-mono text-xs",
                      isSelected
                        ? "bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-800 font-semibold text-zinc-950 dark:text-white"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100/70 dark:hover:bg-zinc-900/50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <TableIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{tbl.name}</span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      {tbl.status === "added" && (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[9px] px-1 py-0 h-4"
                        >
                          + {t("diff.added")}
                        </Badge>
                      )}
                      {tbl.status === "removed" && (
                        <Badge
                          variant="outline"
                          className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30 text-[9px] px-1 py-0 h-4"
                        >
                          - {t("diff.removed")}
                        </Badge>
                      )}
                      {tbl.status === "modified" && (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[9px] px-1 py-0 h-4"
                        >
                          ~ {t("diff.modified")}
                        </Badge>
                      )}
                      {tbl.status === "unchanged" && (
                        <span className="text-[10px] text-zinc-400 font-normal">
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
        <div className="flex-1 overflow-y-auto flex flex-col bg-white dark:bg-zinc-950">
          {!diffResult ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400 dark:text-zinc-600">
              <GitCompare className="w-12 h-12 stroke-1 mb-3 text-zinc-300 dark:text-zinc-700" />
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                {t("diff.title")}
              </h3>
              <p className="text-xs max-w-sm">{t("diff.subtitle")}</p>
            </div>
          ) : diffResult.summary.tables_added === 0 &&
            diffResult.summary.tables_removed === 0 &&
            diffResult.summary.tables_modified === 0 ? (
            /* No Differences State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-3 shadow-sm">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1">
                {t("diff.no_differences")}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md font-mono mt-1">
                {t("diff.all_synced_desc", {
                  source: diffResult.from_connection.name,
                  target: diffResult.to_connection.name,
                })}
              </p>
            </div>
          ) : !currentTableDiff ? (
            <div className="flex-1 flex items-center justify-center p-8 text-xs text-zinc-400 font-mono">
              {t("diff.select_table_to_view")}
            </div>
          ) : (
            <div className="p-4 lg:p-6 space-y-6">
              {/* Table Header */}
              <div className="flex items-center justify-between gap-4 pb-3 border-b border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-2 font-mono">
                  <TableIcon className="w-5 h-5 text-zinc-500 shrink-0" />
                  <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                    {currentTableDiff.name}
                  </h2>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs px-2 py-0.5",
                      currentTableDiff.status === "added" &&
                        "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                      currentTableDiff.status === "removed" &&
                        "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
                      currentTableDiff.status === "modified" &&
                        "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
                      currentTableDiff.status === "unchanged" &&
                        "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
                    )}
                  >
                    {t(`diff.${currentTableDiff.status}`).toUpperCase()}
                  </Badge>
                </div>

                <div className="text-xs text-zinc-400 font-mono">
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
                <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-zinc-500" />
                  {t("diff.columns")}
                </h3>

                <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden shadow-sm">
                  {/* Grid Headers */}
                  <div className="grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800 bg-zinc-100 dark:bg-zinc-900 text-xs font-mono font-semibold py-2 px-3 text-zinc-700 dark:text-zinc-300">
                    <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      {t("diff.source")}: {fromConnObj?.name || t("diff.source")}
                    </div>
                    <div className="pl-3 flex items-center gap-1.5 text-indigo-700 dark:text-indigo-400">
                      <span className="w-2 h-2 rounded-full bg-indigo-500" />
                      {t("diff.target")}: {toConnObj?.name || t("diff.target")}
                    </div>
                  </div>

                  {/* Column Rows */}
                  <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-xs">
                    {currentTableDiff.columns?.map((col) => {
                      const isAdded = col.status === "added";
                      const isRemoved = col.status === "removed";
                      const isModified = col.status === "modified";

                      return (
                        <div
                          key={col.name}
                          className={cn(
                            "grid grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800/80 transition-colors",
                            isAdded &&
                              "bg-emerald-50/40 dark:bg-emerald-950/20",
                            isRemoved && "bg-rose-50/40 dark:bg-rose-950/20",
                            isModified && "bg-amber-50/40 dark:bg-amber-950/20",
                          )}
                        >
                          {/* Left Column (Source) */}
                          <div className="p-3">
                            {col.from_column ? (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  {isAdded && (
                                    <PlusCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  )}
                                  {isModified && (
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  )}
                                  <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                    {col.from_column.name}
                                  </span>
                                  {col.from_column.is_primary_key && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-500/30"
                                    >
                                      <Key className="w-2.5 h-2.5 mr-0.5" /> PK
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
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
                                        DEFAULT {col.from_column.default_value}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="text-zinc-400 dark:text-zinc-600 italic text-[11px] py-1 border border-dashed border-zinc-200 dark:border-zinc-800 rounded px-2 text-center">
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
                                      <MinusCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                                    )}
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                      {col.to_column.name}
                                    </span>
                                    {col.to_column.is_primary_key && (
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-600 border-amber-500/30"
                                      >
                                        <Key className="w-2.5 h-2.5 mr-0.5" />{" "}
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
                                            className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                          >
                                            {chg}
                                          </Badge>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                  <span className="text-indigo-600 dark:text-indigo-400 font-medium">
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
                              <div className="text-zinc-400 dark:text-zinc-600 italic text-[11px] py-1 border border-dashed border-zinc-200 dark:border-zinc-800 rounded px-2 text-center">
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

              {/* Indexes Diff Section */}
              {currentTableDiff.indexes &&
                currentTableDiff.indexes.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 font-mono uppercase tracking-wider flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-zinc-500" />
                      {t("diff.indexes")}
                    </h3>

                    <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800/60 font-mono text-xs">
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
                              "p-3 flex items-center justify-between gap-3",
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
                                    className="text-[9px] px-1 py-0 h-4 bg-indigo-500/10 text-indigo-600 border-indigo-500/30"
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
                                  className="text-[9px] px-1 py-0 h-4 bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                >
                                  {c}
                                </Badge>
                              ))}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[9px] px-1.5 py-0 h-4 uppercase",
                                  isAdded &&
                                    "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
                                  isRemoved &&
                                    "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
                                  isModified &&
                                    "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
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
        <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0 overflow-hidden bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-2xl">
          <DialogHeader className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex flex-row items-center justify-between">
            <div className="space-y-1">
              <DialogTitle className="text-base font-semibold flex items-center gap-2">
                <Code2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                {t("diff.migration_preview")}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("diff.migration_warning")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* CodeMirror SQL Editor */}
          <div className="flex-1 overflow-auto p-4 bg-zinc-900 min-h-75">
            <CodeMirror
              value={diffResult?.migration_sql || ""}
              height="350px"
              theme={isDark ? "dark" : "light"}
              extensions={codemirrorExtensions}
              editable={false}
              className="text-xs font-mono rounded overflow-hidden border border-zinc-800"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex items-center justify-between">
            <div className="text-xs text-zinc-500 font-mono">
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
                className="gap-1.5 text-xs font-mono"
              >
                {isCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {t("diff.copied")}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t("diff.copy_sql")}</span>
                  </>
                )}
              </Button>

              {onOpenQueryConsole && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRunInConsole}
                  className="gap-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
                >
                  <Terminal className="w-3.5 h-3.5" />
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
