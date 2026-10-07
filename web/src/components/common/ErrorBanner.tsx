import { useState, useCallback } from "react";
import type { FC } from "react";
import {
  AlertCircle,
  RefreshCw,
  Unplug,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  SlidersHorizontal,
  X,
  Server,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import { parseDbError } from "@/lib/dbErrorParser";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
  onRetry?: () => void | Promise<unknown>;
  isRetrying?: boolean;
  activeConnectionName?: string;
  onEditConnection?: () => void;
}

const COPY_FEEDBACK_MS = 2000;

export const ErrorBanner: FC<ErrorBannerProps> = ({
  message,
  onDismiss,
  onRetry,
  isRetrying = false,
  activeConnectionName,
  onEditConnection,
}) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const parsed = parseDbError(message);

  const handleCopyError = useCallback(() => {
    if (!message) return;
    navigator.clipboard.writeText(message);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
  }, [message]);

  if (!message) return null;

  const categoryTitle = parsed
    ? t(parsed.categoryKey, parsed.defaultCategoryTitle)
    : t("common.error", "Error");

  const summaryText = parsed
    ? t(parsed.shortSummaryKey, parsed.defaultSummary)
    : message;

  const suggestionText = parsed
    ? t(parsed.suggestionKey, parsed.defaultSuggestion)
    : null;

  return (
    <div className="border-b border-rose-500/30 bg-rose-500/10 text-rose-900 shadow-xs dark:bg-rose-950/40 dark:text-rose-200">
      {/* Primary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 text-xs">
        {/* Left: Diagnostic Summary */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {parsed?.isConnectionError ? (
            <Unplug className="size-4 shrink-0 text-rose-500 dark:text-rose-400" />
          ) : (
            <AlertCircle className="size-4 shrink-0 text-rose-500 dark:text-rose-400" />
          )}

          {/* Diagnostic Badge */}
          <Badge
            variant="outline"
            className="h-4.5 shrink-0 border-rose-500/35 bg-rose-500/15 px-1.5 py-0 font-mono text-[10px] font-semibold text-rose-600 dark:text-rose-300"
          >
            {categoryTitle}
          </Badge>

          {/* Host & Port Badge */}
          {parsed?.host && (
            <Badge
              variant="outline"
              className="hidden h-4.5 shrink-0 items-center gap-1 border-rose-500/25 bg-rose-500/10 px-1.5 py-0 font-mono text-[10px] text-rose-700 sm:flex dark:text-rose-300"
            >
              <Server className="size-2.5" />
              <span>
                {parsed.host}
                {parsed.port ? `:${parsed.port}` : ""}
              </span>
            </Badge>
          )}

          {/* Context Name & Summary */}
          <span className="truncate font-mono text-xs text-rose-800 dark:text-rose-200">
            {activeConnectionName && (
              <strong className="font-semibold">
                {activeConnectionName}:{" "}
              </strong>
            )}
            {summaryText}
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Details / Troubleshooting Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="h-6 cursor-pointer gap-1 px-2 font-mono text-[11px] text-rose-700 hover:bg-rose-500/15 hover:text-rose-900 dark:text-rose-300 dark:hover:bg-rose-500/20 dark:hover:text-rose-100"
          >
            <span>
              {isExpanded
                ? t("diagnostics.hideDetails", "Hide Details")
                : t("diagnostics.showDetails", "Details")}
            </span>
            {isExpanded ? (
              <ChevronUp className="size-3" />
            ) : (
              <ChevronDown className="size-3" />
            )}
          </Button>

          {/* Edit Connection Button */}
          {onEditConnection && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onEditConnection}
              className="h-6 cursor-pointer gap-1 border-rose-500/40 bg-white/60 px-2 font-mono text-[11px] text-rose-800 hover:bg-white dark:border-rose-500/40 dark:bg-zinc-900/60 dark:text-rose-200 dark:hover:bg-zinc-900"
            >
              <SlidersHorizontal className="size-3" />
              <span>{t("diagnostics.editConnection", "Edit")}</span>
            </Button>
          )}

          {/* Retry Button */}
          {onRetry && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onRetry}
              disabled={isRetrying}
              className="h-6 cursor-pointer gap-1 border-rose-500/40 bg-white/60 px-2.5 font-mono text-[11px] font-semibold text-rose-800 transition-colors hover:bg-white disabled:opacity-50 dark:border-rose-500/40 dark:bg-zinc-900/60 dark:text-rose-200 dark:hover:bg-zinc-900"
            >
              <RefreshCw
                className={cn("size-3", isRetrying && "animate-spin")}
              />
              <span>{t("common.retry", "Retry")}</span>
            </Button>
          )}

          {/* Dismiss Button */}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onDismiss}
            aria-label={t("app.dismiss", "Dismiss")}
            className="size-6 cursor-pointer rounded-full p-0 text-rose-600 hover:bg-rose-500/20 hover:text-rose-900 dark:text-rose-400 dark:hover:text-rose-100"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded Troubleshooting & Raw Log Drawer */}
      {isExpanded && (
        <div className="animate-in slide-in-from-top-1 border-t border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs duration-150 dark:bg-rose-950/20">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* Suggested Solution */}
            {suggestionText && (
              <div className="flex-1 space-y-1">
                <p className="font-mono text-[10px] font-semibold tracking-wider text-rose-700 uppercase dark:text-rose-300">
                  ⚡{" "}
                  {t("diagnostics.suggestedSolution", "Suggested Resolution")}
                </p>
                <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {suggestionText}
                </p>
              </div>
            )}

            {/* Copy Action */}
            <div className="shrink-0 self-end sm:self-auto">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={handleCopyError}
                className="h-6 cursor-pointer gap-1 border-zinc-300 bg-white px-2 font-mono text-[10px] text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {isCopied ? (
                  <>
                    <Check className="size-3 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {t("common.copied", "Copied!")}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>
                      {t("diagnostics.copyTechnicalLog", "Copy Full Error")}
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Raw Error Codebox */}
          <div className="mt-2.5 max-h-28 overflow-y-auto rounded-md border border-rose-500/20 bg-white/70 p-2.5 font-mono text-[11px] leading-relaxed text-rose-900 select-text dark:bg-zinc-950/60 dark:text-rose-300">
            {message}
          </div>
        </div>
      )}
    </div>
  );
};
