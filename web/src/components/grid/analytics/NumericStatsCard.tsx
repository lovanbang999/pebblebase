import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Calculator, ArrowDown, ArrowUp, TrendingUp, Hash } from "lucide-react";
import { AnalyticsSection, StatTile } from "./AnalyticsPrimitives";

interface StatConfig {
  key: string;
  labelKey: string;
  icon: ReactNode;
  format: (stats: Record<string, unknown>) => string;
}

const STAT_CONFIGS: readonly StatConfig[] = [
  {
    key: "min",
    labelKey: "analytics.min",
    icon: <ArrowDown className="text-success h-3.5 w-3.5" />,
    format: (stats) =>
      stats.min !== undefined ? Number(stats.min).toLocaleString() : "—",
  },
  {
    key: "max",
    labelKey: "analytics.max",
    icon: <ArrowUp className="text-warning h-3.5 w-3.5" />,
    format: (stats) =>
      stats.max !== undefined ? Number(stats.max).toLocaleString() : "—",
  },
  {
    key: "avg",
    labelKey: "analytics.avg",
    icon: <TrendingUp className="text-primary h-3.5 w-3.5" />,
    format: (stats) =>
      stats.avg !== undefined
        ? Number(stats.avg).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })
        : "—",
  },
  {
    key: "sum",
    labelKey: "analytics.sum",
    icon: <Hash className="h-3.5 w-3.5 text-cyan-400" />,
    format: (stats) =>
      stats.sum !== undefined ? Number(stats.sum).toLocaleString() : "—",
  },
];

interface NumericStatsCardProps {
  stats: Record<string, unknown>;
}

export function NumericStatsCard({ stats }: NumericStatsCardProps) {
  const { t } = useTranslation();

  return (
    <AnalyticsSection
      icon={<Calculator className="h-4 w-4 text-sky-400" />}
      title="Numeric Summary Statistics"
    >
      <div className="grid grid-cols-2 gap-3">
        {STAT_CONFIGS.map((config) => (
          <StatTile
            key={config.key}
            label={t(config.labelKey)}
            icon={config.icon}
            value={config.format(stats)}
          />
        ))}
      </div>
    </AnalyticsSection>
  );
}
