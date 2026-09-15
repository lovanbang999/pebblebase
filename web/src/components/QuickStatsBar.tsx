import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, HardDrive, Columns, Filter, CheckCircle2 } from 'lucide-react';
import type { TableSchema, TableStats } from '../lib/types';
import { Badge } from './ui/badge';

interface QuickStatsBarProps {
  table: TableSchema;
  stats?: TableStats | null;
  totalFilteredRows?: number;
  isFiltered?: boolean;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
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
}) => {
  const { t } = useTranslation();

  const totalRows = stats?.total_rows ?? 0;
  const sizeBytes = stats?.size_bytes ?? 0;
  const isEstimated = stats?.estimated_rows ?? false;
  const pkCount = table.columns.filter((c) => c.is_primary_key).length;

  return (
    <div
      data-testid="quick-stats-bar"
      className="bg-zinc-950/40 border-b border-zinc-800/60 px-3 py-1.5 flex flex-wrap items-center justify-between gap-3 text-xs font-mono select-none"
    >
      {/* Left items: Table metrics */}
      <div className="flex items-center gap-3 text-zinc-400">
        {/* Total rows */}
        <div className="flex items-center gap-1.5" title={t('analytics.totalRows')}>
          <Database className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="text-zinc-200 font-medium">{formatNumber(totalRows)}</span>
          <span className="text-zinc-500">{t('analytics.quickStats.rows')}</span>
          {isEstimated && (
            <span className="text-[10px] text-zinc-500 bg-zinc-800/80 px-1 rounded">
              {t('analytics.quickStats.estimated')}
            </span>
          )}
        </div>

        <span className="text-zinc-700">|</span>

        {/* Table Size */}
        <div className="flex items-center gap-1.5" title={t('analytics.quickStats.size')}>
          <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-zinc-500">{t('analytics.quickStats.size')}:</span>
          <span className="text-zinc-200 font-medium">{formatBytes(sizeBytes)}</span>
        </div>

        <span className="text-zinc-700">|</span>

        {/* Columns & PKs */}
        <div className="flex items-center gap-1.5">
          <Columns className="w-3.5 h-3.5 text-sky-400 shrink-0" />
          <span className="text-zinc-200 font-medium">{table.columns.length}</span>
          <span className="text-zinc-500">{t('analytics.quickStats.columns')}</span>
          {pkCount > 0 && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-amber-500/40 text-amber-400 bg-amber-500/10">
              {pkCount} {t('analytics.quickStats.pk')}
            </Badge>
          )}
        </div>
      </div>

      {/* Right items: Filter status */}
      <div className="flex items-center gap-2">
        {isFiltered ? (
          <div className="flex items-center gap-1.5 text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded text-[11px]">
            <Filter className="w-3 h-3 shrink-0" />
            <span>
              {t('analytics.quickStats.filtered')}: {formatNumber(totalFilteredRows ?? 0)} / {formatNumber(totalRows)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-zinc-500 text-[11px]">
            <CheckCircle2 className="w-3 h-3 text-emerald-500/80" />
            <span>{t('analytics.analyzingAll')}</span>
          </div>
        )}
      </div>
    </div>
  );
};
