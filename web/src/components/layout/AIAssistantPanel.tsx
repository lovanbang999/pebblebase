import { useEffect, useRef, useState, type FC } from "react";
import { useTranslation } from "react-i18next";
import {
  Clipboard,
  Loader2,
  Paperclip,
  Settings2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import type { Connection, TableSchema } from "@/lib/types";
import { fetchAIConfigured, queryAssist } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { buildAIContext } from "@/lib/aiContext";

interface AIAssistantPanelProps {
  connection?: Connection;
  tables: TableSchema[];
  resultRows?: Record<string, unknown>[];
  onReviewQuery: (query: string) => void;
  onOpenSettings: () => void;
  onClose: () => void;
}

export const AIAssistantPanel: FC<AIAssistantPanelProps> = ({
  connection,
  tables,
  resultRows = [],
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
  const [conversation, setConversation] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [attached, setAttached] = useState(false);
  const [hasProvider, setHasProvider] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(400);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);
  const schema = tables.slice(0, 1);

  useEffect(() => {
    let mounted = true;
    fetchAIConfigured()
      .then((configured) => mounted && setHasProvider(configured))
      .catch(() => mounted && setHasProvider(false));
    return () => {
      mounted = false;
    };
  }, []);

  const generate = async () => {
    if (!connection || !prompt.trim() || isGenerating || hasProvider === false)
      return;
    setIsGenerating(true);
    setError(null);
    setResult(null);
    try {
      const priorConversation = conversation
        .map((turn) => `${turn.role}: ${turn.content}`)
        .join("\n\n");
      const request = buildAIContext({
        engine: connection.type,
        connectionName: connection.name,
        prompt: [priorConversation, prompt.trim()].filter(Boolean).join("\n\n"),
        schema,
        attachedResult: attached ? resultRows : undefined,
      });
      const response = await queryAssist(request);
      setResult(response);
      setConversation((turns) => [
        ...turns,
        { role: "user", content: prompt.trim() },
        {
          role: "assistant",
          content: `${response.query}\n\n${response.explanation}`,
        },
      ]);
      setPrompt("");
    } catch {
      setError(
        t(
          "operations.aiFailed",
          "AI request failed. Check provider settings and try again.",
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
      style={{ width: `min(${width}px, calc(100vw - 56px))` }}
      className="border-border bg-background fixed top-[calc(var(--titlebar-height)+8px)] right-11 z-[70] flex h-[min(72dvh,640px)] flex-col overflow-hidden rounded-lg border shadow-xl"
    >
      <div
        role="separator"
        aria-label={t("operations.resizeAI", "Resize AI panel")}
        aria-orientation="vertical"
        aria-valuemin={280}
        aria-valuemax={560}
        aria-valuenow={width}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setWidth((current) =>
              Math.max(
                280,
                Math.min(560, current + (event.key === "ArrowLeft" ? 16 : -16)),
              ),
            );
          } else if (event.key === "Home") {
            event.preventDefault();
            setWidth(280);
          } else if (event.key === "End") {
            event.preventDefault();
            setWidth(560);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          resizeStart.current = { x: event.clientX, width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!resizeStart.current) return;
          setWidth(
            Math.max(
              280,
              Math.min(
                560,
                resizeStart.current.width +
                  resizeStart.current.x -
                  event.clientX,
              ),
            ),
          );
        }}
        onPointerUp={() => {
          resizeStart.current = null;
        }}
        onPointerCancel={() => {
          resizeStart.current = null;
        }}
        className="hover:bg-primary/40 focus-visible:bg-primary/60 absolute inset-y-1 left-0 z-10 w-2 cursor-col-resize touch-none outline-none"
      />
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
            {hasProvider === false && (
              <p
                role="status"
                className="border-warning/40 bg-warning/10 rounded border p-2 text-xs"
              >
                {t(
                  "operations.aiNotConfigured",
                  "No AI provider and API key are configured. Ask an administrator to configure one in Settings.",
                )}
              </p>
            )}
            <p className="text-muted-foreground text-[10px]">
              {t(
                "operations.aiPrivacy",
                "Requests include your prompt, the active connection engine/name, and the selected table schema only. Result rows are excluded unless you attach them.",
              )}
            </p>
            {resultRows.length > 0 && (
              <Button
                size="xs"
                variant={attached ? "secondary" : "outline"}
                onClick={() => setAttached((value) => !value)}
              >
                <Paperclip className="mr-1 size-3" />
                {attached
                  ? t(
                      "operations.aiResultAttached",
                      "Result attached (up to 20 rows)",
                    )
                  : t("operations.aiAttachResult", "Attach current result")}
              </Button>
            )}
            {conversation.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setConversation([]);
                  setResult(null);
                  setError(null);
                }}
              >
                <Trash2 className="mr-1 size-3" />
                {t("operations.aiClear", "Clear conversation")}
              </Button>
            )}
            <div aria-live="polite" className="space-y-2">
              {conversation.map((turn, index) => (
                <div
                  key={`${turn.role}-${index}`}
                  className={`rounded-md p-2 text-xs whitespace-pre-wrap ${turn.role === "user" ? "bg-muted" : "border-border border"}`}
                >
                  <strong className="mb-1 block text-[10px] uppercase">
                    {turn.role}
                  </strong>
                  {turn.content}
                </div>
              ))}
            </div>
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
              disabled={!prompt.trim() || isGenerating || hasProvider === false}
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
              {t("operations.reviewInConsole", "Insert into console")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="w-full"
              onClick={() => void navigator.clipboard?.writeText(result.query)}
            >
              <Clipboard className="mr-2 size-3.5" />
              {t("common.copy", "Copy")}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};
