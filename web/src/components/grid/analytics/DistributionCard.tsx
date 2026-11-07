import { useTranslation } from "react-i18next";
import { BarChart3 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { AnalyticsSection } from "./AnalyticsPrimitives";
import { ChartTooltip } from "./ChartTooltip";
import { CHART_COLORS, type BarDatum } from "./analytics-utils";

interface DistributionCardProps {
  barData: BarDatum[];
}

export function DistributionCard({ barData }: DistributionCardProps) {
  const { t } = useTranslation();

  return (
    <AnalyticsSection
      icon={<BarChart3 className="text-primary h-4 w-4" />}
      title={`${t("analytics.distribution")} (${t("analytics.topValues")})`}
    >
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
                  stroke={CHART_COLORS.muted}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  stroke={CHART_COLORS.muted}
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
                      const d = payload[0].payload as BarDatum;
                      return (
                        <ChartTooltip
                          title={d.label}
                          subtitle={
                            <span className="text-primary">
                              {t("analytics.frequency")}:{" "}
                              {d.count.toLocaleString()} ({d.share}%)
                            </span>
                          }
                        />
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="count"
                  fill={CHART_COLORS.bar}
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
    </AnalyticsSection>
  );
}
