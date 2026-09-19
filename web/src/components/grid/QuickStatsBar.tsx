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

interface QuickStatsBarProps {
  table: TableSchema;
  stats?: TableStats | null;
  totalFilteredRows?: number;
  isFiltered?: boolean;
  onOpenAnalytics?: (col?: ColumnSchema) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
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
      className="bg-zinc-100/90 dark:bg-zinc-950/40 border-b border-zinc-200 dark:border-zinc-800/60 px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono select-none transition-colors"
    >
      {/* Left items: Table metrics */}
      <div className="flex items-center gap-3 text-zinc-600 dark:text-zinc-400">
        {/* Total rows */}
        <div
          className="flex items-center gap-1.5"
          title={t("analytics.totalRows")}
        >
          <Database className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span className="text-zinc-900 dark:text-zinc-200 font-medium translate-y-0.5">
            {formatNumber(totalRows)}
          </span>
          <span className="text-zinc-500 dark:text-zinc-500 translate-y-0.5">
            {t("analytics.quickStats.rows")}
          </span>
          {isEstimated && (
            <span className="text-[10px] text-zinc-600 dark:text-zinc-500 bg-zinc-200 dark:bg-zinc-800/80 px-1 py-0.5 rounded translate-y-0.5">
              {t("analytics.quickStats.estimated")}
            </span>
          )}
        </div>

        <span
          className="h-3.5 w-px bg-zinc-300 dark:bg-zinc-800 shrink-0 self-center"
          aria-hidden="true"
        />

        {/* Table Size */}
        <div
          className="flex items-center gap-1.5"
          title={t("analytics.quickStats.size")}
        >
          <HardDrive className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="text-zinc-500 dark:text-zinc-500 translate-y-0.5">
            {t("analytics.quickStats.size")}:
          </span>
          <span className="text-zinc-900 dark:text-zinc-200 font-medium translate-y-0.5">
            {formatBytes(sizeBytes)}
          </span>
        </div>

        <span
          className="h-3.5 w-px bg-zinc-300 dark:bg-zinc-800 shrink-0 self-center"
          aria-hidden="true"
        />

        {/* Columns & PKs */}
        <div className="flex items-center gap-1.5">
          <Columns className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="text-zinc-900 dark:text-zinc-200 font-medium translate-y-0.5">
            {table.columns.length}
          </span>
          <span className="text-zinc-500 dark:text-zinc-500 translate-y-0.5">
            {t("analytics.quickStats.columns")}
          </span>
          {pkCount > 0 && (
            <span className="inline-flex items-center justify-center px-2 h-5 rounded-full text-[10px] font-mono font-medium border border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10 shrink-0">
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
              className="inline-flex items-center justify-center gap-1 px-2.5 h-5 rounded-full text-[10px] font-mono font-medium text-indigo-700 dark:text-indigo-400/90 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 hover:border-indigo-500/50 transition-colors cursor-pointer shrink-0"
            >
              <BarChart3 className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
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
          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-[11px]">
            <Filter className="w-3 h-3 shrink-0" />
            <span className="translate-y-[0.5px]">
              {t("analytics.quickStats.filtered")}:{" "}
              {formatNumber(totalFilteredRows ?? 0)} / {formatNumber(totalRows)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-zinc-500 text-[11px]">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-500/80 shrink-0" />
            <span className="translate-y-[0.5px]">
              {t("analytics.analyzingAll")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
