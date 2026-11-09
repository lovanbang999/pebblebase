import { useState, useMemo, useEffect } from "react";
import { useSchemaMetadata } from "@/hooks/useSchemaMetadata";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { studioEditorTheme } from "@/lib/editorTheme";
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
import { cn } from "@/lib/utils";

interface EngineBadgeConfig {
  label: string;
  className: string;
}

const ENGINE_BADGES: Record<string, EngineBadgeConfig> = {
  postgres: {
    label: "PostgreSQL",
    className: "border-primary/20 bg-primary/10 text-primary",
  },
  mysql: {
    label: "MySQL",
    className: "border-warning/20 bg-warning/10 text-warning",
  },
  mongodb: {
    label: "MongoDB",
    className: "border-primary/20 bg-success/10 text-success",
  },
  mssql: {
    label: "SQL Server",
    className:
      "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
  clickhouse: {
    label: "ClickHouse",
    className: "border-warning/20 bg-warning/10 text-warning",
  },
  redis: {
    label: "Redis",
    className: "border-destructive/20 bg-destructive/10 text-destructive",
  },
  sqlite: {
    label: "SQLite",
    className: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  },
};

const DEFAULT_ENGINE_BADGE: EngineBadgeConfig = ENGINE_BADGES.sqlite;

function EngineBadge({ engine }: { engine?: string }) {
  const config =
    (engine && ENGINE_BADGES[engine.toLowerCase()]) || DEFAULT_ENGINE_BADGE;
  return (
    <Badge
      variant="outline"
      className={cn("font-mono text-[11px]", config.className)}
    >
      {config.label}
    </Badge>
  );
}

const COLUMN_TYPE_CLASSES: Record<string, string> = {
  int: "bg-success/10 text-success dark:bg-success/40 border-success/30 dark:border-success",
  float:
    "bg-success/10 text-success dark:bg-success/40 border-success/30 dark:border-success",
  bool: "bg-warning/10 text-warning dark:bg-warning/40 border-warning/30 dark:border-warning",
  datetime:
    "bg-primary/10 text-primary dark:bg-primary/40 border-primary/30 dark:border-primary",
  json: "bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-300 border-pink-200 dark:border-pink-800",
};

const DEFAULT_COLUMN_TYPE_CLASS =
  "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border-blue-200 dark:border-blue-800";

function getTypeBadgeClass(colType: string): string {
  return (
    COLUMN_TYPE_CLASSES[colType.toLowerCase()] ?? DEFAULT_COLUMN_TYPE_CLASS
  );
}

interface SchemaInspectorProps {
  connId?: string;
  table: TableSchema;
  view?: "columns" | "indexes" | "ddl";
  isReadOnly?: boolean;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: unknown,
  ) => void;
  onOpenQueryConsole?: (query?: string, title?: string) => void;
}

export function SchemaInspector({
  connId,
  table: sourceTable,
  view,
  isReadOnly = false,
  onNavigateRelation,
  onOpenQueryConsole,
}: SchemaInspectorProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [isSeedModalOpen, setIsSeedModalOpen] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"schema" | "migration">(
    "schema",
  );
  useEffect(() => setActiveSubTab("schema"), [view]);

  // Fetch DDL and index data
  const metadata = useSchemaMetadata(connId ?? "", sourceTable.name);
  const { isLoading, error, isRefetching } = metadata;
  const refetch = metadata.refresh;
  const catalogTable = metadata.data?.tables.find(
    (item) => item.name === sourceTable.name,
  );
  const table = catalogTable ?? sourceTable;
  const data = catalogTable
    ? {
        ddl: catalogTable.ddl ?? "",
        indexes: catalogTable.indexes,
        engine: metadata.data!.engine,
      }
    : undefined;

  const isDark = document.documentElement.classList.contains("dark");

  const editorEngine = metadata.data?.engine;
  const extensions = useMemo(() => {
    if (editorEngine === "mongodb") {
      return [json()];
    }
    const dialect =
      editorEngine === "mysql"
        ? MySQL
        : editorEngine === "sqlite"
          ? SQLite
          : PostgreSQL;
    return [sql({ dialect })];
  }, [editorEngine]);

  const handleCopy = () => {
    if (!data?.ddl) return;
    navigator.clipboard.writeText(data.ddl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-card/50 text-foreground dark:bg-background flex-1 space-y-6 overflow-auto p-4 font-sans md:p-6">
      {/* Legacy combined inspector header remains for non-workspace callers. */}
      {!view && (
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-3">
            <div className="border-primary/20 bg-success/10 text-success rounded-lg border p-2">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-mono text-base font-bold tracking-tight">
                  {table.name}
                </h2>
                <EngineBadge engine={data?.engine} />
                {catalogTable?.gaps.map((gap) => (
                  <span
                    key={gap}
                    role="status"
                    className="text-warning text-xs"
                  >
                    {gap}
                  </span>
                ))}
              </div>
              <p className="text-muted-foreground mt-0.5 font-mono text-xs">
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
          <div className="border-border/40 bg-muted/60 flex items-center rounded-lg border p-0.5">
            <button
              type="button"
              onClick={() => setActiveSubTab("schema")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-medium transition-all",
                activeSubTab === "schema"
                  ? "bg-background text-foreground dark:bg-card font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
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
                  ? "bg-background text-foreground dark:bg-card font-semibold shadow-xs"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Rocket className="text-success h-3.5 w-3.5" />
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
                    className="border-primary/30 text-success hover:bg-success/10 dark:text-success dark:hover:bg-success/40 h-8 cursor-pointer gap-1.5 px-2.5 font-mono text-xs"
                  >
                    <Sparkles className="text-success h-3.5 w-3.5" />
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
                      ? "bg-primary text-white"
                      : "bg-primary hover:bg-primary/90 text-white",
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
      )}

      {activeSubTab === "migration" ? (
        <div className="space-y-3">
          {view && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setActiveSubTab("schema")}
            >
              ← {t("schema.backToStructure", "Back to structure")}
            </Button>
          )}
          <MigrationRunner
            connId={connId}
            table={table}
            engine={data?.engine}
            isReadOnly={isReadOnly}
          />
        </div>
      ) : (
        <>
          {error ? (
            <div className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/40 flex items-center gap-2 rounded-lg border p-4 font-mono text-xs">
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
          {(!view || view === "columns") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="text-success h-4 w-4" />
                  <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                    {t("schema.columnsTitle")}
                  </h3>
                </div>
                {view && data?.engine !== "mongodb" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setIsSeedModalOpen(true)}
                  >
                    <Sparkles className="mr-1 size-3.5" />
                    {t("seed.title")}
                  </Button>
                )}
              </div>

              <div className="border-border bg-background dark:bg-card/50 overflow-hidden rounded-lg border shadow-2xs">
                <Table>
                  <TableHeader className="border-border bg-card border-b">
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
                          className="border-border hover:bg-card/60 dark:border-border/60 dark:hover:bg-muted/40 border-b font-mono text-xs"
                        >
                          <TableCell className="text-muted-foreground text-center">
                            {idx + 1}
                          </TableCell>
                          <TableCell className="text-foreground font-semibold">
                            <div className="flex items-center gap-1.5">
                              {col.is_primary_key && (
                                <Key className="text-warning h-3.5 w-3.5 shrink-0" />
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
                                className="border-warning/30 bg-warning/10 text-warning dark:text-warning text-[10px] font-bold uppercase"
                              >
                                {t("schema.primary")}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {col.nullable ? (
                              <span className="text-success text-[11px] font-medium">
                                {t("schema.yes")}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">
                                {t("schema.no")}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {col.default_value ? (
                              <code className="bg-muted text-foreground rounded px-1.5 py-0.5 text-[11px]">
                                {col.default_value}
                              </code>
                            ) : (
                              <span className="text-muted-foreground text-[11px]">
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
                                className="border-primary/30 bg-primary/10 text-primary dark:border-primary dark:bg-primary/40 inline-flex cursor-pointer items-center gap-1 rounded border px-2 py-0.5 text-[11px] hover:underline"
                              >
                                <span>{relation.to_table}</span>
                                <ArrowRight className="h-3 w-3" />
                                <span>{relation.to_column}</span>
                              </button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Section 2: Database Indexes */}
          {(!view || view === "indexes") && (
            <div className="space-y-2">
              {catalogTable && catalogTable.constraints.length > 0 && (
                <details className="border-border rounded border p-2 text-xs">
                  <summary>{t("schema.constraints")}</summary>
                  {catalogTable.constraints.map((constraint) => (
                    <div key={constraint.name} className="py-1 font-mono">
                      {constraint.kind} {constraint.name} (
                      {constraint.columns.join(", ")})
                      {constraint.reference_table && (
                        <>
                          {" "}
                          → {constraint.reference_schema}.
                          {constraint.reference_table} (
                          {constraint.reference_columns?.join(", ")})
                        </>
                      )}
                    </div>
                  ))}
                </details>
              )}
              <div className="flex items-center gap-2">
                <Key className="text-warning h-4 w-4" />
                <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                  {t("schema.indexesTitle")}
                </h3>
              </div>

              {isLoading ? (
                <div className="border-border bg-background dark:bg-card/40 space-y-2 rounded-lg border p-4">
                  <Skeleton className="h-6 w-1/3" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : !data?.indexes || data.indexes.length === 0 ? (
                <div className="border-border bg-background text-muted-foreground dark:bg-card/30 rounded-lg border p-4 text-center font-mono text-xs">
                  {t("schema.noIndexes")}
                </div>
              ) : (
                <div className="border-border bg-background dark:bg-card/50 overflow-hidden rounded-lg border shadow-2xs">
                  <Table>
                    <TableHeader className="border-border bg-card border-b">
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
                          className="border-border hover:bg-card/60 dark:border-border/60 dark:hover:bg-muted/40 border-b font-mono text-xs"
                        >
                          <TableCell className="text-foreground font-semibold">
                            {idx.name}
                          </TableCell>
                          <TableCell>
                            {idx.primary ? (
                              <Badge
                                variant="outline"
                                className="border-warning/30 bg-warning/10 text-warning dark:text-warning text-[10px] font-bold uppercase"
                              >
                                {t("schema.primary")}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground text-[10px]"
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
                                className="border-primary/30 bg-success/10 text-success dark:text-success text-[10px] font-bold uppercase"
                              >
                                {t("schema.unique")}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">
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
          )}

          {/* Section 3: Table Creation DDL Script */}
          {(!view || view === "ddl") && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileCode className="text-primary h-4 w-4" />
                  <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                    {t("schema.ddlTitle")}
                  </h3>
                </div>

                {data?.ddl && (
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {data.ddl.split("\n").length} lines
                  </span>
                )}
                {view === "ddl" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setActiveSubTab("migration")}
                  >
                    {t("migration.tabMigration")}
                  </Button>
                )}
              </div>

              <div className="border-border bg-background dark:bg-card overflow-hidden rounded-lg border shadow-sm">
                {/* Editor Header Bar */}
                <div className="border-border bg-muted/70 dark:bg-muted/60 flex h-9 items-center justify-between border-b px-3">
                  <span className="text-muted-foreground font-mono text-xs font-medium uppercase">
                    {data?.engine === "mongodb" ? "JSON Definition" : "SQL DDL"}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!data?.ddl}
                    className="text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground h-6 gap-1 px-2 font-mono text-xs"
                  >
                    {copied ? (
                      <>
                        <Check className="text-success h-3 w-3" />
                        <span className="text-success">
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
                    extensions={[...extensions, studioEditorTheme]}
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
          )}
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
}
