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
        count: Math.max(
          SEED_CONFIG.MIN_COUNT,
          Math.min(count, SEED_CONFIG.MAX_COUNT),
        ),
      });
      setSeedResult(res);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to generate seed SQL",
      );
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
      <DialogContent className="border-border bg-background dark:border-border dark:bg-card flex max-h-[90vh] w-[92vw] max-w-3xl flex-col overflow-hidden rounded-xl border p-0 shadow-2xl">
        {/* Header */}
        <DialogHeader className="border-border bg-card/50 dark:border-border dark:bg-card/30 border-b p-4 md:p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="border-primary/20 bg-success/10 text-success dark:text-success rounded-lg border p-2">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-foreground dark:text-foreground flex items-center gap-2 font-mono text-base font-bold tracking-tight">
                  <span>{t("seed.title")}</span>
                  <Badge
                    variant="outline"
                    className="border-primary/20 bg-success/10 text-success dark:text-success font-mono text-[11px]"
                  >
                    {tableName}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-xs">
                  {t("seed.description")}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
          {/* Controls bar */}
          <div className="border-border bg-card/60 dark:border-border dark:bg-card/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <label
                htmlFor="seed-count"
                className="text-foreground dark:text-muted-foreground font-mono text-xs font-medium whitespace-nowrap"
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
                      : Math.max(
                          SEED_CONFIG.MIN_COUNT,
                          Math.min(val, SEED_CONFIG.MAX_COUNT),
                        ),
                  );
                }}
                className="h-8 w-24 font-mono text-xs"
              />
              <span className="text-muted-foreground dark:text-muted-foreground font-mono text-[11px]">
                {t("seed.countHelp")}
              </span>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="bg-primary hover:bg-primary/90 h-8 cursor-pointer gap-1.5 px-3.5 font-mono text-xs font-semibold text-white shadow-xs"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isGenerating && "animate-spin")}
              />
              <span>
                {isGenerating ? t("seed.generating") : t("seed.generate")}
              </span>
            </Button>
          </div>

          {/* Error notice */}
          {error && (
            <div className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/40 dark:text-destructive flex items-center gap-2 rounded-lg border p-3 font-mono text-xs">
              <AlertCircle className="text-destructive h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Seed Preview info */}
          {seedResult && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-muted-foreground dark:text-muted-foreground flex items-center gap-1.5 font-mono text-xs">
                  <Layers className="text-success h-3.5 w-3.5 shrink-0" />
                  <span className="text-foreground dark:text-foreground font-semibold">
                    {t("seed.tablesIncluded")}
                  </span>
                  <div className="flex flex-wrap items-center gap-1">
                    {seedResult.tables_seeded.map((tbl, i) => (
                      <span
                        key={tbl}
                        className="inline-flex items-center gap-1"
                      >
                        <Badge
                          variant="outline"
                          className={cn(
                            "h-4 px-1.5 py-0 font-mono text-[10px]",
                            tbl === tableName
                              ? "border-primary/30 bg-success/15 text-success dark:text-success font-bold"
                              : "border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground",
                          )}
                        >
                          {tbl}
                        </Badge>
                        {i < seedResult.tables_seeded.length - 1 && (
                          <span className="text-muted-foreground text-xs">
                            →
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>

                <span className="text-muted-foreground font-mono text-[11px]">
                  {t("seed.preview")}
                </span>
              </div>

              {/* CodeMirror preview */}
              <div className="border-border dark:border-border overflow-hidden rounded-lg border text-xs shadow-inner">
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
        <div className="border-border bg-card/50 dark:border-border dark:bg-card/30 flex items-center justify-between gap-2 border-t p-3 md:p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="h-8 cursor-pointer px-3 font-mono text-xs"
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
                "h-8 cursor-pointer gap-1.5 px-3 font-mono text-xs transition-colors",
                copied && "border-primary text-success dark:text-success",
              )}
            >
              {copied ? (
                <>
                  <Check className="text-success h-3.5 w-3.5" />
                  <span>{t("seed.copied")}</span>
                </>
              ) : (
                <>
                  <Copy className="text-muted-foreground h-3.5 w-3.5" />
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
                className="bg-primary hover:bg-primary/90 h-8 cursor-pointer gap-1.5 px-3.5 font-mono text-xs font-semibold text-white shadow-xs"
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>{t("seed.run")}</span>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
