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
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/10 text-destructive dark:bg-destructive/40 dark:text-destructive shrink-0 border-b shadow-xs"
    >
      {/* Primary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 text-xs">
        {/* Left: Diagnostic Summary */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {parsed?.isConnectionError ? (
            <Unplug className="text-destructive dark:text-destructive size-4 shrink-0" />
          ) : (
            <AlertCircle className="text-destructive dark:text-destructive size-4 shrink-0" />
          )}

          {/* Diagnostic Badge */}
          <Badge
            variant="outline"
            className="border-destructive/35 bg-destructive/15 text-destructive dark:text-destructive h-4.5 shrink-0 px-1.5 py-0 font-mono text-[10px] font-semibold"
          >
            {categoryTitle}
          </Badge>

          {/* Host & Port Badge */}
          {parsed?.host && (
            <Badge
              variant="outline"
              className="border-destructive/25 bg-destructive/10 text-destructive dark:text-destructive hidden h-4.5 shrink-0 items-center gap-1 px-1.5 py-0 font-mono text-[10px] sm:flex"
            >
              <Server className="size-2.5" />
              <span>
                {parsed.host}
                {parsed.port ? `:${parsed.port}` : ""}
              </span>
            </Badge>
          )}

          {/* Context Name & Summary */}
          <span className="text-destructive dark:text-destructive min-w-0 text-sm break-words">
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
            className="text-destructive hover:bg-destructive/15 hover:text-destructive dark:text-destructive dark:hover:bg-destructive/20 dark:hover:text-destructive h-6 cursor-pointer gap-1 px-2 font-mono text-[11px]"
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
              className="border-destructive/40 bg-background/60 text-destructive hover:bg-background dark:border-destructive/40 dark:bg-card/60 dark:text-destructive dark:hover:bg-muted h-6 cursor-pointer gap-1 px-2 font-mono text-[11px]"
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
              className="border-destructive/40 bg-background/60 text-destructive hover:bg-background dark:border-destructive/40 dark:bg-card/60 dark:text-destructive dark:hover:bg-muted h-6 cursor-pointer gap-1 px-2.5 font-mono text-[11px] font-semibold transition-colors disabled:opacity-50"
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
            className="text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-destructive dark:hover:text-destructive size-6 cursor-pointer rounded-full p-0"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded Troubleshooting & Raw Log Drawer */}
      {isExpanded && (
        <div className="animate-in slide-in-from-top-1 border-destructive/20 bg-destructive/5 dark:bg-destructive/20 border-t px-4 py-3 text-xs duration-150">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            {/* Suggested Solution */}
            {suggestionText && (
              <div className="flex-1 space-y-1">
                <p className="text-destructive dark:text-destructive font-mono text-[10px] font-semibold tracking-wider uppercase">
                  ⚡{" "}
                  {t("diagnostics.suggestedSolution", "Suggested Resolution")}
                </p>
                <p className="text-foreground dark:text-muted-foreground text-xs leading-relaxed">
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
                className="border-border bg-background text-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted h-6 cursor-pointer gap-1 px-2 font-mono text-[10px]"
              >
                {isCopied ? (
                  <>
                    <Check className="text-success size-3" />
                    <span className="text-success dark:text-success">
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
          <div className="border-destructive/20 bg-background/70 text-destructive dark:bg-card/60 dark:text-destructive mt-2.5 max-h-28 overflow-y-auto rounded-md border p-2.5 font-mono text-[11px] leading-relaxed select-text">
            {message}
          </div>
        </div>
      )}
    </div>
  );
};
