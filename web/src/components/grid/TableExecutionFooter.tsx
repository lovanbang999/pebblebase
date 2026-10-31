import type { FC } from "react";
import { Activity } from "lucide-react";

interface TableExecutionFooterProps {
  from: number;
  to: number;
  total: number;
  queryTimeMs?: number;
  isLoading: boolean;
  t: (key: string, options?: any) => string;
}

export const TableExecutionFooter: FC<TableExecutionFooterProps> = ({
  from,
  to,
  total,
  queryTimeMs,
  isLoading,
  t,
}) => (
  <footer className="border-border bg-card/80 text-muted-foreground dark:border-border dark:bg-card/40 flex h-7 shrink-0 items-center gap-3 border-t px-3 text-[11px]">
    <span>
      {from === 0
        ? t("datagrid.zeroRows", "0 rows")
        : t("datagrid.rowRange", {
            from,
            to,
            total,
            defaultValue: "{{from}}–{{to}} of {{total}} rows",
          })}
    </span>
    <span className="flex-1" />
    {isLoading ? (
      <span className="animate-pulse">
        {t("datagrid.loadingRows", "Loading rows…")}
      </span>
    ) : (
      queryTimeMs !== undefined && (
        <span className="inline-flex items-center gap-1">
          <Activity className="size-3" />
          {t("datagrid.serverQueryTime", {
            time: queryTimeMs.toFixed(2),
            defaultValue: "Server query {{time}} ms",
          })}
        </span>
      )
    )}
  </footer>
);
