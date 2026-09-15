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
    <div className="space-y-6 text-zinc-900 dark:text-zinc-100 font-sans">
      {/* Read-Only Banner */}
      {isReadOnly && (
        <div className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-mono flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{t("migration.readOnlyNotice")}</span>
        </div>
      )}

      {/* MongoDB Notice */}
      {engine === "mongodb" && (
        <div className="p-3.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-800 dark:text-blue-300 text-xs font-mono flex items-center gap-2.5">
          <FileCode className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <span>{t("migration.mongoNotSupported")}</span>
        </div>
      )}

      {/* Editor Container */}
      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/50 shadow-2xs">
        {/* Editor Toolbar */}
        <div className="flex items-center justify-between flex-wrap gap-2 px-4 py-2.5 bg-zinc-50/80 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs font-mono gap-1.5 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{t("migration.templates")}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
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
                className="h-8 text-xs font-mono text-zinc-500 hover:text-rose-600 gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
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
              className="h-8 px-3 text-xs font-mono font-semibold gap-1.5 bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <ShieldCheck
                className={cn(
                  "w-3.5 h-3.5 text-sky-600 dark:text-sky-400",
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
              className="h-8 px-3.5 text-xs font-mono font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
            >
              <Play
                className={cn(
                  "w-3.5 h-3.5 fill-current",
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
            "border rounded-lg overflow-hidden p-4 space-y-4 shadow-2xs transition-all",
            lastResult.success
              ? "bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/60"
              : "bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/60",
          )}
        >
          {/* Header Badge & Summary */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {lastResult.success ? (
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : (
                <div className="w-6 h-6 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <XCircle className="w-4 h-4" />
                </div>
              )}
              <div>
                <h4 className="text-xs font-bold font-mono">
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
                <p className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
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
                "font-mono text-[11px] px-2 py-0.5",
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
            <div className="p-3 rounded-md bg-rose-100/70 dark:bg-rose-950/60 border border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs font-mono space-y-1">
              <div className="font-semibold">{lastResult.error}</div>
              {lastResult.error_statement && (
                <div className="text-[11px] opacity-80 break-all bg-rose-200/50 dark:bg-rose-900/40 p-1.5 rounded">
                  <code>{lastResult.error_statement}</code>
                </div>
              )}
            </div>
          )}

          {/* Planned Operations Checklist */}
          {lastResult.plan && lastResult.plan.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
              <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-zinc-700 dark:text-zinc-300">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
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
                    className="flex items-center justify-between gap-2 p-2 rounded bg-white/70 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Badge
                        variant="secondary"
                        className="text-[10px] uppercase font-bold shrink-0 bg-zinc-100 dark:bg-zinc-800"
                      >
                        {op.action}
                      </Badge>
                      <span className="text-zinc-500 dark:text-zinc-400 text-[11px] shrink-0">
                        {op.target_type}:
                      </span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {op.target_name}
                      </span>
                    </div>
                    <code className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate max-w-xs hidden md:inline">
                      {op.sql}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rollback SQL Preview */}
          {lastResult.rollback_sql && (
            <div className="pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold font-mono text-amber-700 dark:text-amber-400">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t("migration.rollbackNotice")}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyRollback}
                  className="h-7 px-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white gap-1"
                >
                  {copiedRollback ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {t("schema.copied")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>{t("migration.copyRollback")}</span>
                    </>
                  )}
                </Button>
              </div>
              <div className="p-2.5 rounded bg-zinc-900 text-zinc-100 font-mono text-xs overflow-x-auto border border-zinc-800">
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
            <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider font-mono text-zinc-700 dark:text-zinc-300">
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
            className="h-7 px-2 font-mono text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 gap-1"
          >
            <RefreshCw
              className={cn(
                "w-3 h-3",
                (isHistoryLoading || isHistoryRefetching) && "animate-spin",
              )}
            />
            <span>{t("migration.refreshHistory")}</span>
          </Button>
        </div>

        {/* History Items List */}
        {isHistoryLoading ? (
          <div className="p-6 text-center text-xs font-mono text-zinc-500">
            {t("common.loading")}
          </div>
        ) : !historyData || historyData.items.length === 0 ? (
          <div className="p-8 text-center rounded-lg border border-dashed border-zinc-300 dark:border-zinc-800 bg-white/40 dark:bg-zinc-900/30 text-xs font-mono text-zinc-400">
            {t("migration.historyEmpty")}
          </div>
        ) : (
          <div className="space-y-2">
            {historyData.items.map((record) => {
              const isExpanded = expandedHistoryId === record.id;
              return (
                <div
                  key={record.id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/60 shadow-2xs transition-all"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2 p-3">
                    <div className="flex items-center gap-2.5">
                      {/* Status Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[10px] uppercase font-bold",
                          record.success
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
                        )}
                      >
                        {record.success
                          ? t("migration.statusApplied")
                          : t("migration.statusFailed")}
                      </Badge>

                      {/* Info */}
                      <div className="text-xs font-mono">
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
                      <span className="text-[11px] font-mono text-zinc-400 flex items-center gap-1 mr-1">
                        <Clock className="w-3 h-3" />
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
                          className="h-7 px-2 font-mono text-[11px] gap-1 text-amber-700 dark:text-amber-400 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/15"
                        >
                          <RotateCcw className="w-3 h-3" />
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
                            <ChevronUp className="w-3 h-3 ml-1" />
                          </>
                        ) : (
                          <>
                            <span>{t("migration.viewDdl")}</span>
                            <ChevronDown className="w-3 h-3 ml-1" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Expanded DDL View */}
                  {isExpanded && (
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-950/80 border-t border-zinc-200 dark:border-zinc-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase text-zinc-500 font-semibold">
                          DDL Script
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleCopyHistoryDdl(record.id, record.ddl)
                          }
                          className="h-6 px-1.5 font-mono text-[10px] gap-1"
                        >
                          {copiedHistoryDdl === record.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-500">
                                {t("schema.copied")}
                              </span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </Button>
                      </div>
                      <div className="p-2 rounded bg-zinc-900 text-zinc-100 font-mono text-xs overflow-x-auto border border-zinc-800">
                        <pre>{record.ddl}</pre>
                      </div>

                      {isExpanded && record.rollback_sql && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-mono font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                            {t("migration.rollbackDdlLabel")}
                          </p>
                          <div className="p-2.5 rounded bg-amber-950/20 border border-amber-800/30 text-amber-200 font-mono text-xs overflow-x-auto">
                            <pre>{record.rollback_sql}</pre>
                          </div>
                        </div>
                      )}

                      {record.error && (
                        <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-mono">
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
            <AlertDialogTitle className="text-base font-bold font-mono flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              {t("migration.confirmRunTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
              {t("migration.confirmRunDesc", {
                count: ddl.split(";").filter((s) => s.trim()).length || 1,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="p-3 rounded-md bg-zinc-900 text-zinc-100 font-mono text-xs max-h-48 overflow-y-auto border border-zinc-800">
            <pre className="whitespace-pre-wrap break-all">{ddl}</pre>
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-semibold gap-1.5"
            >
              {runMutation.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("migration.running")}</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
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
            <AlertDialogTitle className="text-base font-bold font-mono flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <RotateCcw className="w-4 h-4 shrink-0" />
              {t("migration.confirmRollbackTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-mono text-zinc-600 dark:text-zinc-400">
              {t("migration.confirmRollbackDesc", {
                id: confirmRollbackRecord?.id.slice(0, 8),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmRollbackRecord?.rollback_sql && (
            <div className="p-3 rounded-md bg-zinc-900 text-zinc-100 font-mono text-xs max-h-48 overflow-y-auto border border-zinc-800">
              <pre className="whitespace-pre-wrap break-all">
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
              className="bg-amber-600 hover:bg-amber-500 text-white font-mono text-xs font-semibold gap-1.5"
            >
              {rollbackMut.isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{t("migration.running")}</span>
                </>
              ) : (
                <>
                  <RotateCcw className="w-3.5 h-3.5" />
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
