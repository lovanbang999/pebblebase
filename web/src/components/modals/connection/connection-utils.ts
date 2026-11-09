import { cva } from "class-variance-authority";
import type { DatabaseType, EnvironmentType } from "@/lib/types";

export const CONNECTION_COLORS = {
  windowsAuthCheckbox: "text-blue-600 focus:ring-blue-500",
} as const;

export function generateDefaultName(
  targetDbType: DatabaseType,
  targetDbName: string,
  targetEnv: EnvironmentType,
  targetFilepath?: string,
  currentFilepath?: string,
): string {
  const engineLabel =
    targetDbType === "postgres"
      ? "PostgreSQL"
      : targetDbType === "mysql"
        ? "MySQL"
        : targetDbType === "mongodb"
          ? "MongoDB"
          : targetDbType === "redis"
            ? "Redis"
            : targetDbType === "mssql"
              ? "SQL Server"
              : targetDbType === "clickhouse"
                ? "ClickHouse"
                : "SQLite";
  const envLabel = targetEnv !== "local" ? ` - ${targetEnv}` : "";
  let prefix = "Local";

  if (targetDbType === "sqlite") {
    const p =
      targetFilepath !== undefined ? targetFilepath : currentFilepath || "";
    if (p.trim()) {
      const parts = p.trim().split(/[/\\]/);
      prefix = parts[parts.length - 1] || p.trim();
    } else {
      prefix = "Local SQLite";
    }
  } else if (targetDbName.trim()) {
    prefix = targetDbName.trim();
  }
  return `${prefix} (${engineLabel}${envLabel})`;
}

export function safeErrorMessage(
  error: unknown,
  fallback: string,
  password?: string,
): string {
  const message = error instanceof Error ? error.message : fallback;
  return (
    password ? message.replaceAll(password, "[redacted]") : message
  ).replace(/(\w+:\/\/)[^/@\s]+@/g, "$1[redacted]@");
}

export const testAlertVariants = cva("text-xs", {
  variants: {
    status: {
      success:
        "border-success/30 bg-success/10 text-success dark:border-success/50 dark:bg-success/30",
      error:
        "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/50 dark:bg-destructive/30",
    },
  },
  defaultVariants: {
    status: "success",
  },
});

export const driverSelectTriggerVariants = cva(
  "focus:border-primary/70 focus:ring-primary/20 border-border/90 bg-card/60 dark:bg-card/60 h-13 min-h-13 w-full justify-between rounded-xl border px-3 py-2 text-left shadow-2xs transition-all focus:ring-2 *:data-[slot=select-value]:flex *:data-[slot=select-value]:w-full *:data-[slot=select-value]:items-center *:data-[slot=select-value]:overflow-visible",
  {
    variants: {
      disabled: {
        true: "opacity-60 cursor-not-allowed",
        false:
          "hover:border-border hover:bg-muted/70 dark:border-border dark:hover:border-border dark:hover:bg-muted cursor-pointer",
      },
    },
    defaultVariants: {
      disabled: false,
    },
  },
);
