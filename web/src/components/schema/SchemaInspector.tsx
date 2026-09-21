import { useState, useMemo, type FC } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import { json } from "@codemirror/lang-json";
import {
  Key,
  Copy,
  Check,
  RefreshCw,
  Database,
  Layers,
  FileCode,
  ShieldAlert,
  ArrowRight,
  Rocket,
  Sparkles,
} from "lucide-react";
import type { TableSchema } from "@/lib/types";
import { fetchTableDDL } from "@/lib/api";
import { MigrationRunner } from "@/components/migration/MigrationRunner";
import { SeedModal } from "@/components/modals/SeedModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { cn } from "cn";

interface SchemaInspectorProps {
  connId?: string;
  table: TableSchema;
  isReadOnly?: boolean;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: unknown,
  ) => void;
  onOpenQueryConsole?: (query?: string, title?: string) => void;
}

export const SchemaInspector: FC<SchemaInspectorProps> = ({
  connId,
  table,
  isReadOnly = false,
  onNavigateRelation,
  onOpenQueryConsole,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"schema" | "migration">(
    "schema",
  );

  // Fetch DDL and index data
  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: ["table-ddl", connId, table.name],
    queryFn: () => fetchTableDDL(connId!, table.name),
    enabled: Boolean(connId && table.name),
  });

  const isDark = document.documentElement.classList.contains("dark");

  const extensions = useMemo(() => {
    if (data?.engine === "mongodb") {
      return [json()];
    }
    const dialect =
      data?.engine === "mysql"
        ? MySQL
        : data?.engine === "sqlite"
          ? SQLite
          : PostgreSQL;
    return [sql({ dialect })];
  }, [data?.engine]);

  const handleCopy = () => {
    if (!data?.ddl) return;
    navigator.clipboard.writeText(data.ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getEngineBadge = (engine?: string) => {
    switch (engine) {
      case "postgres":
        return (
          <Badge
            variant="outline"
            className="border-indigo-500/20 bg-indigo-500/10 font-mono text-[11px] text-indigo-700 dark:text-indigo-400"
          >
            PostgreSQL
          </Badge>
        );
      case "mysql":
        return (
          <Badge
            variant="outline"
            className="border-amber-500/20 bg-amber-500/10 font-mono text-[11px] text-amber-700 dark:text-amber-400"
          >
            MySQL
          </Badge>
        );
      case "mongodb":
        return (
          <Badge
            variant="outline"
            className="border-emerald-500/20 bg-emerald-500/10 font-mono text-[11px] text-emerald-700 dark:text-emerald-400"
          >
            MongoDB
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="border-sky-500/20 bg-sky-500/10 font-mono text-[11px] text-sky-700 dark:text-sky-400"
          >
            SQLite
          </Badge>
        );
    }
  };

  const getTypeBadgeClass = (colType: string) => {
    switch (colType) {
      case "int":
      case "float":
        return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800";
      case "bool":
        return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800";
      case "datetime":
        return "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800";
      case "json":
        return "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 border-pink-200 dark:border-pink-800";
      default:
        return "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";
    }
  };

  return (
    <div className="flex-1 space-y-6 overflow-auto bg-zinc-50/50 p-4 font-sans text-zinc-900 md:p-6 dark:bg-zinc-950 dark:text-zinc-100">
      {/* Overview Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-mono text-base font-bold tracking-tight">
                {table.name}
              </h2>
              {getEngineBadge(data?.engine)}
            </div>
            <p className="mt-0.5 font-mono text-xs text-zinc-500 dark:text-zinc-400">
              {t("schema.columnsCount", { count: table.columns.length })}
              {data?.indexes && data.indexes.length > 0 && (
                <span>
                  {" "}
                  • {t("schema.indexesCount", { count: data.indexes.length })}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Sub-view Switcher */}
        <div className="flex items-center rounded-lg border border-zinc-300/40 bg-zinc-200/60 p-0.5 dark:border-zinc-700/40 dark:bg-zinc-800/60">
          <button
            type="button"
            onClick={() => setActiveSubTab("schema")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-all",
              activeSubTab === "schema"
                ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            )}
          >
            <FileCode className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>{t("migration.tabSchema")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("migration")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-all",
              activeSubTab === "migration"
                ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
            )}
          >
            <Rocket className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t("migration.tabMigration")}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeSubTab === "schema" && (
            <>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => refetch()}
                      disabled={isLoading || isRefetching}
                      className="h-8 gap-1.5 px-2.5 font-mono text-xs"
                    >
                      <RefreshCw
                        className={cn(
                          "h-3.5 w-3.5",
                          (isLoading || isRefetching) && "animate-spin",
                        )}
                      />
                      <span>Refresh</span>
                    </Button>
                  }
                />
                <TooltipContent side="bottom">Refresh DDL</TooltipContent>
              </Tooltip>

              {data?.engine !== "mongodb" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsSeedModalOpen(true)}
                  className="h-8 cursor-pointer gap-1.5 border-emerald-500/30 px-2.5 font-mono text-xs text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                >
                  <Sparkles className="h-3.5 w-3.5 text-emerald-500" />
                  <span>{t("seed.title")}</span>
                </Button>
              )}

              <Button
                type="button"
                size="sm"
                onClick={handleCopy}
                disabled={!data?.ddl}
                className={cn(
                  "h-8 gap-1.5 px-3 font-mono text-xs font-semibold shadow-xs transition-all",
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-600 text-white hover:bg-emerald-500",
                )}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{t("schema.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{t("schema.copyDdl")}</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {activeSubTab === "migration" ? (
        <MigrationRunner
          connId={connId}
          table={table}
          engine={data?.engine}
          isReadOnly={isReadOnly}
        />
      ) : (
        <>
          {error ? (
            <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-4 font-mono text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>
                {t("schema.failedDdl", {
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                })}
              </span>
            </div>
          ) : null}

          {/* Section 1: Column Specifications */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h3 className="font-mono text-xs font-semibold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
                {t("schema.columnsTitle")}
              </h3>
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/50">
              <Table>
                <TableHeader className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 text-center font-mono text-xs">
                      #
                    </TableHead>
                    <TableHead className="font-mono text-xs">
                      {t("schema.colName")}
                    </TableHead>
                    <TableHead className="font-mono text-xs">
                      {t("schema.colType")}
                    </TableHead>
                    <TableHead className="font-mono text-xs">
                      {t("schema.colPk")}
                    </TableHead>
                    <TableHead className="font-mono text-xs">
                      {t("schema.colNullable")}
                    </TableHead>
                    <TableHead className="font-mono text-xs">
                      {t("schema.colDefault")}
                    </TableHead>
                    <TableHead className="font-mono text-xs">
                      {t("schema.colRelations")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.columns.map((col, idx) => {
                    const relation = table.relations?.find(
                      (r) => r.from_column === col.name,
                    );

                    return (
                      <TableRow
                        key={col.name}
                        className="border-b border-zinc-100 font-mono text-xs hover:bg-zinc-50/60 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                      >
                        <TableCell className="text-center text-zinc-400">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="font-semibold text-zinc-900 dark:text-zinc-100">
                          <div className="flex items-center gap-1.5">
                            {col.is_primary_key && (
                              <Key className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            )}
                            <span>{col.name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              "px-2 py-0.5 font-mono text-[11px] font-normal",
                              getTypeBadgeClass(col.type),
                            )}
                          >
                            {col.type}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {col.is_primary_key ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-700 uppercase dark:text-amber-400"
                            >
                              {t("schema.primary")}
                            </Badge>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {col.nullable ? (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              {t("schema.yes")}
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                              {t("schema.no")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {col.default_value ? (
                            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {col.default_value}
                            </code>
                          ) : (
                            <span className="text-[11px] text-zinc-400">
                              {t("schema.none")}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {relation ? (
                            <button
                              type="button"
                              onClick={() =>
                                onNavigateRelation?.(
                                  relation.to_table,
                                  relation.to_column,
                                  "",
                                )
                              }
                              className="inline-flex cursor-pointer items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] text-indigo-700 hover:underline dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300"
                            >
                              <span>{relation.to_table}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span>{relation.to_column}</span>
                            </button>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Section 2: Database Indexes */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <h3 className="font-mono text-xs font-semibold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
                {t("schema.indexesTitle")}
              </h3>
            </div>

            {isLoading ? (
              <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            ) : !data?.indexes || data.indexes.length === 0 ? (
              <div className="rounded-lg border border-zinc-200 bg-white p-4 text-center font-mono text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400">
                {t("schema.noIndexes")}
              </div>
            ) : (
              <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/50">
                <Table>
                  <TableHeader className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="font-mono text-xs">
                        {t("schema.idxName")}
                      </TableHead>
                      <TableHead className="font-mono text-xs">
                        {t("schema.idxType")}
                      </TableHead>
                      <TableHead className="font-mono text-xs">
                        {t("schema.idxCols")}
                      </TableHead>
                      <TableHead className="font-mono text-xs">
                        {t("schema.idxUnique")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.indexes.map((idx) => (
                      <TableRow
                        key={idx.name}
                        className="border-b border-zinc-100 font-mono text-xs hover:bg-zinc-50/60 dark:border-zinc-800/60 dark:hover:bg-zinc-800/40"
                      >
                        <TableCell className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {idx.name}
                        </TableCell>
                        <TableCell>
                          {idx.primary ? (
                            <Badge
                              variant="outline"
                              className="border-amber-500/30 bg-amber-500/10 text-[10px] font-bold text-amber-700 uppercase dark:text-amber-400"
                            >
                              {t("schema.primary")}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-zinc-300 bg-zinc-100 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400"
                            >
                              {t("schema.secondary")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {idx.columns.map((c) => (
                              <Badge
                                key={c}
                                variant="secondary"
                                className="px-1.5 py-0 font-mono text-[11px] font-normal"
                              >
                                {c}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          {idx.unique ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-700 uppercase dark:text-emerald-400"
                            >
                              {t("schema.unique")}
                            </Badge>
                          ) : (
                            <span className="text-zinc-400">
                              {t("schema.no")}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Section 3: Table Creation DDL Script */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                <h3 className="font-mono text-xs font-semibold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
                  {t("schema.ddlTitle")}
                </h3>
              </div>

              {data?.ddl && (
                <span className="font-mono text-[11px] text-zinc-400">
                  {data.ddl.split("\n").length} lines
                </span>
              )}
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {/* Editor Header Bar */}
              <div className="flex h-9 items-center justify-between border-b border-zinc-200 bg-zinc-100/70 px-3 dark:border-zinc-800 dark:bg-zinc-800/60">
                <span className="font-mono text-xs font-medium text-zinc-600 uppercase dark:text-zinc-400">
                  {data?.engine === "mongodb" ? "JSON Definition" : "SQL DDL"}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!data?.ddl}
                  className="h-6 gap-1 px-2 font-mono text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {t("schema.copied")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>{t("schema.copyDdl")}</span>
                    </>
                  )}
                </Button>
              </div>

              {/* Code Container */}
              {isLoading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-4 w-1/3" />
                </div>
              ) : (
                <CodeMirror
                  value={data?.ddl || ""}
                  height="auto"
                  minHeight="140px"
                  maxHeight="450px"
                  readOnly={true}
                  editable={false}
                  theme={isDark ? "dark" : "light"}
                  extensions={extensions}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: false,
                  }}
                  className="font-mono text-xs"
                />
              )}
            </div>
          </div>
        </>
      )}

      <SeedModal
        isOpen={isSeedModalOpen}
        onClose={() => setIsSeedModalOpen(false)}
        connId={connId}
        tableName={table.name}
        engine={data?.engine}
        onRunInConsole={onOpenQueryConsole}
      />
    </div>
  );
};
