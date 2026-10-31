import { useEffect, useMemo, useRef, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Settings2, Sparkles, X } from "lucide-react";
import type { Connection, TableSchema } from "@/lib/types";
import { queryAssist } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface AIAssistantPanelProps {
  connection?: Connection;
  tables: TableSchema[];
  currentQuery?: string;
  onReviewQuery: (query: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export const AIAssistantPanel: FC<AIAssistantPanelProps> = ({
  connection,
  tables,
  currentQuery,
  onReviewQuery,
  onOpenSettings,
  onClose,
}) => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{
    query: string;
    explanation: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const schema = useMemo(
    () =>
      tables.slice(0, 30).map((table) => ({
        name: table.name,
        columns: table.columns.map(
          (column) => `${column.name} (${column.type})`,
        ),
        primary_keys: table.columns
          .filter((column) => column.is_primary_key)
          .map((column) => column.name),
        foreign_keys: (table.relations || []).map(
          (relation) =>
            `${relation.from_column} -> ${relation.to_table}.${relation.to_column}`,
        ),
      })),
    [tables],
  );

  const generate = async () => {
    if (!connection || !prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    try {
      const response = await queryAssist({
        mode: "generate",
        engine: connection.type,
        prompt: prompt.trim(),
        current_query: currentQuery,
        schema,
      });
      setResult(response);
    } catch {
      setError(
        t(
          "operations.aiFailed",
          "AI could not generate a query. Check provider settings and try again.",
        ),
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-assistant-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
          document.getElementById("ai-assistant-trigger")?.focus();
        }
      }}
      className="border-border bg-background fixed top-[calc(var(--titlebar-height)+8px)] right-11 z-[70] flex h-[min(72dvh,640px)] w-[min(400px,calc(100vw-56px))] flex-col overflow-hidden rounded-lg border shadow-xl"
    >
      <header className="border-border flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Sparkles className="text-primary size-4" />
        <h2
          id="ai-assistant-title"
          ref={headingRef}
          tabIndex={-1}
          className="flex-1 text-xs font-semibold"
        >
          {t("operations.aiAssistant", "AI query assistant")}
        </h2>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onOpenSettings}
          aria-label={t("ai.settingsTitle", "AI settings")}
          title={t("ai.settingsTitle", "AI settings")}
        >
          <Settings2 className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            onClose();
            document.getElementById("ai-assistant-trigger")?.focus();
          }}
          aria-label={t("common.close", "Close")}
        >
          <X className="size-3.5" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
        <p className="text-muted-foreground text-[11px]">
          {connection
            ? t("operations.aiContext", {
                name: connection.name,
                defaultValue:
                  "Using schema from {{name}}. Generated queries are drafts and will not run automatically.",
              })
            : t(
                "operations.aiNoConnection",
                "Select a connection to generate a query.",
              )}
        </p>
        {connection?.type === "redis" && (
          <p className="border-warning/30 bg-warning/10 text-warning dark:border-warning dark:bg-warning/30 dark:text-warning rounded border p-2 text-xs">
            {t(
              "operations.aiUnsupportedRedis",
              "Query generation is unavailable for Redis command workflows.",
            )}
          </p>
        )}
        {connection && connection.type !== "redis" && (
          <>
            <label htmlFor="ai-draft-prompt" className="text-xs font-medium">
              {t("operations.aiPrompt", "Describe the query")}
            </label>
            <textarea
              id="ai-draft-prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
                  event.preventDefault();
                  void generate();
                }
              }}
              rows={4}
              className="border-border bg-background focus-visible:ring-primary w-full resize-y rounded-md border p-2 text-xs outline-none focus-visible:ring-2"
              placeholder={t("ai.askAiPlaceholder")}
            />
            <Button
              size="sm"
              className="w-full"
              onClick={() => void generate()}
              disabled={!prompt.trim() || isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="mr-2 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-2 size-3.5" />
              )}
              {isGenerating ? t("ai.generating") : t("ai.generate")}
            </Button>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}
        {result && (
          <div className="border-border space-y-2 border-t pt-3">
            <div className="text-xs font-semibold">
              {t("operations.aiDraft", "Generated draft")}
            </div>
            <pre className="bg-muted max-h-64 overflow-auto rounded-md p-2 font-mono text-[11px] whitespace-pre-wrap">
              {result.query}
            </pre>
            <p className="text-muted-foreground text-[11px]">
              {result.explanation}
            </p>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => onReviewQuery(result.query)}
            >
              {t("operations.reviewInConsole", "Review in query console")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
