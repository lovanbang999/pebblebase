import { useState, useEffect, useMemo, useCallback, type FC } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import {
  Sparkles,
  Copy,
  Check,
  Terminal,
  RefreshCw,
  Layers,
  AlertCircle,
} from "lucide-react";
import { generateSeedSQL } from "@/lib/api";
import type { SeedSQLResponse } from "@/lib/types";
import { SEED_CONFIG, COPY_FEEDBACK_MS } from "@/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

interface SeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  connId?: string;
  tableName: string;
  engine?: string;
  onRunInConsole?: (sql: string, title?: string) => void;
}

export const SeedModal: FC<SeedModalProps> = ({
  isOpen,
  onClose,
  connId,
  tableName,
  engine = "postgres",
  onRunInConsole,
}) => {
  const { t } = useTranslation();
  const [count, setCount] = useState<number>(SEED_CONFIG.DEFAULT_COUNT);
  const [isGenerating, setIsGenerating] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedSQLResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isDark = document.documentElement.classList.contains("dark");

  const sqlExtensions = useMemo(() => {
    const dialect =
      engine === "mysql" ? MySQL : engine === "sqlite" ? SQLite : PostgreSQL;
    return [sql({ dialect })];
  }, [engine]);

  const handleGenerate = useCallback(async () => {
    if (!connId || !tableName) return;
    try {
      setIsGenerating(true);
      setError(null);
      const res = await generateSeedSQL(connId, {
        table: tableName,
        count: Math.max(SEED_CONFIG.MIN_COUNT, Math.min(count, SEED_CONFIG.MAX_COUNT)),
      });
      setSeedResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to generate seed SQL");
    } finally {
      setIsGenerating(false);
    }
  }, [connId, tableName, count]);

  // Automatically generate 10 rows on initial open
  useEffect(() => {
    if (isOpen && connId && tableName) {
      handleGenerate();
    } else if (!isOpen) {
      setSeedResult(null);
      setError(null);
      setCopied(false);
    }
  }, [isOpen, connId, tableName]);

  const handleCopy = () => {
    if (!seedResult?.sql) return;
    navigator.clipboard.writeText(seedResult.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  };

  const handleRunConsole = () => {
    if (!seedResult?.sql || !onRunInConsole) return;
    onRunInConsole(seedResult.sql, `Seed ${tableName}`);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[92vw] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl p-0 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <DialogHeader className="p-4 md:p-5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold font-mono tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                  <span>{t("seed.title")}</span>
                  <Badge
                    variant="outline"
                    className="font-mono text-[11px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20"
                  >
                    {tableName}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {t("seed.description")}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-4 md:p-5 space-y-4 overflow-y-auto flex-1">
          {/* Controls bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40">
            <div className="flex items-center gap-2">
              <label
                htmlFor="seed-count"
                className="text-xs font-mono font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap"
              >
                {t("seed.count")}
              </label>
              <Input
                id="seed-count"
                type="number"
                min={SEED_CONFIG.MIN_COUNT}
                max={SEED_CONFIG.MAX_COUNT}
                value={count}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setCount(
                    isNaN(val)
                      ? SEED_CONFIG.MIN_COUNT
                      : Math.max(SEED_CONFIG.MIN_COUNT, Math.min(val, SEED_CONFIG.MAX_COUNT)),
                  );
                }}
                className="w-24 h-8 text-xs font-mono"
              />
              <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono">
                {t("seed.countHelp")}
              </span>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-8 px-3.5 font-mono text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer"
            >
              <RefreshCw
                className={cn("w-3.5 h-3.5", isGenerating && "animate-spin")}
              />
              <span>{isGenerating ? t("seed.generating") : t("seed.generate")}</span>
            </Button>
          </div>

          {/* Error notice */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 font-mono">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Seed Preview info */}
          {seedResult && (
            <div className="space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  <Layers className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="font-semibold text-zinc-900 dark:text-zinc-200">
                    {t("seed.tablesIncluded")}
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {seedResult.tables_seeded.map((tbl, i) => (
                      <span key={tbl} className="inline-flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-mono text-[10px] px-1.5 py-0 h-4",
                            tbl === tableName
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-bold"
                              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700",
                          )}
                        >
                          {tbl}
                        </Badge>
                        {i < seedResult.tables_seeded.length - 1 && (
                          <span className="text-zinc-400 text-xs">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <span className="text-[11px] font-mono text-zinc-400">
                  {t("seed.preview")}
                </span>
              </div>

              {/* CodeMirror preview */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-inner text-xs">
                <CodeMirror
                  value={seedResult.sql}
                  height="340px"
                  extensions={sqlExtensions}
                  theme={isDark ? "dark" : "light"}
                  readOnly={true}
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    autocompletion: false,
                    highlightActiveLine: false,
                  }}
                  className="font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 md:p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 px-3 font-mono text-xs cursor-pointer"
          >
            Close
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={!seedResult?.sql}
              className={cn(
                "h-8 px-3 font-mono text-xs gap-1.5 cursor-pointer transition-colors",
                copied && "border-emerald-500 text-emerald-600 dark:text-emerald-400",
              )}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{t("seed.copied")}</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{t("seed.copy")}</span>
                </>
              )}
            </Button>

            {onRunInConsole && (
              <Button
                type="button"
                size="sm"
                onClick={handleRunConsole}
                disabled={!seedResult?.sql}
                className="h-8 px-3.5 font-mono text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>{t("seed.run")}</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
