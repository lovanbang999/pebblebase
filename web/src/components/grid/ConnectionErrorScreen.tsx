import { useState, useCallback } from "react";
import type { FC } from "react";
import {
  Unplug,
  RefreshCw,
  SlidersHorizontal,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Server,
  Database,
  ShieldAlert,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { cn } from "cn";
import { parseDbError } from "@/lib/dbErrorParser";
import type { Connection } from "@/lib/types";

interface ConnectionErrorScreenProps {
  connection?: Connection | null;
  error?: string | null;
  onRetry: () => void | Promise<unknown>;
  isRetrying?: boolean;
  onEditConnection?: () => void;
}

const COPY_FEEDBACK_MS = 2000;

export const ConnectionErrorScreen: FC<ConnectionErrorScreenProps> = ({
  connection,
  error,
  onRetry,
  isRetrying = false,
  onEditConnection,
}) => {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);

  const parsed = parseDbError(error);

  const handleCopyError = useCallback(() => {
    if (!error) return;
    navigator.clipboard.writeText(error);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), COPY_FEEDBACK_MS);
  }, [error]);

  const categoryTitle = parsed
    ? t(parsed.categoryKey, parsed.defaultCategoryTitle)
    : t("diagnostics.category.generic", "Connection Failed");

  const summaryText = parsed
    ? t(parsed.shortSummaryKey, parsed.defaultSummary)
    : t(
        "diagnostics.summary.generic",
        "Unable to establish communication with the database.",
      );

  const suggestionText = parsed
    ? t(parsed.suggestionKey, parsed.defaultSuggestion)
    : t(
        "diagnostics.suggestion.generic",
        "Review your connection settings or verify the database service status.",
      );

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-zinc-50/50 select-none dark:bg-zinc-950">
      {/* Top Header Bar with Breadcrumb & Sidebar Toggle */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="flex items-center gap-2.5">
          <SidebarTrigger className="-ml-1 cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" />
          <Separator
            orientation="vertical"
            className="h-4 self-center bg-zinc-200 dark:bg-zinc-800"
          />
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {connection?.name ||
                t("diagnostics.unknownConnection", "Active Database")}
            </span>
            <Badge
              variant="outline"
              className="h-4 border-rose-500/30 bg-rose-500/10 px-1.5 py-0 font-mono text-[9px] font-semibold text-rose-600 dark:text-rose-400"
            >
              {categoryTitle}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onEditConnection && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onEditConnection}
              className="cursor-pointer gap-1.5 font-mono text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              <SlidersHorizontal className="size-3.5" />
              <span>{t("diagnostics.editConnection", "Edit Settings")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Main Focus Canvas */}
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-xl rounded-2xl border border-zinc-200/90 bg-white/95 p-6 shadow-xl backdrop-blur-md sm:p-8 dark:border-zinc-800/90 dark:bg-zinc-900/95">
          {/* Header Icon Badge */}
          <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl border border-rose-500/25 bg-rose-500/10 text-rose-600 shadow-sm dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-400">
            <Unplug className="size-8" />
          </div>

          {/* Heading */}
          <div className="text-center">
            <h2 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl dark:text-zinc-100">
              {t(
                "diagnostics.cannotConnectTitle",
                "Cannot Connect to Database",
              )}
            </h2>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {connection?.name ? (
                <span>
                  {t("diagnostics.failedToReach", "Pebblebase could not reach")}{" "}
                  <strong className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                    {connection.name}
                  </strong>
                  .
                </span>
              ) : (
                summaryText
              )}
            </p>
          </div>

          {/* Diagnostic Metadata Pills */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {parsed?.engine && (
              <Badge
                variant="outline"
                className="gap-1 border-zinc-200 bg-zinc-100/70 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300"
              >
                <Database className="size-3 text-zinc-500" />
                <span>{parsed.engine}</span>
              </Badge>
            )}

            {parsed?.host && (
              <Badge
                variant="outline"
                className="gap-1 border-zinc-200 bg-zinc-100/70 px-2 py-0.5 font-mono text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-300"
              >
                <Server className="size-3 text-zinc-500" />
                <span>
                  {parsed.host}
                  {parsed.port ? `:${parsed.port}` : ""}
                </span>
              </Badge>
            )}

            <Badge
              variant="outline"
              className="gap-1 border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 font-mono text-xs font-semibold text-rose-600 dark:text-rose-400"
            >
              <ShieldAlert className="size-3" />
              <span>{categoryTitle}</span>
            </Badge>
          </div>

          {/* Troubleshooting Hint Box */}
          <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left dark:border-amber-500/25 dark:bg-amber-500/10">
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <span className="font-mono text-xs font-bold">!</span>
              </div>
              <div className="space-y-1">
                <p className="font-mono text-[11px] font-semibold text-amber-700 uppercase dark:text-amber-300">
                  {t("diagnostics.suggestedSolution", "Suggested Resolution")}
                </p>
                <p className="text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {suggestionText}
                </p>
              </div>
            </div>
          </div>

          {/* Collapsible Technical Error Log */}
          {error && (
            <div className="mt-4 text-left">
              <button
                type="button"
                onClick={() => setShowTechnicalDetails((prev) => !prev)}
                className="flex w-full cursor-pointer items-center justify-between py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                <span className="font-mono text-[11px] font-medium">
                  {showTechnicalDetails
                    ? t(
                        "diagnostics.hideTechnicalDetails",
                        "Hide Technical Log",
                      )
                    : t(
                        "diagnostics.showTechnicalDetails",
                        "Show Technical Log",
                      )}
                </span>
                {showTechnicalDetails ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>

              {showTechnicalDetails && (
                <div className="animate-in fade-in mt-2 space-y-1.5 duration-150">
                  <div className="flex items-center justify-between px-0.5">
                    <span className="font-mono text-[10px] font-semibold text-zinc-400 uppercase">
                      {t("diagnostics.rawOutput", "Raw Backend Error")}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={handleCopyError}
                      className="h-5 gap-1 px-1.5 font-mono text-[10px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
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
                          <span>{t("common.copy", "Copy")}</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="max-h-32 overflow-y-auto rounded-lg border border-rose-200/80 bg-rose-50/60 p-3 font-mono text-[11px] leading-relaxed text-rose-700 select-text dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                    {error}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action CTAs */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              type="button"
              onClick={onRetry}
              disabled={isRetrying}
              className="cursor-pointer gap-2 bg-emerald-600 px-4 py-2 font-mono text-xs font-semibold text-white shadow-xs transition-all hover:bg-emerald-500 active:scale-95 disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              <RefreshCw
                className={cn("size-3.5", isRetrying && "animate-spin")}
              />
              <span>
                {isRetrying
                  ? t("diagnostics.retrying", "Retrying...")
                  : t("diagnostics.retryConnection", "Retry Connection")}
              </span>
            </Button>

            {onEditConnection && (
              <Button
                type="button"
                variant="outline"
                onClick={onEditConnection}
                className="cursor-pointer gap-2 border-zinc-200 bg-white px-4 py-2 font-mono text-xs font-semibold text-zinc-700 shadow-2xs transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                <SlidersHorizontal className="size-3.5 text-zinc-500" />
                <span>{t("diagnostics.editConnection", "Edit Settings")}</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
