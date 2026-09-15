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
} from "lucide-react";
import type { TableSchema } from "../lib/types";
import { fetchTableDDL } from "../lib/api";
import { MigrationRunner } from "./migration/MigrationRunner";
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
    value: unknown
  ) => void;
}

export const SchemaInspector: FC<SchemaInspectorProps> = ({
  connId,
  table,
  isReadOnly = false,
  onNavigateRelation,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"schema" | "migration">("schema");

  // Fetch DDL and index data
  const {
    data,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
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
            className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/20 font-mono text-[11px]"
          >
            PostgreSQL
          </Badge>
        );
      case "mysql":
        return (
          <Badge
            variant="outline"
            className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20 font-mono text-[11px]"
          >
            MySQL
          </Badge>
        );
      case "mongodb":
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20 font-mono text-[11px]"
          >
            MongoDB
          </Badge>
        );
      default:
        return (
          <Badge
            variant="outline"
            className="bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20 font-mono text-[11px]"
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
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6 bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Overview Top Bar */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-zinc-200 dark:border-zinc-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold font-mono tracking-tight">
                {table.name}
              </h2>
              {getEngineBadge(data?.engine)}
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono mt-0.5">
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
        <div className="flex items-center bg-zinc-200/60 dark:bg-zinc-800/60 p-0.5 rounded-lg border border-zinc-300/40 dark:border-zinc-700/40">
          <button
            type="button"
            onClick={() => setActiveSubTab("schema")}
            className={cn(
              "px-3 py-1.5 text-xs font-mono font-medium rounded-md flex items-center gap-1.5 transition-all",
              activeSubTab === "schema"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            )}
          >
            <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{t("migration.tabSchema")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("migration")}
            className={cn(
              "px-3 py-1.5 text-xs font-mono font-medium rounded-md flex items-center gap-1.5 transition-all",
              activeSubTab === "migration"
                ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            )}
          >
            <Rocket className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
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
                      className="h-8 px-2.5 font-mono text-xs gap-1.5"
                    >
                      <RefreshCw
                        className={cn(
                          "w-3.5 h-3.5",
                          (isLoading || isRefetching) && "animate-spin"
                        )}
                      />
                      <span>Refresh</span>
                    </Button>
                  }
                />
                <TooltipContent side="bottom">Refresh DDL</TooltipContent>
              </Tooltip>

              <Button
                type="button"
                size="sm"
                onClick={handleCopy}
                disabled={!data?.ddl}
                className={cn(
                  "h-8 px-3 font-mono text-xs font-semibold gap-1.5 transition-all shadow-xs",
                  copied
                    ? "bg-emerald-600 text-white"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                )}
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{t("schema.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
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
            <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-mono flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>
                {t("schema.failedDdl", {
                  error: error instanceof Error ? error.message : "Unknown error",
                })}
              </span>
            </div>
          ) : null}

      {/* Section 1: Column Specifications */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-zinc-700 dark:text-zinc-300">
            {t("schema.columnsTitle")}
          </h3>
        </div>

        <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50 shadow-2xs">
          <Table>
            <TableHeader className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-12 text-center text-xs font-mono">
                  #
                </TableHead>
                <TableHead className="text-xs font-mono">
                  {t("schema.colName")}
                </TableHead>
                <TableHead className="text-xs font-mono">
                  {t("schema.colType")}
                </TableHead>
                <TableHead className="text-xs font-mono">
                  {t("schema.colPk")}
                </TableHead>
                <TableHead className="text-xs font-mono">
                  {t("schema.colNullable")}
                </TableHead>
                <TableHead className="text-xs font-mono">
                  {t("schema.colDefault")}
                </TableHead>
                <TableHead className="text-xs font-mono">
                  {t("schema.colRelations")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.columns.map((col, idx) => {
                const relation = table.relations?.find(
                  (r) => r.from_column === col.name
                );

                return (
                  <TableRow
                    key={col.name}
                    className="font-mono text-xs hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800/60"
                  >
                    <TableCell className="text-center text-zinc-400">
                      {idx + 1}
                    </TableCell>
                    <TableCell className="font-semibold text-zinc-900 dark:text-zinc-100">
                      <div className="flex items-center gap-1.5">
                        {col.is_primary_key && (
                          <Key className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        )}
                        <span>{col.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[11px] font-normal px-2 py-0.5",
                          getTypeBadgeClass(col.type)
                        )}
                      >
                        {col.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {col.is_primary_key ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold uppercase"
                        >
                          {t("schema.primary")}
                        </Badge>
                      ) : (
                        <span className="text-zinc-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {col.nullable ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                          {t("schema.yes")}
                        </span>
                      ) : (
                        <span className="text-zinc-500 dark:text-zinc-400 text-[11px]">
                          {t("schema.no")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {col.default_value ? (
                        <code className="text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[11px]">
                          {col.default_value}
                        </code>
                      ) : (
                        <span className="text-zinc-400 text-[11px]">
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
                              ""
                            )
                          }
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:underline cursor-pointer text-[11px]"
                        >
                          <span>{relation.to_table}</span>
                          <ArrowRight className="w-3 h-3" />
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
          <Key className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-zinc-700 dark:text-zinc-300">
            {t("schema.indexesTitle")}
          </h3>
        </div>

        {isLoading ? (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 space-y-2 bg-white dark:bg-zinc-900/40">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !data?.indexes || data.indexes.length === 0 ? (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 text-center text-xs font-mono text-zinc-500 dark:text-zinc-400 bg-white dark:bg-zinc-900/30">
            {t("schema.noIndexes")}
          </div>
        ) : (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50 shadow-2xs">
            <Table>
              <TableHeader className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-mono">
                    {t("schema.idxName")}
                  </TableHead>
                  <TableHead className="text-xs font-mono">
                    {t("schema.idxType")}
                  </TableHead>
                  <TableHead className="text-xs font-mono">
                    {t("schema.idxCols")}
                  </TableHead>
                  <TableHead className="text-xs font-mono">
                    {t("schema.idxUnique")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.indexes.map((idx) => (
                  <TableRow
                    key={idx.name}
                    className="font-mono text-xs hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800/60"
                  >
                    <TableCell className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {idx.name}
                    </TableCell>
                    <TableCell>
                      {idx.primary ? (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 font-bold text-[10px] uppercase"
                        >
                          {t("schema.primary")}
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 text-[10px]"
                        >
                          {t("schema.secondary")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {idx.columns.map((c) => (
                          <Badge
                            key={c}
                            variant="secondary"
                            className="font-mono text-[11px] font-normal px-1.5 py-0"
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
                          className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-bold uppercase"
                        >
                          {t("schema.unique")}
                        </Badge>
                      ) : (
                        <span className="text-zinc-400">{t("schema.no")}</span>
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
            <FileCode className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-zinc-700 dark:text-zinc-300">
              {t("schema.ddlTitle")}
            </h3>
          </div>

          {data?.ddl && (
            <span className="text-[11px] font-mono text-zinc-400">
              {data.ddl.split("\n").length} lines
            </span>
          )}
        </div>

        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-900 shadow-sm">
          {/* Editor Header Bar */}
          <div className="h-9 px-3 bg-zinc-100/70 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-mono font-medium text-zinc-600 dark:text-zinc-400 uppercase">
              {data?.engine === "mongodb" ? "JSON Definition" : "SQL DDL"}
            </span>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              disabled={!data?.ddl}
              className="h-6 px-2 text-xs font-mono gap-1 text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">
                    {t("schema.copied")}
                  </span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>{t("schema.copyDdl")}</span>
                </>
              )}
            </Button>
          </div>

          {/* Code Container */}
          {isLoading ? (
            <div className="p-4 space-y-2">
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
    </div>
  );
};
