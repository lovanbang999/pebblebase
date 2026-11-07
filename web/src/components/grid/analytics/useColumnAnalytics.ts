import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { fetchAggregate } from "@/lib/api";
import type { ColumnSchema, FilterOption, AggregateResult } from "@/lib/types";
import {
  isNumericType,
  isDateType,
  getCompleteness,
  buildPieData,
  buildBarData,
  buildTimeSeriesData,
  type PieDatum,
  type BarDatum,
  type TimeSeriesDatum,
} from "./analytics-utils";

export type TimeBucket = "day" | "week" | "month";

interface UseColumnAnalyticsParams {
  connectionId: string;
  tableName: string;
  column: ColumnSchema | null;
  isOpen: boolean;
  activeFilters?: FilterOption[];
}

export interface UseColumnAnalyticsResult {
  useFilters: boolean;
  setUseFilters: (value: boolean) => void;
  timeBucket: TimeBucket;
  setTimeBucket: (bucket: TimeBucket) => void;
  loading: boolean;
  error: string | null;
  distributionData: AggregateResult | null;
  statsData: AggregateResult | null;
  timeSeriesData: AggregateResult | null;
  isNumeric: boolean;
  isDate: boolean;
  totalRows: number;
  nonNullCount: number;
  nullCount: number;
  completenessPercent: number;
  pieData: PieDatum[];
  barData: BarDatum[];
  timeChartData: TimeSeriesDatum[];
}

export function useColumnAnalytics({
  connectionId,
  tableName,
  column,
  isOpen,
  activeFilters = [],
}: UseColumnAnalyticsParams): UseColumnAnalyticsResult {
  const { t } = useTranslation();

  const [useFilters, setUseFilters] = useState<boolean>(true);
  const [timeBucket, setTimeBucket] = useState<TimeBucket>("day");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [distributionData, setDistributionData] =
    useState<AggregateResult | null>(null);
  const [statsData, setStatsData] = useState<AggregateResult | null>(null);
  const [timeSeriesData, setTimeSeriesData] = useState<AggregateResult | null>(
    null,
  );

  const isNumeric = column ? isNumericType(column.type) : false;
  const isDate = column ? isDateType(column.type) : false;

  const applicableFilters = useMemo(() => {
    return useFilters ? activeFilters : [];
  }, [useFilters, activeFilters]);

  // Load analytics when column or drawer state changes
  useEffect(() => {
    if (!isOpen || !column) return;

    let mounted = true;
    setLoading(true);
    setError(null);
    setDistributionData(null);
    setStatsData(null);
    setTimeSeriesData(null);

    const loadData = async () => {
      try {
        const promises: [
          Promise<AggregateResult>,
          Promise<AggregateResult>,
          Promise<AggregateResult | null>,
        ] = [
          fetchAggregate(
            connectionId,
            tableName,
            column.name,
            "distribution",
            "day",
            applicableFilters,
            10,
          ),
          fetchAggregate(
            connectionId,
            tableName,
            column.name,
            "stats",
            "day",
            applicableFilters,
          ),
          isDate
            ? fetchAggregate(
                connectionId,
                tableName,
                column.name,
                "timeseries",
                timeBucket,
                applicableFilters,
                20,
              )
            : Promise.resolve(null),
        ];

        const [distRes, statsRes, timeRes] = await Promise.all(promises);

        if (mounted) {
          setDistributionData(distRes);
          setStatsData(statsRes);
          setTimeSeriesData(timeRes);
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Failed to load column analytics",
          );
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [
    isOpen,
    connectionId,
    tableName,
    column,
    applicableFilters,
    isDate,
    timeBucket,
  ]);

  const { nonNullCount, nullCount, totalRows, completenessPercent } = useMemo(
    () => getCompleteness(statsData),
    [statsData],
  );

  const pieData = useMemo(
    () =>
      buildPieData(
        statsData,
        t("analytics.nonNull", "Non-Null"),
        t("analytics.null", "NULL"),
      ),
    [statsData, t],
  );

  const barData = useMemo(
    () => buildBarData(distributionData, totalRows),
    [distributionData, totalRows],
  );

  const timeChartData = useMemo(
    () => buildTimeSeriesData(timeSeriesData),
    [timeSeriesData],
  );

  return {
    useFilters,
    setUseFilters,
    timeBucket,
    setTimeBucket,
    loading,
    error,
    distributionData,
    statsData,
    timeSeriesData,
    isNumeric,
    isDate,
    totalRows,
    nonNullCount,
    nullCount,
    completenessPercent,
    pieData,
    barData,
    timeChartData,
  };
}
