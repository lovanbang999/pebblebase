import { useTranslation } from "react-i18next";
import { PieChart as PieIcon } from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import {
  AnalyticsSection,
  completenessBadgeVariants,
} from "./AnalyticsPrimitives";
import { ChartTooltip } from "./ChartTooltip";
import type { PieDatum } from "./analytics-utils";

interface NullRatioCardProps {
  pieData: PieDatum[];
  completenessPercent: number;
  nonNullCount: number;
  nullCount: number;
  totalRows: number;
}

export function NullRatioCard({
  pieData,
  completenessPercent,
  nonNullCount,
  nullCount,
  totalRows,
}: NullRatioCardProps) {
  const { t } = useTranslation();

  const tone =
    completenessPercent === 100
      ? "complete"
      : completenessPercent >= 80
        ? "good"
        : "low";

  return (
    <AnalyticsSection
      icon={<PieIcon className="text-success h-4 w-4" />}
      title={t("analytics.nullRatio")}
      action={
        <Badge
          variant="outline"
          className={completenessBadgeVariants({ tone })}
        >
          {completenessPercent}% Complete
        </Badge>
      }
    >
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
                    const count = Number(data.value);
                    const share =
                      totalRows > 0 ? Math.round((count / totalRows) * 100) : 0;
                    return (
                      <ChartTooltip className="rounded px-2.5 py-1.5 shadow-lg">
                        <span style={{ color: data.payload.color }}>
                          {data.name}: {count.toLocaleString()} ({share}%)
                        </span>
                      </ChartTooltip>
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
              {nullCount.toLocaleString()} ({100 - completenessPercent}%)
            </span>
          </div>
        </div>
      </div>
    </AnalyticsSection>
  );
}
