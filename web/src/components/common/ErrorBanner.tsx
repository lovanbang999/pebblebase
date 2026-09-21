import type { FC } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
  onRetry?: () => void | Promise<void>;
  isRetrying?: boolean;
}

export const ErrorBanner: FC<ErrorBannerProps> = ({
  message,
  onDismiss,
  onRetry,
  isRetrying = false,
}) => {
  const { t } = useTranslation();

  if (!message) return null;

  return (
    <Alert
      variant="destructive"
      className="flex items-center justify-between rounded-none border-x-0 border-t-0 px-4 py-2 font-mono text-xs"
    >
      <div className="flex min-w-0 items-center gap-2 truncate">
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <AlertDescription className="truncate font-mono text-xs">
          {message}
        </AlertDescription>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-3">
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="flex h-6 cursor-pointer items-center gap-1.5 border-rose-500/40 px-2 text-xs text-rose-300 transition-colors hover:bg-rose-500/10 hover:text-rose-100 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3 w-3 ${isRetrying ? "animate-spin" : ""}`}
            />
            <span>{t("common.retry", "Retry")}</span>
          </Button>
        )}
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onDismiss}
          className="h-auto cursor-pointer p-0 text-xs text-rose-400 underline hover:text-rose-100"
        >
          {t("app.dismiss")}
        </Button>
      </div>
    </Alert>
  );
};
