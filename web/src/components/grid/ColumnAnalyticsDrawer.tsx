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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { fetchAggregate } from "@/lib/api";
import type { ColumnSchema, FilterOption, AggregateResult } from "@/lib/types";

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
        className="animate-in fade-in fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Slide-over Drawer Panel */}
      <div
        data-testid="column-analytics-drawer"
        className="animate-in slide-in-from-right border-border bg-background text-foreground dark:border-border dark:bg-background dark:text-foreground relative z-50 flex h-full w-full max-w-xl flex-col overflow-hidden border-l font-sans shadow-2xl duration-300"
      >
        {/* Header */}
        <div className="border-border bg-card dark:border-border/80 dark:bg-card/50 flex shrink-0 items-start justify-between border-b px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="border-primary/20 bg-primary/10 text-primary dark:text-primary mt-0.5 rounded-lg border p-2">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                {columns.length > 1 ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          title={t("analytics.switchColumn", "Switch Column")}
                          className="group border-border bg-muted text-foreground hover:border-border hover:bg-muted dark:border-border/80 dark:bg-card dark:text-foreground dark:hover:border-border dark:hover:bg-muted flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm font-semibold transition-all"
                        >
                          <span>{column.name}</span>
                          <ChevronDown className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 transition-transform" />
                        </button>
                      }
                    />
                    <DropdownMenuContent
                      align="start"
                      className="border-border bg-card text-foreground z-50 max-h-72 w-56 overflow-y-auto border p-1 shadow-xl"
                    >
                      <DropdownMenuGroup>
                        <DropdownMenuLabel className="text-muted-foreground px-2 py-1 font-mono text-[10px] uppercase">
                          {t("analytics.switchColumn", "Switch Column")}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator className="bg-muted my-1" />
                        {columns.map((c) => {
                          const isSelected = c.name === column.name;
                          return (
                            <DropdownMenuItem
                              key={c.name}
                              onClick={() => onSelectColumn?.(c)}
                              className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 font-mono text-xs ${
                                isSelected
                                  ? "bg-primary/20 text-primary font-semibold"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {c.is_primary_key && (
                                  <Key className="text-warning h-3 w-3 shrink-0" />
                                )}
                                {c.is_foreign_key && (
                                  <Layers className="h-3 w-3 shrink-0 text-sky-400" />
                                )}
                                <span className="truncate">{c.name}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Badge
                                  variant="outline"
                                  className="bg-muted/80 text-muted-foreground border-transparent px-1 py-0 text-[10px]"
                                >
                                  {c.type}
                                </Badge>
                                {isSelected && (
                                  <Check className="text-primary h-3 w-3 shrink-0" />
                                )}
                              </div>
                            </DropdownMenuItem>
                          );
                        })}
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="text-foreground font-mono text-base font-bold">
                    {column.name}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className="bg-muted/80 text-muted-foreground border-transparent px-1.5 py-0 font-mono text-xs"
                >
                  {column.type}
                </Badge>
                {column.is_primary_key && (
                  <Badge
                    variant="outline"
                    className="border-warning/40 bg-warning/10 text-warning flex items-center gap-1 px-1.5 py-0 text-[10px]"
                  >
                    <Key className="h-3 w-3" />
                    PK
                  </Badge>
                )}
                {column.is_foreign_key && (
                  <Badge
                    variant="outline"
                    className="flex items-center gap-1 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] text-sky-400"
                  >
                    <Layers className="h-3 w-3" />
                    FK
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                <span>{tableName}</span>
                <span className="text-muted-foreground">•</span>
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
                className={`h-7 gap-1 px-2.5 text-xs ${
                  useFilters
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground"
                }`}
                title={
                  useFilters
                    ? t("analytics.analyzingFiltered", {
                        count: activeFilters.length,
                      })
                    : t("analytics.analyzingAll")
                }
              >
                <Filter className="h-3 w-3" />
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
              className="text-muted-foreground hover:bg-muted hover:text-foreground h-8 w-8 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          {loading ? (
            <div className="text-muted-foreground flex flex-col items-center justify-center space-y-3 py-20">
              <Loader2 className="text-primary h-8 w-8 animate-spin" />
              <p className="font-mono text-xs">
                Computing metrics for {column.name}...
              </p>
            </div>
          ) : error ? (
            <div className="border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-3 rounded-lg border p-4 text-xs">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* 1. Completeness & NULL Ratio */}
              <div className="border-border/80 bg-card/40 rounded-xl border p-4.5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PieIcon className="text-success h-4 w-4" />
                    <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                      {t("analytics.nullRatio")}
                    </h3>
                  </div>
                  <Badge
                    variant="outline"
                    className={`border-transparent font-mono text-[11px] ${
                      completenessPercent === 100
                        ? "bg-success/10 text-success"
                        : completenessPercent >= 80
                          ? "bg-warning/10 text-warning"
                          : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {completenessPercent}% Complete
                  </Badge>
                </div>

                <div className="flex items-center gap-6">
                  <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
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
                                <div className="border-border bg-card rounded border px-2.5 py-1.5 font-mono text-xs shadow-lg">
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
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-foreground font-mono text-xs font-bold">
                        {completenessPercent}%
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 space-y-2.5 font-mono text-xs">
                    <div className="border-border/60 bg-panel-2/60 flex items-center justify-between rounded border p-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-success h-2.5 w-2.5 rounded-full" />
                        <span className="text-muted-foreground">
                          {t("analytics.nonNull")}
                        </span>
                      </div>
                      <span className="text-foreground font-medium">
                        {nonNullCount.toLocaleString()} ({completenessPercent}%)
                      </span>
                    </div>

                    <div className="border-border/60 bg-panel-2/60 flex items-center justify-between rounded border p-2">
                      <div className="flex items-center gap-2">
                        <span className="bg-destructive h-2.5 w-2.5 rounded-full" />
                        <span className="text-muted-foreground">
                          {t("analytics.null")}
                        </span>
                      </div>
                      <span className="text-foreground font-medium">
                        {nullCount.toLocaleString()} (
                        {100 - completenessPercent}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Numeric Stats (if numeric column) */}
              {isNumeric && statsData?.stats && (
                <div className="border-border/80 bg-card/40 rounded-xl border p-4.5">
                  <div className="mb-3 flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-sky-400" />
                    <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                      Numeric Summary Statistics
                    </h3>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* MIN */}
                    <div className="border-border/60 bg-panel-2/60 flex flex-col justify-between rounded-lg border p-3">
                      <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
                        <span>{t("analytics.min")}</span>
                        <ArrowDown className="text-success h-3.5 w-3.5" />
                      </div>
                      <span className="text-foreground mt-1 font-mono text-lg font-bold">
                        {statsData.stats.min !== undefined
                          ? Number(statsData.stats.min).toLocaleString()
                          : "—"}
                      </span>
                    </div>

                    {/* MAX */}
                    <div className="border-border/60 bg-panel-2/60 flex flex-col justify-between rounded-lg border p-3">
                      <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
                        <span>{t("analytics.max")}</span>
                        <ArrowUp className="text-warning h-3.5 w-3.5" />
                      </div>
                      <span className="text-foreground mt-1 font-mono text-lg font-bold">
                        {statsData.stats.max !== undefined
                          ? Number(statsData.stats.max).toLocaleString()
                          : "—"}
                      </span>
                    </div>

                    {/* AVG */}
                    <div className="border-border/60 bg-panel-2/60 flex flex-col justify-between rounded-lg border p-3">
                      <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
                        <span>{t("analytics.avg")}</span>
                        <TrendingUp className="text-primary h-3.5 w-3.5" />
                      </div>
                      <span className="text-foreground mt-1 font-mono text-lg font-bold">
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
                    <div className="border-border/60 bg-panel-2/60 flex flex-col justify-between rounded-lg border p-3">
                      <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
                        <span>{t("analytics.sum")}</span>
                        <Hash className="h-3.5 w-3.5 text-cyan-400" />
                      </div>
                      <span className="text-foreground mt-1 font-mono text-lg font-bold">
                        {statsData.stats.sum !== undefined
                          ? Number(statsData.stats.sum).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Top Values Distribution */}
              <div className="border-border/80 bg-card/40 rounded-xl border p-4.5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="text-primary h-4 w-4" />
                    <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                      {t("analytics.distribution")} ({t("analytics.topValues")})
                    </h3>
                  </div>
                </div>

                {barData.length === 0 ? (
                  <div className="text-muted-foreground py-8 text-center font-mono text-xs">
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
                                  <div className="border-border bg-card rounded-lg border px-3 py-2 font-mono text-xs shadow-xl">
                                    <p className="text-foreground font-semibold">
                                      {d.label}
                                    </p>
                                    <p className="text-primary mt-0.5">
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
                    <div className="divide-border/60 border-border/80 bg-panel-2/40 divide-y overflow-hidden rounded-lg border font-mono text-xs">
                      {barData.slice(0, 5).map((item, i) => (
                        <div
                          key={i}
                          className="hover:bg-card/60 flex items-center justify-between px-3 py-2 transition-colors"
                        >
                          <span className="text-muted-foreground max-w-50 truncate font-medium">
                            {item.label}
                          </span>
                          <div className="flex shrink-0 items-center gap-3">
                            <span className="text-muted-foreground">
                              {item.count.toLocaleString()}
                            </span>
                            <Badge
                              variant="outline"
                              className="bg-muted/80 text-muted-foreground h-4 border-transparent px-1 font-mono text-[10px]"
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
                <div className="border-border/80 bg-card/40 rounded-xl border p-4.5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-cyan-400" />
                      <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                        {t("analytics.timeSeries")}
                      </h3>
                    </div>

                    {/* Interval Switcher */}
                    <div className="border-border bg-panel-2 flex items-center rounded-lg border p-0.5">
                      {(["day", "week", "month"] as const).map((bucket) => (
                        <button
                          key={bucket}
                          onClick={() => setTimeBucket(bucket)}
                          className={`rounded px-2.5 py-1 font-mono text-[11px] transition-colors ${
                            timeBucket === bucket
                              ? "bg-muted text-foreground font-medium shadow-xs"
                              : "text-muted-foreground hover:text-muted-foreground"
                          }`}
                        >
                          {t(`analytics.${bucket}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {timeChartData.length === 0 ? (
                    <div className="text-muted-foreground py-8 text-center font-mono text-xs">
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
                                  <div className="border-border bg-card rounded-lg border px-3 py-2 font-mono text-xs shadow-xl">
                                    <p className="text-foreground font-semibold">
                                      {d.date}
                                    </p>
                                    <p className="mt-0.5 text-cyan-400">
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
