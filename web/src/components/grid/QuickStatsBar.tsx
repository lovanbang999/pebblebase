import React from "react";
import { useTranslation } from "react-i18next";
import {
  Database,
  HardDrive,
  Columns,
  Filter,
  CheckCircle2,
  BarChart3,
} from "lucide-react";
import type { TableSchema, TableStats, ColumnSchema } from "@/lib/types";
import { formatBytes } from "@/constants";

interface QuickStatsBarProps {
  table: TableSchema;
  stats?: TableStats | null;
  totalFilteredRows?: number;
  isFiltered?: boolean;
  onOpenAnalytics?: (col?: ColumnSchema) => void;
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat().format(num);
}

export const QuickStatsBar: React.FC<QuickStatsBarProps> = ({
  table,
  stats,
  totalFilteredRows,
  isFiltered = false,
  onOpenAnalytics,
}) => {
  const { t } = useTranslation();

  const totalRows = stats?.total_rows ?? 0;
  const sizeBytes = stats?.size_bytes ?? 0;
  const isEstimated = stats?.estimated_rows ?? false;
  const pkCount = table.columns.filter((c) => c.is_primary_key).length;

  return (
    <div
      data-testid="quick-stats-bar"
      className="border-border bg-muted/90 dark:border-border/60 dark:bg-background/40 flex flex-wrap items-center justify-between gap-3 border-b px-3 py-1.5 font-mono text-xs transition-colors select-none"
    >
      {/* Left items: Table metrics */}
      <div className="text-muted-foreground dark:text-muted-foreground flex items-center gap-3">
        {/* Total rows */}
        <div
          className="flex items-center gap-1.5"
          title={t("analytics.totalRows")}
        >
          <Database className="text-primary dark:text-primary h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground dark:text-foreground translate-y-0.5 font-medium">
            {formatNumber(totalRows)}
          </span>
          <span className="text-muted-foreground dark:text-muted-foreground translate-y-0.5">
            {t("analytics.quickStats.rows")}
          </span>
          {isEstimated && (
            <span className="bg-muted text-muted-foreground dark:bg-muted/80 dark:text-muted-foreground translate-y-0.5 rounded px-1 py-0.5 text-[10px]">
              {t("analytics.quickStats.estimated")}
            </span>
          )}
        </div>

        <span
          className="bg-muted dark:bg-muted h-3.5 w-px shrink-0 self-center"
          aria-hidden="true"
        />

        {/* Table Size */}
        <div
          className="flex items-center gap-1.5"
          title={t("analytics.quickStats.size")}
        >
          <HardDrive className="text-success dark:text-success h-3.5 w-3.5 shrink-0" />
          <span className="text-muted-foreground dark:text-muted-foreground translate-y-0.5">
            {t("analytics.quickStats.size")}:
          </span>
          <span className="text-foreground dark:text-foreground translate-y-0.5 font-medium">
            {formatBytes(sizeBytes)}
          </span>
        </div>

        <span
          className="bg-muted dark:bg-muted h-3.5 w-px shrink-0 self-center"
          aria-hidden="true"
        />

        {/* Columns & PKs */}
        <div className="flex items-center gap-1.5">
          <Columns className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="text-foreground dark:text-foreground translate-y-0.5 font-medium">
            {table.columns.length}
          </span>
          <span className="text-muted-foreground dark:text-muted-foreground translate-y-0.5">
            {t("analytics.quickStats.columns")}
          </span>
          {pkCount > 0 && (
            <span className="border-warning/40 bg-warning/10 text-warning dark:text-warning inline-flex h-5 shrink-0 items-center justify-center rounded-full border px-2 font-mono text-[10px] font-medium">
              <span className="translate-y-px">
                {pkCount} {t("analytics.quickStats.pk")}
              </span>
            </span>
          )}
          {onOpenAnalytics && table.columns.length > 0 && (
            <button
              type="button"
              onClick={() => onOpenAnalytics(table.columns[0])}
              title={t("analytics.openAnalytics")}
              className="border-primary/30 bg-primary/10 text-primary hover:border-primary/50 hover:bg-primary/20 dark:text-primary/90 inline-flex h-5 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full border px-2.5 font-mono text-[10px] font-medium transition-colors"
            >
              <BarChart3 className="text-primary dark:text-primary h-3 w-3 shrink-0" />
              <span className="translate-y-px">
                {t("analytics.openAnalytics")}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Right items: Filter status */}
      <div className="flex items-center gap-2">
        {isFiltered ? (
          <div className="border-warning/30 bg-warning/10 text-warning dark:text-warning flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px]">
            <Filter className="h-3 w-3 shrink-0" />
            <span className="translate-y-[0.5px]">
              {t("analytics.quickStats.filtered")}:{" "}
              {formatNumber(totalFilteredRows ?? 0)} / {formatNumber(totalRows)}
            </span>
          </div>
        ) : (
          <div className="text-muted-foreground flex items-center gap-1 text-[11px]">
            <CheckCircle2 className="text-success dark:text-success/80 h-3 w-3 shrink-0" />
            <span className="translate-y-[0.5px]">
              {t("analytics.analyzingAll")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
