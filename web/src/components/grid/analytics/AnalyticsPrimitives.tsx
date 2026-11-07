/* oxlint-disable react/only-export-components */
import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";

interface AnalyticsSectionProps {
  icon: ReactNode;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AnalyticsSection({
  icon,
  title,
  action,
  children,
  className = "",
}: AnalyticsSectionProps) {
  return (
    <div
      className={`border-border/80 bg-card/40 rounded-xl border p-4.5 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-foreground font-mono text-xs font-semibold tracking-wider uppercase">
            {title}
          </h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

interface StatTileProps {
  label: ReactNode;
  icon: ReactNode;
  value: ReactNode;
  className?: string;
}

export function StatTile({
  label,
  icon,
  value,
  className = "",
}: StatTileProps) {
  return (
    <div
      className={`border-border/60 bg-panel-2/60 flex flex-col justify-between rounded-lg border p-3 ${className}`}
    >
      <div className="text-muted-foreground flex items-center justify-between font-mono text-xs">
        <span>{label}</span>
        {icon}
      </div>
      <span className="text-foreground mt-1 font-mono text-lg font-bold">
        {value}
      </span>
    </div>
  );
}

export const completenessBadgeVariants = cva(
  "border-transparent font-mono text-[11px]",
  {
    variants: {
      tone: {
        complete: "bg-success/10 text-success",
        good: "bg-warning/10 text-warning",
        low: "bg-destructive/10 text-destructive",
      },
    },
    defaultVariants: {
      tone: "complete",
    },
  },
);

export type CompletenessBadgeVariants = VariantProps<
  typeof completenessBadgeVariants
>;

export const timeBucketButtonVariants = cva(
  "rounded px-2.5 py-1 font-mono text-[11px] transition-colors",
  {
    variants: {
      active: {
        true: "bg-muted text-foreground font-medium shadow-xs",
        false: "text-muted-foreground",
      },
    },
    defaultVariants: {
      active: false,
    },
  },
);

export type TimeBucketButtonVariants = VariantProps<
  typeof timeBucketButtonVariants
>;
