import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import {
  AnalyticsSection,
  timeBucketButtonVariants,
} from "./AnalyticsPrimitives";
import { ChartTooltip } from "./ChartTooltip";
import { CHART_COLORS, type TimeSeriesDatum } from "./analytics-utils";

const TIME_BUCKETS = ["day", "week", "month"] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

interface TimeSeriesCardProps {
  timeChartData: TimeSeriesDatum[];
  timeBucket: TimeBucket;
  onSelectTimeBucket: (bucket: TimeBucket) => void;
}

export function TimeSeriesCard({
  timeChartData,
  timeBucket,
  onSelectTimeBucket,
}: TimeSeriesCardProps) {
  const { t } = useTranslation();

  return (
    <AnalyticsSection
      icon={<Calendar className="h-4 w-4 text-cyan-400" />}
      title={t("analytics.timeSeries")}
      action={
        <div className="border-border bg-panel-2 flex items-center rounded-lg border p-0.5">
          {TIME_BUCKETS.map((bucket) => (
            <button
              key={bucket}
              onClick={() => onSelectTimeBucket(bucket)}
              className={timeBucketButtonVariants({
                active: timeBucket === bucket,
              })}
            >
              {t(`analytics.${bucket}`)}
            </button>
          ))}
        </div>
      }
    >
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
                <linearGradient id="timeColor" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={CHART_COLORS.timeSeries}
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor={CHART_COLORS.timeSeries}
                    stopOpacity={0.0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                stroke={CHART_COLORS.muted}
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke={CHART_COLORS.muted}
                fontSize={10}
                tickLine={false}
                axisLine={false}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload as TimeSeriesDatum;
                    return (
                      <ChartTooltip
                        title={d.date}
                        subtitle={
                          <span className="text-cyan-400">
                            {t("analytics.recordCount")}:{" "}
                            {d.records.toLocaleString()}
                          </span>
                        }
                      />
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="records"
                stroke={CHART_COLORS.timeSeries}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#timeColor)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </AnalyticsSection>
  );
}
