import type { ReactNode } from "react";

interface ChartTooltipProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ChartTooltip({
  title,
  subtitle,
  children,
  className = "",
}: ChartTooltipProps) {
  return (
    <div
      className={`border-border bg-card rounded-lg border px-3 py-2 font-mono text-xs shadow-xl ${className}`}
    >
      {title && <p className="text-foreground font-semibold">{title}</p>}
      {subtitle && <p className="mt-0.5">{subtitle}</p>}
      {children}
    </div>
  );
}
