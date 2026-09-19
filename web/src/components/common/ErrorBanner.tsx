import type { FC } from "react";
import { AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export const ErrorBanner: FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  const { t } = useTranslation();

  if (!message) return null;

  return (
    <Alert
      variant="destructive"
      className="rounded-none border-x-0 border-t-0 text-xs flex items-center justify-between font-mono py-2 px-4"
    >
      <div className="flex items-center gap-2 truncate">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <AlertDescription className="truncate text-xs font-mono">
          {message}
        </AlertDescription>
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={onDismiss}
        className="text-xs text-rose-400 hover:text-rose-100 p-0 h-auto underline ml-4 shrink-0"
      >
        {t("app.dismiss")}
      </Button>
    </Alert>
  );
};
