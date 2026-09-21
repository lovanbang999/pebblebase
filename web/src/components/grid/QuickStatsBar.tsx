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
      className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-zinc-100/90 px-3 py-1.5 font-mono text-xs transition-colors select-none dark:border-zinc-800/60 dark:bg-zinc-950/40"
    >
      {/* Left items: Table metrics */}
      <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
        {/* Total rows */}
        <div
          className="flex items-center gap-1.5"
          title={t("analytics.totalRows")}
        >
          <Database className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
          <span className="translate-y-0.5 font-medium text-zinc-900 dark:text-zinc-200">
            {formatNumber(totalRows)}
          </span>
          <span className="translate-y-0.5 text-zinc-500 dark:text-zinc-500">
            {t("analytics.quickStats.rows")}
          </span>
          {isEstimated && (
            <span className="translate-y-0.5 rounded bg-zinc-200 px-1 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-500">
              {t("analytics.quickStats.estimated")}
            </span>
          )}
        </div>

        <span
          className="h-3.5 w-px shrink-0 self-center bg-zinc-300 dark:bg-zinc-800"
          aria-hidden="true"
        />

        {/* Table Size */}
        <div
          className="flex items-center gap-1.5"
          title={t("analytics.quickStats.size")}
        >
          <HardDrive className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="translate-y-0.5 text-zinc-500 dark:text-zinc-500">
            {t("analytics.quickStats.size")}:
          </span>
          <span className="translate-y-0.5 font-medium text-zinc-900 dark:text-zinc-200">
            {formatBytes(sizeBytes)}
          </span>
        </div>

        <span
          className="h-3.5 w-px shrink-0 self-center bg-zinc-300 dark:bg-zinc-800"
          aria-hidden="true"
        />

        {/* Columns & PKs */}
        <div className="flex items-center gap-1.5">
          <Columns className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
          <span className="translate-y-0.5 font-medium text-zinc-900 dark:text-zinc-200">
            {table.columns.length}
          </span>
          <span className="translate-y-0.5 text-zinc-500 dark:text-zinc-500">
            {t("analytics.quickStats.columns")}
          </span>
          {pkCount > 0 && (
            <span className="inline-flex h-5 shrink-0 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 font-mono text-[10px] font-medium text-amber-700 dark:text-amber-400">
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
              className="inline-flex h-5 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 font-mono text-[10px] font-medium text-indigo-700 transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/20 dark:text-indigo-400/90"
            >
              <BarChart3 className="h-3 w-3 shrink-0 text-indigo-600 dark:text-indigo-400" />
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
          <div className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-400">
            <Filter className="h-3 w-3 shrink-0" />
            <span className="translate-y-[0.5px]">
              {t("analytics.quickStats.filtered")}:{" "}
              {formatNumber(totalFilteredRows ?? 0)} / {formatNumber(totalRows)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[11px] text-zinc-500">
            <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600 dark:text-emerald-500/80" />
            <span className="translate-y-[0.5px]">
              {t("analytics.analyzingAll")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
