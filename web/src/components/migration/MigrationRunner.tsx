import { useState, useMemo, type FC } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { studioEditorTheme } from "@/lib/editorTheme";
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
import { emitOperationEvent } from "@/lib/operationEvents";

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
      emitOperationEvent({
        kind: "migration-dry-run",
        severity: result.success ? "info" : "error",
        title: t("operations.migrationDryRun", "Migration preview completed"),
        message: t("operations.migrationSummary", {
          count: result.statements_run,
          defaultValue: "{{count}} statements",
        }),
        connectionId: connId,
      });
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
      emitOperationEvent({
        kind: "migration-dry-run",
        severity: "error",
        title: t("operations.migrationFailed", "Migration failed"),
        message: t(
          "operations.genericFailure",
          "The operation could not be completed.",
        ),
        connectionId: connId,
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
      emitOperationEvent({
        kind: "migration",
        severity: result.success ? "success" : "error",
        title: result.success
          ? t("operations.migrationSucceeded", "Migration completed")
          : t("operations.migrationFailed", "Migration failed"),
        message: t("operations.migrationSummary", {
          count: result.statements_run,
          defaultValue: "{{count}} statements",
        }),
        connectionId: connId,
      });
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
      emitOperationEvent({
        kind: "migration",
        severity: "error",
        title: t("operations.migrationFailed", "Migration failed"),
        message: t(
          "operations.genericFailure",
          "The operation could not be completed.",
        ),
        connectionId: connId,
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
      emitOperationEvent({
        kind: "migration-rollback",
        severity: result.success ? "success" : "error",
        title: t(
          "operations.migrationRollback",
          "Migration rollback completed",
        ),
        message: t("operations.migrationSummary", {
          count: result.statements_run,
          defaultValue: "{{count}} statements",
        }),
        connectionId: connId,
      });
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
      emitOperationEvent({
        kind: "migration-rollback",
        severity: "error",
        title: t("operations.migrationFailed", "Migration failed"),
        message: t(
          "operations.genericFailure",
          "The operation could not be completed.",
        ),
        connectionId: connId,
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
    <div className="text-foreground dark:text-foreground space-y-6 font-sans">
      {/* Read-Only Banner */}
      {isReadOnly && (
        <div className="border-warning/30 bg-warning/10 text-warning dark:text-warning flex items-center gap-2.5 rounded-lg border p-3.5 font-mono text-xs">
          <AlertTriangle className="text-warning dark:text-warning h-4 w-4 shrink-0" />
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
      <div className="border-border bg-background dark:border-border dark:bg-card/50 overflow-hidden rounded-lg border shadow-2xs">
        {/* Editor Toolbar */}
        <div className="border-border bg-card/80 dark:border-border dark:bg-card flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="border-border bg-background dark:border-border dark:bg-muted h-8 gap-1.5 font-mono text-xs"
                  >
                    <Sparkles className="text-warning h-3.5 w-3.5" />
                    <span>{t("migration.templates")}</span>
                    <ChevronDown className="text-muted-foreground h-3 w-3" />
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
                className="text-muted-foreground hover:text-destructive h-8 gap-1 font-mono text-xs"
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
              className="border-border bg-background text-foreground hover:bg-muted dark:border-border dark:bg-muted dark:text-foreground dark:hover:bg-muted h-8 gap-1.5 px-3 font-mono text-xs font-semibold"
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
              className="bg-primary hover:bg-primary/90 h-8 gap-1.5 px-3.5 font-mono text-xs font-semibold text-white shadow-xs"
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
            extensions={[...extensions, studioEditorTheme]}
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
              ? "border-success/30 bg-success/40 dark:border-success/60 dark:bg-success/20"
              : "border-destructive/30 bg-destructive/40 dark:border-destructive/60 dark:bg-destructive/20",
          )}
        >
          {/* Header Badge & Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {lastResult.success ? (
                <div className="bg-success/20 text-success dark:text-success flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              ) : (
                <div className="bg-destructive/20 text-destructive dark:text-destructive flex h-6 w-6 shrink-0 items-center justify-center rounded-full">
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
                <p className="text-muted-foreground dark:text-muted-foreground font-mono text-[11px]">
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
                    ? "border-primary/40 bg-success/10 text-success dark:text-success"
                    : "border-destructive/40 bg-destructive/10 text-destructive dark:text-destructive",
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
            <div className="border-destructive/30 bg-destructive/70 text-destructive dark:border-destructive dark:bg-destructive/60 dark:text-destructive space-y-1 rounded-md border p-3 font-mono text-xs">
              <div className="font-semibold">{lastResult.error}</div>
              {lastResult.error_statement && (
                <div className="bg-destructive/50 dark:bg-destructive/40 rounded p-1.5 text-[11px] break-all opacity-80">
                  <code>{lastResult.error_statement}</code>
                </div>
              )}
            </div>
          )}

          {/* Planned Operations Checklist */}
          {lastResult.plan && lastResult.plan.length > 0 && (
            <div className="border-border/60 dark:border-border/60 space-y-2 border-t pt-2">
              <div className="text-foreground dark:text-muted-foreground flex items-center gap-1.5 font-mono text-xs font-bold">
                <Layers className="text-primary h-3.5 w-3.5" />
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
                    className="border-border bg-background/70 dark:border-border dark:bg-card/70 flex items-center justify-between gap-2 rounded border p-2 font-mono text-xs"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Badge
                        variant="secondary"
                        className="bg-muted dark:bg-muted shrink-0 text-[10px] font-bold uppercase"
                      >
                        {op.action}
                      </Badge>
                      <span className="text-muted-foreground dark:text-muted-foreground shrink-0 text-[11px]">
                        {op.target_type}:
                      </span>
                      <span className="text-foreground dark:text-foreground truncate font-semibold">
                        {op.target_name}
                      </span>
                    </div>
                    <code className="text-muted-foreground dark:text-muted-foreground hidden max-w-xs truncate text-[10px] md:inline">
                      {op.sql}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rollback SQL Preview */}
          {lastResult.rollback_sql && (
            <div className="border-border/60 dark:border-border/60 space-y-2 border-t pt-2">
              <div className="flex items-center justify-between">
                <div className="text-warning dark:text-warning flex items-center gap-1.5 font-mono text-xs font-bold">
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{t("migration.rollbackNotice")}</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleCopyRollback}
                  className="text-muted-foreground hover:text-foreground dark:text-muted-foreground h-7 gap-1 px-2 font-mono text-[11px] dark:hover:text-white"
                >
                  {copiedRollback ? (
                    <>
                      <Check className="text-success h-3 w-3" />
                      <span className="text-success dark:text-success">
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
              <div className="border-border bg-code text-code-foreground overflow-x-auto rounded border p-2.5 font-mono text-xs">
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
            <History className="text-success dark:text-success h-4 w-4" />
            <h3 className="text-foreground dark:text-muted-foreground font-mono text-xs font-semibold tracking-wider uppercase">
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
            className="text-muted-foreground hover:text-foreground dark:hover:text-foreground h-7 gap-1 px-2 font-mono text-xs"
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
          <div className="text-muted-foreground p-6 text-center font-mono text-xs">
            {t("common.loading")}
          </div>
        ) : !historyData || historyData.items.length === 0 ? (
          <div className="border-border bg-background/40 text-muted-foreground dark:border-border dark:bg-card/30 rounded-lg border border-dashed p-8 text-center font-mono text-xs">
            {t("migration.historyEmpty")}
          </div>
        ) : (
          <div className="space-y-2">
            {historyData.items.map((record) => {
              const isExpanded = expandedHistoryId === record.id;
              return (
                <div
                  key={record.id}
                  className="border-border bg-background dark:border-border dark:bg-card/60 overflow-hidden rounded-lg border shadow-2xs transition-all"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                    <div className="flex items-center gap-2.5">
                      {/* Status Badge */}
                      <Badge
                        variant="outline"
                        className={cn(
                          "font-mono text-[10px] font-bold uppercase",
                          record.success
                            ? "border-primary/30 bg-success/10 text-success dark:text-success"
                            : "border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive",
                        )}
                      >
                        {record.success
                          ? t("migration.statusApplied")
                          : t("migration.statusFailed")}
                      </Badge>

                      {/* Info */}
                      <div className="font-mono text-xs">
                        <span className="text-foreground dark:text-foreground font-semibold">
                          {record.ddl
                            .trim()
                            .split(";")
                            .filter((s) => s.trim()).length || 1}{" "}
                          {t("migration.statementsUnit")}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground mr-1 flex items-center gap-1 font-mono text-[11px]">
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
                          className="border-warning/30 bg-warning/5 text-warning hover:bg-warning/15 dark:text-warning h-7 gap-1 px-2 font-mono text-[11px]"
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
                        className="text-muted-foreground hover:text-foreground h-7 px-2 font-mono text-[11px] dark:hover:text-white"
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
                    <div className="border-border bg-card dark:border-border dark:bg-card/80 space-y-2 border-t p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground font-mono text-[10px] font-semibold uppercase">
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
                              <Check className="text-success h-3 w-3" />
                              <span className="text-success">
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
                      <div className="border-border bg-code text-code-foreground overflow-x-auto rounded border p-2 font-mono text-xs">
                        <pre>{record.ddl}</pre>
                      </div>

                      {isExpanded && record.rollback_sql && (
                        <div className="space-y-1.5">
                          <p className="text-warning dark:text-warning font-mono text-[11px] font-semibold tracking-wider uppercase">
                            {t("migration.rollbackDdlLabel")}
                          </p>
                          <div className="border-warning/30 bg-warning/20 text-warning overflow-x-auto rounded border p-2.5 font-mono text-xs">
                            <pre>{record.rollback_sql}</pre>
                          </div>
                        </div>
                      )}

                      {record.error && (
                        <div className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/40 dark:text-destructive rounded border p-2 font-mono text-xs">
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
              <AlertTriangle className="text-warning h-4 w-4 shrink-0" />
              {t("migration.confirmRunTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground dark:text-muted-foreground font-mono text-xs">
              {t("migration.confirmRunDesc", {
                count: ddl.split(";").filter((s) => s.trim()).length || 1,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="border-border bg-code text-code-foreground max-h-48 overflow-y-auto rounded-md border p-3 font-mono text-xs">
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
              className="bg-primary hover:bg-primary/90 gap-1.5 font-mono text-xs font-semibold text-white"
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
            <AlertDialogTitle className="text-warning dark:text-warning flex items-center gap-2 font-mono text-base font-bold">
              <RotateCcw className="h-4 w-4 shrink-0" />
              {t("migration.confirmRollbackTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground dark:text-muted-foreground font-mono text-xs">
              {t("migration.confirmRollbackDesc", {
                id: confirmRollbackRecord?.id.slice(0, 8),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {confirmRollbackRecord?.rollback_sql && (
            <div className="border-border bg-code text-code-foreground max-h-48 overflow-y-auto rounded-md border p-3 font-mono text-xs">
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
              className="bg-warning hover:bg-warning gap-1.5 font-mono text-xs font-semibold text-white"
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
