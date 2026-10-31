import { AlertTriangle, Loader2, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Connection } from "@/lib/types";
import packageJson from "../../../package.json";

interface StatusBarProps {
  connection: Connection | null;
  isLoading: boolean;
  hasError: boolean;
  tableName?: string | null;
}

export function StatusBar({
  connection,
  isLoading,
  hasError,
  tableName,
}: StatusBarProps) {
  const { t } = useTranslation();
  const status = isLoading
    ? t("studio.loading")
    : hasError
      ? t("studio.error")
      : t("studio.ready");
  return (
    <footer
      aria-label={t("studio.statusBar")}
      className="border-border bg-card text-muted-foreground flex h-6 min-w-0 shrink-0 items-center gap-3 border-t px-2 text-[11px]"
    >
      <span className="flex max-w-[40%] min-w-0 items-center gap-1.5 truncate">
        {isLoading ? (
          <Loader2
            aria-hidden="true"
            className="size-3 shrink-0 animate-spin"
          />
        ) : hasError ? (
          <AlertTriangle
            aria-hidden="true"
            className="text-destructive size-3 shrink-0"
          />
        ) : (
          <span
            aria-hidden="true"
            className="bg-muted-foreground size-1.5 shrink-0 rounded-full"
          />
        )}
        <span className="truncate">
          {connection?.name || t("sidebar.noActiveConn")}
        </span>
      </span>
      {connection?.read_only && (
        <span className="flex shrink-0 items-center gap-1 text-[var(--studio-warning)]">
          <ShieldAlert aria-hidden="true" className="size-3" />
          {t("studio.readOnly")}
        </span>
      )}
      {connection?.environment === "production" && (
        <span className="text-destructive shrink-0 font-semibold">
          {t("studio.production")}
        </span>
      )}
      <span
        role="status"
        className="border-border min-w-0 truncate border-l pl-3"
      >
        {status}
        {tableName ? ` · ${tableName}` : ""}
      </span>
      <div className="flex-1" />
      <span className="hidden shrink-0 sm:inline">UTF-8</span>
      <span className="shrink-0 font-mono">v{packageJson.version}</span>
    </footer>
  );
}
