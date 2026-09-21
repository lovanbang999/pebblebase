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
      className="rounded-none border-x-0 border-t-0 text-xs flex items-center justify-between font-mono py-2 px-4"
    >
      <div className="flex items-center gap-2 truncate min-w-0">
        <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
        <AlertDescription className="truncate text-xs font-mono">
          {message}
        </AlertDescription>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {onRetry && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
            className="h-6 px-2 text-xs border-rose-500/40 text-rose-300 hover:bg-rose-500/10 hover:text-rose-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
            <span>{t("common.retry", "Retry")}</span>
          </Button>
        )}
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={onDismiss}
          className="text-xs text-rose-400 hover:text-rose-100 p-0 h-auto underline cursor-pointer"
        >
          {t("app.dismiss")}
        </Button>
      </div>
    </Alert>
  );
};
