import type { AggregateResult } from "@/lib/types";

export const CHART_COLORS = {
  bar: "#6366f1",
  nonNull: "#10b981",
  null: "#f43f5e",
  timeSeries: "#06b6d4",
  muted: "#71717a",
} as const;

export function isNumericType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes("int") ||
    t.includes("float") ||
    t.includes("double") ||
    t.includes("decimal") ||
    t.includes("numeric") ||
    t.includes("real") ||
    t.includes("number")
  );
}

export function isDateType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes("time") ||
    t.includes("date") ||
    t.includes("year") ||
    t.includes("timestamp")
  );
}

export interface CompletenessMetrics {
  nonNullCount: number;
  nullCount: number;
  totalRows: number;
  completenessPercent: number;
}

export function getCompleteness(
  statsData: AggregateResult | null,
): CompletenessMetrics {
  const nonNullCount = Number(statsData?.stats?.non_null_count ?? 0);
  const nullCount = Number(statsData?.stats?.null_count ?? 0);
  const totalRows = Number(
    statsData?.stats?.total_rows ?? nonNullCount + nullCount,
  );
  const completenessPercent =
    totalRows > 0 ? Math.round((nonNullCount / totalRows) * 100) : 100;

  return {
    nonNullCount,
    nullCount,
    totalRows,
    completenessPercent,
  };
}

export interface PieDatum {
  name: string;
  value: number;
  color: string;
}

export function buildPieData(
  statsData: AggregateResult | null,
  nonNullLabel: string,
  nullLabel: string,
): PieDatum[] {
  const { nonNullCount, nullCount } = getCompleteness(statsData);
  return [
    {
      name: nonNullLabel,
      value: nonNullCount,
      color: CHART_COLORS.nonNull,
    },
    {
      name: nullLabel,
      value: nullCount,
      color: CHART_COLORS.null,
    },
  ];
}

export interface BarDatum {
  label: string;
  count: number;
  share: number;
}

export function buildBarData(
  distributionData: AggregateResult | null,
  totalRows: number,
): BarDatum[] {
  return (
    distributionData?.labels.map((label, idx) => {
      const count = Number(distributionData.values[idx] ?? 0);
      const share = totalRows > 0 ? Math.round((count / totalRows) * 100) : 0;
      return {
        label: label === "" ? "(Empty)" : label,
        count,
        share,
      };
    }) || []
  );
}

export interface TimeSeriesDatum {
  date: string;
  records: number;
}

export function buildTimeSeriesData(
  timeSeriesData: AggregateResult | null,
): TimeSeriesDatum[] {
  return (
    timeSeriesData?.labels.map((bucket, idx) => ({
      date: bucket,
      records: Number(timeSeriesData.values[idx] ?? 0),
    })) || []
  );
}
