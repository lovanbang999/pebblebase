import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  BarChart3,
  Key,
  Layers,
  PieChart as PieIcon,
  TrendingUp,
  ArrowDown,
  ArrowUp,
  Calculator,
  Calendar,
  Filter,
  Loader2,
  AlertCircle,
  Hash,
  ChevronDown,
  Check,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  AreaChart,
  Area,
} from "recharts";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "./ui/dropdown-menu";
import { fetchAggregate } from "../lib/api";
import type { ColumnSchema, FilterOption, AggregateResult } from "../lib/types";

interface ColumnAnalyticsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  connectionId: string;
  tableName: string;
  column: ColumnSchema | null;
  columns?: ColumnSchema[];
  onSelectColumn?: (column: ColumnSchema) => void;
  activeFilters?: FilterOption[];
}

const BAR_COLOR = "#6366f1";

function isNumericType(type: string): boolean {
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

function isDateType(type: string): boolean {
  const t = type.toLowerCase();
  return (
    t.includes("time") ||
    t.includes("date") ||
    t.includes("year") ||
    t.includes("timestamp")
  );
}

export const ColumnAnalyticsDrawer: React.FC<ColumnAnalyticsDrawerProps> = ({
  isOpen,
  onClose,
  connectionId,
  tableName,
  column,
  columns = [],
  onSelectColumn,
  activeFilters = [],
}) => {
  const { t } = useTranslation();

  const [useFilters, setUseFilters] = useState<boolean>(true);
  const [timeBucket, setTimeBucket] = useState<"day" | "week" | "month">("day");
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
        // Fetch distribution & general stats in parallel
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
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load column analytics");
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

  // Pie chart data: Non-Null vs NULL
  const nonNullCount = Number(statsData?.stats?.non_null_count ?? 0);
  const nullCount = Number(statsData?.stats?.null_count ?? 0);
  const totalRows = Number(
    statsData?.stats?.total_rows ?? nonNullCount + nullCount,
  );
  const completenessPercent =
    totalRows > 0 ? Math.round((nonNullCount / totalRows) * 100) : 100;

  const pieData = [
    { name: t("analytics.nonNull"), value: nonNullCount, color: "#10b981" },
    { name: t("analytics.null"), value: nullCount, color: "#f43f5e" },
  ];

  // Bar chart data for top 10 distribution
  const barData =
    distributionData?.labels.map((label, idx) => {
      const count = Number(distributionData.values[idx] ?? 0);
      const share = totalRows > 0 ? Math.round((count / totalRows) * 100) : 0;
      return {
        label: label === "" ? "(Empty)" : label,
        count,
        share,
      };
    }) || [];

  // Time-series chart data
  const timeChartData =
    timeSeriesData?.labels.map((bucket, idx) => ({
      date: bucket,
      records: Number(timeSeriesData.values[idx] ?? 0),
    })) || [];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div
        data-testid="column-analytics-drawer"
        className="relative z-50 w-full max-w-xl bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-300 text-zinc-900 dark:text-zinc-100 font-sans"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-200 dark:border-zinc-800/80 flex items-start justify-between bg-zinc-50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 mt-0.5">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                {columns.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          title={t("analytics.switchColumn", "Switch Column")}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700/80 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-sm font-semibold transition-all cursor-pointer group"
                        >
                          <span>{column.name}</span>
                          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-200 transition-transform" />
                        </button>
                      }
                    />
                    <DropdownMenuContent
                      align="start"
                      className="w-56 max-h-72 overflow-y-auto bg-zinc-900 border border-zinc-800 p-1 shadow-xl z-50 text-zinc-200"
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-[10px] text-zinc-400 font-mono uppercase px-2 py-1">
                          {t("analytics.switchColumn", "Switch Column")}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-zinc-800 my-1" />
                        {columns.map((c) => {
                          const isSelected = c.name === column.name;
                          return (
                            <DropdownMenuItem
                              key={c.name}
                              onClick={() => onSelectColumn?.(c)}
                              className={`flex items-center justify-between px-2 py-1.5 rounded text-xs font-mono cursor-pointer ${
                                isSelected
                                  ? "bg-indigo-500/20 text-indigo-300 font-semibold"
                                  : "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {c.is_primary_key && (
                                  <Key className="w-3 h-3 text-amber-400 shrink-0" />
                                )}
                                {c.is_foreign_key && (
                                  <Layers className="w-3 h-3 text-sky-400 shrink-0" />
                                )}
                                <span className="truncate">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-zinc-400 border-transparent bg-zinc-800/80 px-1 py-0"
                                >
                                  {c.type}
                                </Badge>
                                {isSelected && (
                                  <Check className="w-3 h-3 text-indigo-400 shrink-0" />
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="font-mono text-base font-bold text-zinc-100">
                    {column.name}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className="font-mono text-xs text-zinc-400 bg-zinc-800/80 border-transparent px-1.5 py-0"
                >
                  {column.type}
                </Badge>
                {column.is_primary_key && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 text-amber-400 bg-amber-500/10 text-[10px] px-1.5 py-0 flex items-center gap-1"
                  >
                    <Key className="w-3 h-3" />
                    PK
                  </Badge>
                )}
                {column.is_foreign_key && (
                  <Badge
                    variant="outline"
                    className="border-sky-500/40 text-sky-400 bg-sky-500/10 text-[10px] px-1.5 py-0 flex items-center gap-1"
                  >
                    <Layers className="w-3 h-3" />
                    FK
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1.5">
                <span>{tableName}</span>
                <span className="text-zinc-600">•</span>
                <span>
                  {totalRows.toLocaleString()}{" "}
                  {t("analytics.totalRows").toLowerCase()}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeFilters.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUseFilters(!useFilters)}
                className={`text-xs h-7 gap-1 px-2.5 ${
                  useFilters
                    ? "border-indigo-500/40 text-indigo-300 bg-indigo-500/10"
                    : "text-zinc-400 border-zinc-800 bg-zinc-900"
                }`}
                title={
                  useFilters
                    ? t("analytics.analyzingFiltered", {
                        count: activeFilters.length,
                      })
                    : t("analytics.analyzingAll")
                }
              >
                <Filter className="w-3 h-3" />
                {useFilters
                  ? t("analytics.analyzingFiltered", {
                      count: activeFilters.length,
                    })
                  : t("analytics.analyzingAll")}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 h-8 w-8 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-400 space-y-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
              <p className="text-xs font-mono">
                Computing metrics for {column.name}...
              </p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* 1. Completeness & NULL Ratio */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                      {t("analytics.nullRatio")}
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-[11px] font-mono border-transparent ${
                      completenessPercent === 100
                        ? "bg-emerald-500/10 text-emerald-400"
                        : completenessPercent >= 80
                          ? "bg-amber-500/10 text-amber-400"
                          : "bg-rose-500/10 text-rose-400"
                    }`}
                  >
                    {completenessPercent}% Complete
                  </Badge>
                </div>

                <div className="flex items-center gap-6">
                  <div className="w-32 h-32 shrink-0 relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          innerRadius={36}
                          outerRadius={56}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const data = payload[0];
                              return (
                                <div className="bg-zinc-900 border border-zinc-700 px-2.5 py-1.5 rounded text-xs shadow-lg font-mono">
                                  <span style={{ color: data.payload.color }}>
                                    {data.name}:{" "}
                                    {Number(data.value).toLocaleString()} (
                                    {totalRows > 0
                                      ? Math.round(
                                          (Number(data.value) / totalRows) *
                                            100,
                                        )
                                      : 0}
                                    %)
                                  </span>
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-xs font-bold text-zinc-100 font-mono">
                        {completenessPercent}%
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between p-2 rounded bg-zinc-950/60 border border-zinc-800/60">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <span className="text-zinc-300">
                          {t("analytics.nonNull")}
                        </span>
                      </div>
                      <span className="text-zinc-100 font-medium">
                        {nonNullCount.toLocaleString()} ({completenessPercent}%)
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-2 rounded bg-zinc-950/60 border border-zinc-800/60">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                        <span className="text-zinc-300">
                          {t("analytics.null")}
                        </span>
                      </div>
                      <span className="text-zinc-100 font-medium">
                        {nullCount.toLocaleString()} (
                        {100 - completenessPercent}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Numeric Stats (if numeric column) */}
              {isNumeric && statsData?.stats && (
                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4.5">
                  <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-4 h-4 text-sky-400" />
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                      Numeric Summary Statistics
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* MIN */}
                    <div className="bg-zinc-950/60 border border-zinc-800/60 p-3 rounded-lg flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                        <span>{t("analytics.min")}</span>
                        <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                      </div>
                      <span className="text-lg font-bold text-zinc-100 font-mono mt-1">
                        {statsData.stats.min !== undefined
                          ? Number(statsData.stats.min).toLocaleString()
                          : "—"}
                      </span>
                    </div>

                    {/* MAX */}
                    <div className="bg-zinc-950/60 border border-zinc-800/60 p-3 rounded-lg flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                        <span>{t("analytics.max")}</span>
                        <ArrowUp className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <span className="text-lg font-bold text-zinc-100 font-mono mt-1">
                        {statsData.stats.max !== undefined
                          ? Number(statsData.stats.max).toLocaleString()
                          : "—"}
                      </span>
                    </div>

                    {/* AVG */}
                    <div className="bg-zinc-950/60 border border-zinc-800/60 p-3 rounded-lg flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                        <span>{t("analytics.avg")}</span>
                        <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                      </div>
                      <span className="text-lg font-bold text-zinc-100 font-mono mt-1">
                        {statsData.stats.avg !== undefined
                          ? Number(statsData.stats.avg).toLocaleString(
                              undefined,
                              {
                                maximumFractionDigits: 2,
                              },
                            )
                          : "—"}
                      </span>
                    </div>

                    {/* SUM */}
                    <div className="bg-zinc-950/60 border border-zinc-800/60 p-3 rounded-lg flex flex-col justify-between">
                      <div className="flex items-center justify-between text-zinc-400 text-xs font-mono">
                        <span>{t("analytics.sum")}</span>
                        <Hash className="w-3.5 h-3.5 text-cyan-400" />
                      </div>
                      <span className="text-lg font-bold text-zinc-100 font-mono mt-1">
                        {statsData.stats.sum !== undefined
                          ? Number(statsData.stats.sum).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Top Values Distribution */}
              <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4.5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                      {t("analytics.distribution")} ({t("analytics.topValues")})
                    </h3>
                  </div>
                </div>

                {barData.length === 0 ? (
                  <div className="py-8 text-center text-zinc-500 text-xs font-mono">
                    {t("analytics.noData")}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={barData}
                          layout="vertical"
                          margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                        >
                          <XAxis
                            type="number"
                            stroke="#71717a"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            stroke="#71717a"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            width={90}
                            tickFormatter={(val) =>
                              String(val).length > 12
                                ? `${String(val).slice(0, 10)}…`
                                : String(val)
                            }
                          />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                  <div className="bg-zinc-900 border border-zinc-700 px-3 py-2 rounded-lg text-xs shadow-xl font-mono">
                                    <p className="font-semibold text-zinc-100">
                                      {d.label}
                                    </p>
                                    <p className="text-indigo-400 mt-0.5">
                                      {t("analytics.frequency")}:{" "}
                                      {d.count.toLocaleString()} ({d.share}%)
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar
                            dataKey="count"
                            fill={BAR_COLOR}
                            radius={[0, 4, 4, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Value Pill List */}
                    <div className="divide-y divide-zinc-800/60 border border-zinc-800/80 rounded-lg overflow-hidden bg-zinc-950/40 text-xs font-mono">
                      {barData.slice(0, 5).map((item, i) => (
                        <div
                          key={i}
                          className="px-3 py-2 flex items-center justify-between hover:bg-zinc-900/60 transition-colors"
                        >
                          <span className="truncate max-w-50 text-zinc-300 font-medium">
                            {item.label}
                          </span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-zinc-400">
                              {item.count.toLocaleString()}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] font-mono h-4 px-1 bg-zinc-800/80 border-transparent text-zinc-400"
                            >
                              {item.share}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 4. Time-Series Trend (for datetime columns) */}
              {isDate && (
                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-xl p-4.5">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-cyan-400" />
                      <h3 className="text-xs font-semibold text-zinc-200 uppercase tracking-wider font-mono">
                        {t("analytics.timeSeries")}
                      </h3>
                    </div>

                    {/* Interval Switcher */}
                    <div className="flex items-center rounded-lg bg-zinc-950 p-0.5 border border-zinc-800">
                      {(["day", "week", "month"] as const).map((bucket) => (
                        <button
                          key={bucket}
                          onClick={() => setTimeBucket(bucket)}
                          className={`text-[11px] font-mono px-2.5 py-1 rounded transition-colors ${
                            timeBucket === bucket
                              ? "bg-zinc-800 text-zinc-100 font-medium shadow-xs"
                              : "text-zinc-500 hover:text-zinc-300"
                          }`}
                        >
                          {t(`analytics.${bucket}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {timeChartData.length === 0 ? (
                    <div className="py-8 text-center text-zinc-500 text-xs font-mono">
                      {t("analytics.noData")}
                    </div>
                  ) : (
                    <div className="h-48 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={timeChartData}
                          margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="timeColor"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="#06b6d4"
                                stopOpacity={0.4}
                              />
                              <stop
                                offset="95%"
                                stopColor="#06b6d4"
                                stopOpacity={0.0}
                              />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="date"
                            stroke="#71717a"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#71717a"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <RechartsTooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const d = payload[0].payload;
                                return (
                                  <div className="bg-zinc-900 border border-zinc-700 px-3 py-2 rounded-lg text-xs shadow-xl font-mono">
                                    <p className="font-semibold text-zinc-100">
                                      {d.date}
                                    </p>
                                    <p className="text-cyan-400 mt-0.5">
                                      {t("analytics.recordCount")}:{" "}
                                      {d.records.toLocaleString()}
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area
                            type="monotone"
                            dataKey="records"
                            stroke="#06b6d4"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#timeColor)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
