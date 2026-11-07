import { useEffect } from "react";
import type { ColumnSchema, FilterOption } from "@/lib/types";
import {
  useColumnAnalytics,
  AnalyticsHeader,
  AnalyticsLoading,
  AnalyticsError,
  NullRatioCard,
  NumericStatsCard,
  DistributionCard,
  TimeSeriesCard,
} from "./analytics";

export interface ColumnAnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  column: ColumnSchema | null;
  columns?: ColumnSchema[];
  onSelectColumn?: (column: ColumnSchema) => void;
  activeFilters?: FilterOption[];
}

export function ColumnAnalyticsDrawer({
  isOpen,
  onClose,
  connectionId,
  tableName,
  column,
  columns = [],
  onSelectColumn,
  activeFilters = [],
}: ColumnAnalyticsDrawerProps) {
  const analytics = useColumnAnalytics({
    connectionId,
    tableName,
    column,
    isOpen,
    activeFilters,
  });

  // Esc key listener to close drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !column) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="animate-in fade-in fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div
        data-testid="column-analytics-drawer"
        className="animate-in slide-in-from-right border-border bg-background text-foreground relative z-50 flex h-full w-full max-w-xl flex-col overflow-hidden border-l font-sans shadow-2xl duration-300"
      >
        <AnalyticsHeader
          column={column}
          columns={columns}
          tableName={tableName}
          totalRows={analytics.totalRows}
          activeFilters={activeFilters}
          useFilters={analytics.useFilters}
          onToggleFilters={() => analytics.setUseFilters(!analytics.useFilters)}
          onSelectColumn={onSelectColumn}
          onClose={onClose}
        />

        {/* Body Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {analytics.loading ? (
            <AnalyticsLoading columnName={column.name} />
          ) : analytics.error ? (
            <AnalyticsError error={analytics.error} />
          ) : (
            <>
              <NullRatioCard
                pieData={analytics.pieData}
                completenessPercent={analytics.completenessPercent}
                nonNullCount={analytics.nonNullCount}
                nullCount={analytics.nullCount}
                totalRows={analytics.totalRows}
              />

              {analytics.isNumeric && analytics.statsData?.stats && (
                <NumericStatsCard stats={analytics.statsData.stats} />
              )}

              <DistributionCard barData={analytics.barData} />

              {analytics.isDate && (
                <TimeSeriesCard
                  timeChartData={analytics.timeChartData}
                  timeBucket={analytics.timeBucket}
                  onSelectTimeBucket={analytics.setTimeBucket}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
