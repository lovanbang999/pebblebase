import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type FC,
} from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { studioEditorTheme } from "@/lib/editorTheme";
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
  sourceConnectionId?: string;
  targetConnectionId?: string;
  onConnectionPairChange?: (
    sourceConnectionId: string,
    targetConnectionId: string,
  ) => void;
  onOpenQueryConsole?: (query?: string, title?: string) => void;
  onError?: (err: string | null) => void;
}

export const SchemaDiff: FC<SchemaDiffProps> = ({
  connections,
  activeConnectionId,
  sourceConnectionId,
  targetConnectionId,
  onConnectionPairChange,
  onOpenQueryConsole,
  onError,
}) => {
  const { t } = useTranslation();

  // Relational connections only (ignore MongoDB)
  const relationalConnections = useMemo(() => {
    return connections.filter(
      (c) => c.type !== "mongodb" && c.type !== "redis",
    );
  }, [connections]);

  const [localFromId, setLocalFromId] = useState<string>(() => {
    if (sourceConnectionId) return sourceConnectionId;
    if (
      activeConnectionId &&
      relationalConnections.some((c) => c.id === activeConnectionId)
    ) {
      return activeConnectionId;
    }
    return relationalConnections[0]?.id || "";
  });

  const [localToId, setLocalToId] = useState<string>(() => {
    if (targetConnectionId) return targetConnectionId;
    const others = relationalConnections.filter((c) => c.id !== localFromId);
    return others[0]?.id || "";
  });
  const fromId = sourceConnectionId ?? localFromId;
  const toId = targetConnectionId ?? localToId;
  const pairChangeRef = useRef(onConnectionPairChange);
  const errorHandlerRef = useRef(onError);
  const compareControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    pairChangeRef.current = onConnectionPairChange;
  }, [onConnectionPairChange]);
  useEffect(() => {
    errorHandlerRef.current = onError;
  }, [onError]);

  const setFromId = useCallback(
    (next: string) => {
      setLocalFromId(next);
      pairChangeRef.current?.(next, toId);
    },
    [toId],
  );
  const setToId = useCallback(
    (next: string) => {
      setLocalToId(next);
      pairChangeRef.current?.(fromId, next);
    },
    [fromId],
  );

  const [isLoading, setIsLoading] = useState(false);
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
      errorHandlerRef.current?.(t("diff.same_connection"));
      return;
    }
    if (fromId === toId) {
      errorHandlerRef.current?.(t("diff.same_connection"));
      return;
    }

    compareControllerRef.current?.abort();
    const controller = new AbortController();
    compareControllerRef.current = controller;
    setIsLoading(true);
    setDiffResult(null);
    errorHandlerRef.current?.(null);

    try {
      const res = await fetchSchemaDiff(fromId, toId, controller.signal);
      if (controller.signal.aborted) return;
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
      if (!controller.signal.aborted)
        errorHandlerRef.current?.(err?.message || t("diff.failed_compare"));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [fromId, toId, t]);

  useEffect(() => () => compareControllerRef.current?.abort(), []);

  // Initial compare on mount if two connections are available
  useEffect(() => {
    if (fromId && toId && fromId !== toId) {
      runCompare();
    }
  }, [fromId, toId, runCompare]);

  const handleSwap = () => {
    const prevFrom = fromId;
    setLocalFromId(toId);
    setLocalToId(prevFrom);
    pairChangeRef.current?.(toId, prevFrom);
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
    <div className="bg-background flex h-full flex-1 flex-col overflow-hidden">
      {/* Top Controls Bar */}
      <div className="border-border bg-card dark:border-border dark:bg-card/60 shrink-0 border-b p-3 lg:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Connection Selectors */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Source Connection */}
            <div className="flex items-center gap-1.5">
              <span className="text-success dark:text-success shrink-0 font-mono text-[11px] font-semibold">
                {t("diff.source")}:
              </span>
              <Select
                value={fromId}
                onValueChange={(val) => {
                  if (typeof val === "string") setFromId(val);
                }}
              >
                <SelectTrigger className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground h-7 min-w-44 cursor-pointer font-mono text-xs shadow-2xs">
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
                    className="text-muted-foreground hover:text-foreground dark:hover:text-foreground size-7 shrink-0 cursor-pointer rounded-full p-0"
                  >
                    <ArrowLeftRight className="size-3.5" />
                  </Button>
                }
              />
              <TooltipContent side="bottom">{t("diff.swap")}</TooltipContent>
            </Tooltip>

            {/* Target Connection */}
            <div className="flex items-center gap-1.5">
              <span className="text-primary dark:text-primary shrink-0 font-mono text-[11px] font-semibold">
                {t("diff.target")}:
              </span>
              <Select
                value={toId}
                onValueChange={(val) => {
                  if (typeof val === "string") setToId(val);
                }}
              >
                <SelectTrigger className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground h-7 min-w-44 cursor-pointer font-mono text-xs shadow-2xs">
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
              className="bg-primary hover:bg-primary/90 dark:bg-primary dark:hover:bg-primary/90 h-7 cursor-pointer gap-1.5 px-3 text-xs font-medium text-white shadow-2xs transition-colors disabled:opacity-50 dark:text-white"
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
                className="border-primary/30 bg-primary/50 text-primary hover:bg-primary/10 dark:border-primary/60 dark:bg-primary/40 dark:text-primary dark:hover:bg-primary/80 h-7 gap-1.5 text-xs font-medium shadow-sm"
              >
                <Code2 className="text-primary dark:text-primary h-3.5 w-3.5" />
                {t("diff.generate_migration")}
              </Button>
            )}
          </div>
        </div>

        {/* Summary Metrics Bar */}
        {diffResult && (
          <div className="border-border/60 dark:border-border/60 mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2.5 text-xs">
            <span className="text-muted-foreground mr-1 font-mono text-[11px]">
              {t("diff.title")}:
            </span>
            <Badge
              variant="outline"
              className={cn(
                "gap-1 px-2 py-0.5 font-mono text-[11px]",
                diffResult.summary.tables_added > 0
                  ? "border-success/30 bg-success/10 text-success dark:border-success/60 dark:bg-success/40 dark:text-success"
                  : "border-border bg-card text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground",
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
                  ? "border-warning/30 bg-warning/10 text-warning dark:border-warning/60 dark:bg-warning/40 dark:text-warning"
                  : "border-border bg-card text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground",
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
                  ? "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/60 dark:bg-destructive/40 dark:text-destructive"
                  : "border-border bg-card text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground",
              )}
            >
              <MinusCircle className="h-3 w-3" />
              {diffResult.summary.tables_removed}{" "}
              {t("diff.removed").toLowerCase()}
            </Badge>

            <span className="text-muted-foreground dark:text-muted-foreground ml-auto font-mono text-[10px]">
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

      {/* Main Diff Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left Side: Tables Navigator */}
        <div className="border-border bg-card/50 dark:border-border dark:bg-background/50 flex max-h-48 w-full shrink-0 flex-col border-b md:max-h-none md:w-64 md:border-r md:border-b-0">
          <div className="border-border dark:border-border flex flex-col gap-2 border-b p-2">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
              <Input
                type="text"
                placeholder={t("diff.search_tables")}
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="border-border bg-background dark:border-border dark:bg-card h-7 pr-2 pl-8 text-xs"
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
              <TabsList className="border-border bg-muted/60 dark:border-border dark:bg-card grid h-7 w-full grid-cols-2 rounded-md border p-0.5 font-mono text-[11px]">
                <TabsTrigger
                  value="all"
                  className="data-active:bg-background data-active:text-foreground dark:data-active:bg-muted dark:data-active:text-foreground h-6 cursor-pointer font-mono text-[11px] transition-all data-active:shadow-2xs"
                >
                  {t("diff.filter_all")}
                </TabsTrigger>
                <TabsTrigger
                  value="diffs"
                  className="data-active:bg-background data-active:text-foreground dark:data-active:bg-muted dark:data-active:text-foreground h-6 cursor-pointer font-mono text-[11px] transition-all data-active:shadow-2xs"
                >
                  {t("diff.filter_diff")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Tables List */}
          <div className="divide-border dark:divide-border/60 flex-1 divide-y overflow-y-auto p-1">
            {isLoading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 7 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-muted/50 dark:bg-card/50 flex items-center gap-2 rounded-md p-2"
                  >
                    <Skeleton className="size-3.5 rounded" />
                    <Skeleton className="h-3.5 flex-1 rounded" />
                    <Skeleton className="h-4 w-12 rounded" />
                  </div>
                ))}
              </div>
            ) : filteredTables.length === 0 ? (
              <div className="text-muted-foreground p-6 text-center font-mono text-xs">
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
                        ? "border-border bg-background text-foreground dark:border-border dark:bg-card border font-semibold shadow-sm dark:text-white"
                        : "text-foreground hover:bg-muted/70 dark:text-foreground dark:hover:bg-muted/50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <TableIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{tbl.name}</span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {tbl.status === "added" && (
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-success/10 text-success dark:text-success h-4 px-1 py-0 text-[9px]"
                        >
                          + {t("diff.added")}
                        </Badge>
                      )}
                      {tbl.status === "removed" && (
                        <Badge
                          variant="outline"
                          className="border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive h-4 px-1 py-0 text-[9px]"
                        >
                          - {t("diff.removed")}
                        </Badge>
                      )}
                      {tbl.status === "modified" && (
                        <Badge
                          variant="outline"
                          className="border-warning/30 bg-warning/10 text-warning dark:text-warning h-4 px-1 py-0 text-[9px]"
                        >
                          ~ {t("diff.modified")}
                        </Badge>
                      )}
                      {tbl.status === "unchanged" && (
                        <span className="text-muted-foreground text-[10px] font-normal">
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
        <div className="bg-background flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          {isLoading ? (
            <div className="space-y-6 p-6">
              <div className="border-border dark:border-border flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-5 rounded" />
                  <Skeleton className="h-5 w-40 rounded" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-32 rounded" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-4 w-28 rounded" />
                <div className="border-border overflow-hidden rounded-lg border">
                  <div className="bg-muted dark:bg-card grid grid-cols-2 gap-4 p-3">
                    <Skeleton className="h-4 w-36 rounded" />
                    <Skeleton className="h-4 w-36 rounded" />
                  </div>
                  <div className="space-y-3 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="border-border dark:border-border grid grid-cols-2 gap-4 border-b py-2"
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
            <div className="text-muted-foreground dark:text-muted-foreground flex flex-1 flex-col items-center justify-center p-8 text-center select-none">
              <GitCompare className="text-muted-foreground mb-3 size-12 stroke-1" />
              <h3 className="text-foreground mb-1 font-mono text-sm font-semibold">
                {t("diff.title")}
              </h3>
              <p className="max-w-sm font-mono text-xs">{t("diff.subtitle")}</p>
            </div>
          ) : diffResult.summary.tables_added === 0 &&
            diffResult.summary.tables_removed === 0 &&
            diffResult.summary.tables_modified === 0 ? (
            /* No Differences State */
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <div className="border-success/30 bg-success/10 text-success dark:border-success/60 dark:bg-success/50 dark:text-success mb-3 flex h-12 w-12 items-center justify-center rounded-full border shadow-sm">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h3 className="text-foreground mb-1 text-sm font-semibold">
                {t("diff.no_differences")}
              </h3>
              <p className="text-muted-foreground mt-1 max-w-md font-mono text-xs">
                {t("diff.all_synced_desc", {
                  source: diffResult.from_connection.name,
                  target: diffResult.to_connection.name,
                })}
              </p>
            </div>
          ) : !currentTableDiff ? (
            <div className="text-muted-foreground flex flex-1 items-center justify-center p-8 font-mono text-xs">
              {t("diff.select_table_to_view")}
            </div>
          ) : (
            <div className="space-y-6 p-4 lg:p-6">
              {/* Table Header */}
              <div className="border-border dark:border-border flex items-center justify-between gap-4 border-b pb-3">
                <div className="flex items-center gap-2 font-mono">
                  <TableIcon className="text-muted-foreground h-5 w-5 shrink-0" />
                  <h2 className="text-foreground text-base font-bold">
                    {currentTableDiff.name}
                  </h2>
                  <Badge
                    variant="outline"
                    className={cn(
                      "px-2 py-0.5 text-xs",
                      currentTableDiff.status === "added" &&
                        "border-primary/30 bg-success/10 text-success dark:text-success",
                      currentTableDiff.status === "removed" &&
                        "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive",
                      currentTableDiff.status === "modified" &&
                        "border-warning/30 bg-warning/10 text-warning dark:text-warning",
                      currentTableDiff.status === "unchanged" &&
                        "border-border bg-muted/50 text-muted-foreground dark:text-muted-foreground",
                    )}
                  >
                    {t(`diff.${currentTableDiff.status}`).toUpperCase()}
                  </Badge>
                </div>

                <div className="text-muted-foreground font-mono text-xs">
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
                <h3 className="text-foreground dark:text-foreground flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider uppercase">
                  <Layers className="text-muted-foreground h-3.5 w-3.5" />
                  {t("diff.columns")}
                </h3>

                <div className="border-border dark:border-border overflow-x-auto rounded-lg border shadow-sm">
                  <div className="min-w-125">
                    {/* Grid Headers */}
                    <div className="divide-border bg-muted text-foreground dark:divide-border dark:bg-card dark:text-foreground grid grid-cols-2 divide-x px-3 py-2 font-mono text-xs font-semibold">
                      <div className="text-success dark:text-success flex items-center gap-1.5">
                        <span className="bg-success h-2 w-2 rounded-full" />
                        {t("diff.source")}:{" "}
                        {fromConnObj?.name || t("diff.source")}
                      </div>
                      <div className="text-primary dark:text-primary flex items-center gap-1.5 pl-3">
                        <span className="bg-primary h-2 w-2 rounded-full" />
                        {t("diff.target")}:{" "}
                        {toConnObj?.name || t("diff.target")}
                      </div>
                    </div>

                    {/* Column Rows */}
                    <div className="divide-border dark:divide-border/60 divide-y font-mono text-xs">
                      {currentTableDiff.columns?.map((col) => {
                        const isAdded = col.status === "added";
                        const isRemoved = col.status === "removed";
                        const isModified = col.status === "modified";

                        return (
                          <div
                            key={col.name}
                            className={cn(
                              "divide-border dark:divide-border/80 grid grid-cols-2 divide-x transition-colors",
                              isAdded && "bg-success/40 dark:bg-success/20",
                              isRemoved &&
                                "bg-destructive/40 dark:bg-destructive/20",
                              isModified && "bg-warning/40 dark:bg-warning/20",
                            )}
                          >
                            {/* Left Column (Source) */}
                            <div className="p-3">
                              {col.from_column ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5">
                                    {isAdded && (
                                      <PlusCircle className="text-success dark:text-success h-3.5 w-3.5 shrink-0" />
                                    )}
                                    {isModified && (
                                      <AlertTriangle className="text-warning dark:text-warning h-3.5 w-3.5 shrink-0" />
                                    )}
                                    <span className="text-foreground font-semibold">
                                      {col.from_column.name}
                                    </span>
                                    {col.from_column.is_primary_key && (
                                      <Badge
                                        variant="outline"
                                        className="border-warning/30 bg-warning/10 text-warning h-4 px-1 py-0 text-[9px]"
                                      >
                                        <Key className="mr-0.5 h-2.5 w-2.5" />{" "}
                                        PK
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
                                    <span className="text-primary dark:text-primary font-medium">
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
                                        <span className="text-muted-foreground">
                                          DEFAULT{" "}
                                          {col.from_column.default_value}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="border-border text-muted-foreground dark:border-border dark:text-muted-foreground rounded border border-dashed px-2 py-1 text-center text-[11px] italic">
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
                                        <MinusCircle className="text-destructive dark:text-destructive h-3.5 w-3.5 shrink-0" />
                                      )}
                                      <span className="text-foreground font-semibold">
                                        {col.to_column.name}
                                      </span>
                                      {col.to_column.is_primary_key && (
                                        <Badge
                                          variant="outline"
                                          className="border-warning/30 bg-warning/10 text-warning h-4 px-1 py-0 text-[9px]"
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
                                              className="border-warning/40 bg-warning/10 text-warning dark:text-warning h-4 px-1 py-0 text-[9px]"
                                            >
                                              {chg}
                                            </Badge>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <div className="text-muted-foreground flex items-center gap-2 text-[11px]">
                                    <span className="text-primary dark:text-primary font-medium">
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
                                        <span className="text-muted-foreground">
                                          DEFAULT {col.to_column.default_value}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              ) : (
                                <div className="border-border text-muted-foreground dark:border-border dark:text-muted-foreground rounded border border-dashed px-2 py-1 text-center text-[11px] italic">
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
                    <h3 className="text-foreground dark:text-foreground flex items-center gap-1.5 font-mono text-xs font-semibold tracking-wider uppercase">
                      <Key className="text-muted-foreground h-3.5 w-3.5" />
                      {t("diff.indexes")}
                    </h3>

                    <div className="divide-border border-border dark:divide-border/60 dark:border-border divide-y overflow-hidden rounded-lg border font-mono text-xs">
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
                              isAdded && "bg-success/40 dark:bg-success/20",
                              isRemoved &&
                                "bg-destructive/40 dark:bg-destructive/20",
                              isModified && "bg-warning/40 dark:bg-warning/20",
                            )}
                          >
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-foreground font-semibold">
                                  {idx.name}
                                </span>
                                {(idx.from_index?.unique ||
                                  idx.to_index?.unique) && (
                                  <Badge
                                    variant="outline"
                                    className="border-primary/30 bg-primary/10 text-primary h-4 px-1 py-0 text-[9px]"
                                  >
                                    UNIQUE
                                  </Badge>
                                )}
                              </div>
                              <div className="text-muted-foreground text-[11px]">
                                {t("diff.columns")}: ({cols})
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {idx.changes?.map((c: string, i: number) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="border-warning/40 bg-warning/10 text-warning dark:text-warning h-4 px-1 py-0 text-[9px]"
                                >
                                  {c}
                                </Badge>
                              ))}
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-4 px-1.5 py-0 text-[9px] uppercase",
                                  isAdded &&
                                    "border-primary/30 bg-success/10 text-success dark:text-success",
                                  isRemoved &&
                                    "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive",
                                  isModified &&
                                    "border-warning/30 bg-warning/10 text-warning dark:text-warning",
                                  idx.status === "unchanged" &&
                                    "text-muted-foreground",
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
        <DialogContent className="border-border bg-background dark:border-border dark:bg-background flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 shadow-2xl sm:max-w-3xl">
          <DialogHeader className="border-border dark:border-border flex flex-row items-center justify-between border-b p-4">
            <div className="space-y-1">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <Code2 className="text-primary dark:text-primary h-4 w-4" />
                {t("diff.migration_preview")}
              </DialogTitle>
              <DialogDescription className="text-muted-foreground text-xs">
                {t("diff.migration_warning")}
              </DialogDescription>
            </div>
          </DialogHeader>

          {/* CodeMirror SQL Editor */}
          <div className="bg-code min-h-75 flex-1 overflow-auto p-4">
            <CodeMirror
              value={diffResult?.migration_sql || ""}
              height="350px"
              theme={isDark ? "dark" : "light"}
              extensions={[...codemirrorExtensions, studioEditorTheme]}
              editable={false}
              className="border-code-border overflow-hidden rounded border font-mono text-xs"
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="border-border bg-card dark:border-border dark:bg-card/50 flex items-center justify-between border-t p-3">
            <div className="text-muted-foreground font-mono text-xs">
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
                    <Check className="text-success h-3.5 w-3.5" />
                    <span className="text-success dark:text-success">
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
                  className="bg-primary hover:bg-primary gap-1.5 text-xs font-medium text-white shadow-sm"
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
