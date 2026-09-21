import { useState, useMemo, type FC } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import {
  Play,
  ShieldCheck,
  RotateCcw,
  History,
  Trash2,
  FileCode,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  Layers,
} from "lucide-react";
import type {
  TableSchema,
  MigrationResult,
  MigrationRecord,
} from "../../lib/types";
import {
  executeMigration,
  fetchMigrationHistory,
  rollbackMigration,
} from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "cn";

interface MigrationRunnerProps {
  connId?: string;
  table?: TableSchema;
  engine?: string;
  isReadOnly?: boolean;
}

export const MigrationRunner: FC<MigrationRunnerProps> = ({
  connId,
  table,
  engine = "sqlite",
  isReadOnly = false,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [ddl, setDdl] = useState<string>("");
  const [lastResult, setLastResult] = useState<MigrationResult | null>(null);
  const [copiedRollback, setCopiedRollback] = useState(false);
  const [copiedHistoryDdl, setCopiedHistoryDdl] = useState<string | null>(null);
  const [confirmRunOpen, setConfirmRunOpen] = useState(false);
  const [confirmRollbackRecord, setConfirmRollbackRecord] =
    useState<MigrationRecord | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(
    null,
  );
  const [historyPage] = useState(0);

  const isDark = document.documentElement.classList.contains("dark");

  // CodeMirror extensions
  const extensions = useMemo(() => {
    const dialect =
      engine === "mysql" ? MySQL : engine === "sqlite" ? SQLite : PostgreSQL;
    return [sql({ dialect })];
  }, [engine]);

  // Fetch Migration History
  const {
    data: historyData,
    isLoading: isHistoryLoading,
    refetch: refetchHistory,
    isRefetching: isHistoryRefetching,
  } = useQuery({
    queryKey: ["migration-history", connId, historyPage],
    queryFn: () => fetchMigrationHistory(connId!, 30, historyPage * 30),
    enabled: Boolean(connId),
  });

  // Execute Dry-Run Mutation
  const dryRunMutation = useMutation({
    mutationFn: async (sqlText: string) => {
      if (!connId) throw new Error("No connection selected");
      return executeMigration(connId, { ddl: sqlText, dry_run: true });
    },
    onSuccess: (result) => {
      setLastResult(result);
    },
    onError: (err: Error) => {
      setLastResult({
        dry_run: true,
        success: false,
        statements_run: 0,
        total_statements: 0,
        error: err.message,
        execution_time_ms: 0,
        plan: [],
      });
    },
  });

  // Execute Live Migration Mutation
  const runMutation = useMutation({
    mutationFn: async (sqlText: string) => {
      if (!connId) throw new Error("No connection selected");
      return executeMigration(connId, { ddl: sqlText, dry_run: false });
    },
    onSuccess: (result) => {
      setLastResult(result);
      setConfirmRunOpen(false);
      // Invalidate relevant schema & table queries
      queryClient.invalidateQueries({
        queryKey: ["migration-history", connId],
      });
      queryClient.invalidateQueries({ queryKey: ["table-ddl"] });
      queryClient.invalidateQueries({ queryKey: ["tables", connId] });
      queryClient.invalidateQueries({ queryKey: ["table-stats"] });
      queryClient.invalidateQueries({ queryKey: ["erd", connId] });
    },
    onError: (err: Error) => {
      setLastResult({
        dry_run: false,
        success: false,
        statements_run: 0,
        total_statements: 0,
        error: err.message,
        execution_time_ms: 0,
        plan: [],
      });
      setConfirmRunOpen(false);
    },
  });

  // Rollback Mutation
  const rollbackMut = useMutation({
    mutationFn: async (mid: string) => {
      if (!connId) throw new Error("No connection selected");
      return rollbackMigration(connId, mid);
    },
    onSuccess: (result) => {
      setConfirmRollbackRecord(null);
      setLastResult(result);
      queryClient.invalidateQueries({
        queryKey: ["migration-history", connId],
      });
      queryClient.invalidateQueries({ queryKey: ["table-ddl"] });
      queryClient.invalidateQueries({ queryKey: ["tables", connId] });
      queryClient.invalidateQueries({ queryKey: ["table-stats"] });
      queryClient.invalidateQueries({ queryKey: ["erd", connId] });
    },
    onError: (err: Error) => {
      setConfirmRollbackRecord(null);
      setLastResult({
        dry_run: false,
        success: false,
        statements_run: 0,
        total_statements: 0,
        error: err.message,
        execution_time_ms: 0,
        plan: [],
      });
    },
  });

  const handleCopyRollback = () => {
    if (!lastResult?.rollback_sql) return;
    navigator.clipboard.writeText(lastResult.rollback_sql);
    setCopiedRollback(true);
    setTimeout(() => setCopiedRollback(false), 2000);
  };

  const handleCopyHistoryDdl = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHistoryDdl(id);
    setTimeout(() => setCopiedHistoryDdl(null), 2000);
  };

  // Templates definition based on engine and table context
  const currentTableName = table?.name || "example_table";
  const templates = useMemo(() => {
    const isSqlite = engine === "sqlite";
    const isMysql = engine === "mysql";

    const colType = isSqlite
      ? "TEXT"
      : isMysql
        ? "VARCHAR(255)"
        : "VARCHAR(255)";
    const tsDefault = isSqlite
      ? "CURRENT_TIMESTAMP"
      : isMysql
        ? "CURRENT_TIMESTAMP"
        : "NOW()";

    return [
      {
        label: t("migration.templateAddColumn"),
        sql: `ALTER TABLE ${currentTableName} ADD COLUMN new_column ${colType};`,
      },
      {
        label: t("migration.templateDropColumn"),
        sql: `ALTER TABLE ${currentTableName} DROP COLUMN old_column;`,
      },
      {
        label: t("migration.templateCreateIndex"),
        sql: `CREATE INDEX idx_${currentTableName}_col ON ${currentTableName}(new_column);`,
      },
      {
        label: t("migration.templateDropIndex"),
        sql: `DROP INDEX idx_${currentTableName}_col;`,
      },
      {
        label: t("migration.templateCreateTable"),
        sql: isSqlite
          ? `CREATE TABLE new_table (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  status TEXT DEFAULT 'active',\n  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);`
          : `CREATE TABLE new_table (\n  id SERIAL PRIMARY KEY,\n  title VARCHAR(255) NOT NULL,\n  status VARCHAR(50) DEFAULT 'active',\n  created_at TIMESTAMP DEFAULT ${tsDefault}\n);`,
      },
      {
        label: t("migration.templateDropTable"),
        sql: `DROP TABLE old_table;`,
      },
      {
        label: t("migration.templateRenameTable"),
        sql: `ALTER TABLE ${currentTableName} RENAME TO ${currentTableName}_archived;`,
      },
    ];
  }, [engine, currentTableName, t]);

  const insertTemplate = (templateSql: string) => {
    setDdl((prev) =>
      prev.trim() ? `${prev.trim()}\n\n${templateSql}` : templateSql,
    );
  };

  const isExecuting =
    dryRunMutation.isPending || runMutation.isPending || rollbackMut.isPending;

  return (
    <div className="space-y-6 font-sans text-zinc-900 dark:text-zinc-100">
      {/* Read-Only Banner */}
      {isReadOnly && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 font-mono text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{t("migration.readOnlyNotice")}</span>
        </div>
      )}

      {/* MongoDB Notice */}
      {engine === "mongodb" && (
        <div className="flex items-center gap-2.5 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3.5 font-mono text-xs text-blue-800 dark:text-blue-300">
          <FileCode className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <span>{t("migration.mongoNotSupported")}</span>
        </div>
      )}

      {/* Editor Container */}
      <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900/50">
        {/* Editor Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/80 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 border-zinc-300 bg-white font-mono text-xs dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    <span>{t("migration.templates")}</span>
                    <ChevronDown className="h-3 w-3 text-zinc-400" />
                  </Button>
                }
              />
              <DropdownMenuContent
                align="start"
                className="w-56 font-mono text-xs"
              >
                {templates.map((tpl, i) => (
                  <DropdownMenuItem
                    key={i}
                    onClick={() => insertTemplate(tpl.sql)}
                    className="cursor-pointer"
                  >
                    {tpl.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {ddl.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setDdl("")}
                disabled={isExecuting}
                className="h-8 gap-1 font-mono text-xs text-zinc-500 hover:text-rose-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{t("migration.clear")}</span>
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Dry Run Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => dryRunMutation.mutate(ddl)}
              disabled={!ddl.trim() || isExecuting}
              className="h-8 gap-1.5 border-zinc-300 bg-white px-3 font-mono text-xs font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
            >
              <ShieldCheck
                className={cn(
                  "h-3.5 w-3.5 text-sky-600 dark:text-sky-400",
                  dryRunMutation.isPending && "animate-spin",
                )}
              />
              <span>
                {dryRunMutation.isPending
                  ? t("migration.dryRunning")
                  : t("migration.dryRun")}
              </span>
            </Button>

            {/* Run Migration Button */}
            <Button
              type="button"
              size="sm"
              onClick={() => setConfirmRunOpen(true)}
              disabled={!ddl.trim() || isReadOnly || isExecuting}
              className="h-8 gap-1.5 bg-emerald-600 px-3.5 font-mono text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
            >
              <Play
                className={cn(
                  "h-3.5 w-3.5 fill-current",
                  runMutation.isPending && "animate-spin",
                )}
              />
              <span>
                {runMutation.isPending
                  ? t("migration.running")
                  : t("migration.runMigration")}
              </span>
            </Button>
          </div>
        </div>

        {/* CodeMirror SQL Editor */}
        <div className="relative">
          <CodeMirror
            value={ddl}
            height="auto"
            minHeight="180px"
            maxHeight="380px"
            theme={isDark ? "dark" : "light"}
            extensions={extensions}
            placeholder={t("migration.editorPlaceholder")}
            onChange={(val) => setDdl(val)}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
            }}
            className="font-mono text-xs"
          />
        </div>
      </div>

      {/* Migration Plan & Validation Result Panel */}
      {lastResult && (
        <div
          className={cn(
            "space-y-4 overflow-hidden rounded-lg border p-4 shadow-2xs transition-all",
            lastResult.success
              ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/60 dark:bg-emerald-950/20"
              : "border-rose-200 bg-rose-50/40 dark:border-rose-800/60 dark:bg-rose-950/20",
          )}
        >
          {/* Header Badge & Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {lastResult.success ? (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400">
                  <XCircle className="h-4 w-4" />
                </div>
              )}
              <div>
                <h4 className="font-mono text-xs font-bold">
                  {lastResult.dry_run
                    ? lastResult.success
                      ? t("migration.dryRunSuccess", {
                          time: lastResult.execution_time_ms,
                        })
                      : t("migration.dryRunFailed")
                    : lastResult.success
                      ? t("migration.migrationSuccess", {
                          time: lastResult.execution_time_ms,
                        })
                      : t("migration.migrationFailed")}
                </h4>
                <p className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t("migration.statementsExecuted", {
                    count: lastResult.statements_run,
                    total: lastResult.total_statements,
                  })}
                  {lastResult.execution_time_ms > 0 &&
                    ` • ${lastResult.execution_time_ms} ms`}
                </p>
              </div>
            </div>

            <Badge
              variant="outline"
              className={cn(
                "px-2 py-0.5 font-mono text-[11px]",
                lastResult.dry_run
                  ? "border-sky-400/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                  : lastResult.success
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
              )}
            >
              {lastResult.dry_run
                ? "DRY-RUN"
                : lastResult.success
                  ? "APPLIED"
                  : "FAILED"}
            </Badge>
          </div>

          {/* Error Message if any */}
          {lastResult.error && (
            <div className="space-y-1 rounded-md border border-rose-300 bg-rose-100/70 p-3 font-mono text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200">
              <div className="font-semibold">{lastResult.error}</div>
              {lastResult.error_statement && (
                <div className="rounded bg-rose-200/50 p-1.5 text-[11px] break-all opacity-80 dark:bg-rose-900/40">
                  <code>{lastResult.error_statement}</code>
                </div>
              )}
            </div>
          )}

          {/* Planned Operations Checklist */}
          {lastResult.plan && lastResult.plan.length > 0 && (
            <div className="space-y-2 border-t border-zinc-200/60 pt-2 dark:border-zinc-800/60">
              <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-zinc-700 dark:text-zinc-300">
                <Layers className="h-3.5 w-3.5 text-indigo-500" />
                <span>
                  {t("migration.operationsPlanned", {
                    count: lastResult.plan.length,
                  })}
                </span>
              </div>
              <div className="grid gap-1.5">
                {lastResult.plan.map((op, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-2 rounded border border-zinc-200 bg-white/70 p-2 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900/70"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Badge
                        variant="secondary"
                        className="shrink-0 bg-zinc-100 text-[10px] font-bold uppercase dark:bg-zinc-800"
                      >
                        {op.action}
                      </Badge>
                      <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {op.target_type}:
                      </span>
                      <span className="truncate font-semibold text-zinc-800 dark:text-zinc-200">
                        {op.target_name}
                      </span>
                    </div>
                    <code className="hidden max-w-xs truncate text-[10px] text-zinc-500 md:inline dark:text-zinc-400">
                      {op.sql}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rollback SQL Preview */}
          {lastResult.rollback_sql && (
            <div className="space-y-2 border-t border-zinc-200/60 pt-2 dark:border-zinc-800/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-700 dark:text-amber-400">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t("migration.rollbackNotice")}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyRollback}
                  className="h-7 gap-1 px-2 font-mono text-[11px] text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
                >
                  {copiedRollback ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {t("schema.copied")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>{t("migration.copyRollback")}</span>
                    </>
                  )}
                </Button>
              </div>
              <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-900 p-2.5 font-mono text-xs text-zinc-100">
                <pre>{lastResult.rollback_sql}</pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Migration History Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-mono text-xs font-semibold tracking-wider text-zinc-700 uppercase dark:text-zinc-300">
              {t("migration.historyTitle")}
            </h3>
            {historyData && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {historyData.total_count}
              </Badge>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => refetchHistory()}
            disabled={isHistoryLoading || isHistoryRefetching}
            className="h-7 gap-1 px-2 font-mono text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            <RefreshCw
              className={cn(
                "h-3 w-3",
                (isHistoryLoading || isHistoryRefetching) && "animate-spin",
              )}
            />
            <span>{t("migration.refreshHistory")}</span>
          </Button>
        </div>

        {/* History Items List */}
        {isHistoryLoading ? (
          <div className="p-6 text-center font-mono text-xs text-zinc-500">
            {t("common.loading")}
          </div>
        ) : !historyData || historyData.items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-300 bg-white/40 p-8 text-center font-mono text-xs text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/30">
            {t("migration.historyEmpty")}
          </div>
        ) : (
          <div className="space-y-2">
            {historyData.items.map((record) => {
              const isExpanded = expandedHistoryId === record.id;
              return (
                <div
                  key={record.id}
                  className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-2xs transition-all dark:border-zinc-800 dark:bg-zinc-900/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="flex items-center gap-2.5">
                      {/* Status Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[10px] font-bold uppercase",
                          record.success
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                            : "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400",
                        )}
                      >
                        {record.success
                          ? t("migration.statusApplied")
                          : t("migration.statusFailed")}
                      </Badge>

                      {/* Info */}
                      <div className="font-mono text-xs">
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                          {record.ddl
                            .trim()
                            .split(";")
                            .filter((s) => s.trim()).length || 1}{" "}
                          {t("migration.statementsUnit")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="mr-1 flex items-center gap-1 font-mono text-[11px] text-zinc-400">
                        <Clock className="h-3 w-3" />
                        {new Date(record.executed_at).toLocaleString()}
                      </span>

                      {/* Rollback Trigger Button */}
                      {record.success && record.rollback_sql && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmRollbackRecord(record)}
                          disabled={isReadOnly || isExecuting}
                          className="h-7 gap-1 border-amber-500/30 bg-amber-500/5 px-2 font-mono text-[11px] text-amber-700 hover:bg-amber-500/15 dark:text-amber-400"
                        >
                          <RotateCcw className="h-3 w-3" />
                          <span>{t("migration.applyRollback")}</span>
                        </Button>
                      )}

                      {/* Expand / Collapse DDL toggle */}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedHistoryId(isExpanded ? null : record.id)
                        }
                        className="h-7 px-2 font-mono text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                      >
                        {isExpanded ? (
                          <>
                            <span>{t("migration.hideDdl")}</span>
                            <ChevronUp className="ml-1 h-3 w-3" />
                          </>
                        ) : (
                          <>
                            <span>{t("migration.viewDdl")}</span>
                            <ChevronDown className="ml-1 h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded DDL View */}
                  {isExpanded && (
                    <div className="space-y-2 border-t border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/80">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] font-semibold text-zinc-500 uppercase">
                          DDL Script
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleCopyHistoryDdl(record.id, record.ddl)
                          }
                          className="h-6 gap-1 px-1.5 font-mono text-[10px]"
                        >
                          {copiedHistoryDdl === record.id ? (
                            <>
                              <Check className="h-3 w-3 text-emerald-500" />
                              <span className="text-emerald-500">
                                {t("schema.copied")}
                              </span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-900 p-2 font-mono text-xs text-zinc-100">
                        <pre>{record.ddl}</pre>
                      </div>

                      {isExpanded && record.rollback_sql && (
                        <div className="space-y-1.5">
                          <p className="font-mono text-[11px] font-semibold tracking-wider text-amber-700 uppercase dark:text-amber-400">
                            {t("migration.rollbackDdlLabel")}
                          </p>
                          <div className="overflow-x-auto rounded border border-amber-800/30 bg-amber-950/20 p-2.5 font-mono text-xs text-amber-200">
                            <pre>{record.rollback_sql}</pre>
                          </div>
                        </div>
                      )}

                      {record.error && (
                        <div className="rounded border border-rose-200 bg-rose-50 p-2 font-mono text-xs text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                          <strong>Error:</strong> {record.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm Run Dialog */}
      <AlertDialog open={confirmRunOpen} onOpenChange={setConfirmRunOpen}>
        <AlertDialogContent className="max-w-md font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-mono text-base font-bold">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              {t("migration.confirmRunTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
              {t("migration.confirmRunDesc", {
                count: ddl.split(";").filter((s) => s.trim()).length || 1,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-100">
            <pre className="break-all whitespace-pre-wrap">{ddl}</pre>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={runMutation.isPending}
              className="font-mono text-xs"
            >
              {t("migration.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => runMutation.mutate(ddl)}
              disabled={runMutation.isPending}
              className="gap-1.5 bg-emerald-600 font-mono text-xs font-semibold text-white hover:bg-emerald-500"
            >
              {runMutation.isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>{t("migration.running")}</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>{t("migration.confirm")}</span>
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Rollback Dialog */}
      <AlertDialog
        open={Boolean(confirmRollbackRecord)}
        onOpenChange={(open) => !open && setConfirmRollbackRecord(null)}
      >
        <AlertDialogContent className="max-w-md font-sans">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 font-mono text-base font-bold text-amber-600 dark:text-amber-400">
              <RotateCcw className="h-4 w-4 shrink-0" />
              {t("migration.confirmRollbackTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="font-mono text-xs text-zinc-600 dark:text-zinc-400">
              {t("migration.confirmRollbackDesc", {
                id: confirmRollbackRecord?.id.slice(0, 8),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmRollbackRecord?.rollback_sql && (
            <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 font-mono text-xs text-zinc-100">
              <pre className="break-all whitespace-pre-wrap">
                {confirmRollbackRecord.rollback_sql}
              </pre>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={rollbackMut.isPending}
              className="font-mono text-xs"
            >
              {t("migration.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRollbackRecord) {
                  rollbackMut.mutate(confirmRollbackRecord.id);
                }
              }}
              disabled={rollbackMut.isPending}
              className="gap-1.5 bg-amber-600 font-mono text-xs font-semibold text-white hover:bg-amber-500"
            >
              {rollbackMut.isPending ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>{t("migration.running")}</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t("migration.confirm")}</span>
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
