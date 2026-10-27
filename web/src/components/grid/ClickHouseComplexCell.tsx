import { useState, useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";

export type ClickHouseComplexKind = "array" | "map" | "tuple";

interface ClickHouseComplexCellProps {
  kind: ClickHouseComplexKind;
  columnType?: string;
  value: unknown;
  onOpenDetail?: () => void;
  className?: string;
}

/**
 * Detects if a column or value is a ClickHouse complex structure: Array, Map, or Tuple.
 */
export function detectClickHouseComplexType(
  columnType?: string,
  val?: unknown,
): ClickHouseComplexKind | null {
  if (columnType) {
    const lower = columnType.toLowerCase().trim();
    if (
      lower === "array" ||
      lower.startsWith("array(") ||
      lower.startsWith("array")
    ) {
      return "array";
    }
    if (
      lower === "map" ||
      lower.startsWith("map(") ||
      lower.startsWith("map")
    ) {
      return "map";
    }
    if (
      lower === "tuple" ||
      lower.startsWith("tuple(") ||
      lower.startsWith("tuple")
    ) {
      return "tuple";
    }
  }

  if (val === null || val === undefined) {
    return null;
  }

  if (Array.isArray(val)) {
    return "array";
  }

  if (typeof val === "object") {
    return "map";
  }

  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      return "array";
    }
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return "map";
    }
    if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
      return "tuple";
    }
  }

  return null;
}

/**
 * Safely parses raw array/map/tuple values from JSON or literal strings.
 */
function parseComplexValue(val: unknown, kind: ClickHouseComplexKind): any {
  if (val === null || val === undefined) return null;
  if (typeof val !== "string") return val;

  const trimmed = val.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // If not standard JSON, try light unwrap for ClickHouse string literal representations
    if (kind === "array" && trimmed.startsWith("[") && trimmed.endsWith("]")) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
    }
    if (kind === "tuple" && trimmed.startsWith("(") && trimmed.endsWith(")")) {
      const inner = trimmed.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
    }
    return val;
  }
}

export const ClickHouseComplexCell: FC<ClickHouseComplexCellProps> = ({
  kind,
  columnType,
  value,
  onOpenDetail,
  className,
}) => {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);

  const parsed = useMemo(() => parseComplexValue(value, kind), [value, kind]);

  const tooltipText = useMemo(() => {
    const prefix = columnType ? `[${columnType}]\n` : "";
    try {
      if (typeof parsed === "object" && parsed !== null) {
        return `${prefix}${JSON.stringify(parsed, null, 2)}`;
      }
      return `${prefix}${String(value ?? "")}`;
    } catch {
      return `${prefix}${String(value ?? "")}`;
    }
  }, [parsed, value, columnType]);

  // Render Array Type
  if (kind === "array") {
    const items: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed
        ? [parsed]
        : [];
    const count = items.length;
    const previewItems = items.slice(0, 2);
    const remaining = count - previewItems.length;

    return (
      <div
        className={cn(
          "group/ch-cell relative flex max-w-sm items-center gap-1.5 py-0.5",
          className,
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={tooltipText}
      >
        <Badge
          variant="outline"
          className="h-4.5 shrink-0 border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-400"
        >
          <span className="font-bold tracking-tighter">[&thinsp;]</span>
          <span>{count}</span>
        </Badge>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-xs">
          {previewItems.map((item, idx) => (
            <span
              key={idx}
              className="inline-block max-w-25 truncate rounded bg-zinc-100 px-1 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {typeof item === "object" ? JSON.stringify(item) : String(item)}
            </span>
          ))}
          {remaining > 0 && (
            <span className="shrink-0 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
              +{remaining}
            </span>
          )}
          {count === 0 && (
            <span className="text-[11px] text-zinc-400 italic dark:text-zinc-500">
              {t("datagrid.complexTypes.empty")}
            </span>
          )}
        </div>

        {onOpenDetail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
            className={cn(
              "shrink-0 rounded p-0.5 text-zinc-400 transition-opacity hover:bg-emerald-500/20 hover:text-emerald-600 dark:hover:text-emerald-400",
              isHovered ? "opacity-100" : "opacity-0",
            )}
            title={t("datagrid.complexTypes.inspectArray")}
          >
            <ArrowUpRight className="size-3" />
          </button>
        )}
      </div>
    );
  }

  // Render Map Type
  if (kind === "map") {
    const entries: [string, unknown][] =
      typeof parsed === "object" && parsed !== null
        ? Object.entries(parsed)
        : [];
    const count = entries.length;
    const previewEntries = entries.slice(0, 2);
    const remaining = count - previewEntries.length;

    return (
      <div
        className={cn(
          "group/ch-cell relative flex max-w-sm items-center gap-1.5 py-0.5",
          className,
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        title={tooltipText}
      >
        <Badge
          variant="outline"
          className="h-4.5 shrink-0 border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-400"
        >
          <span className="font-bold tracking-tighter">
            &#123;&thinsp;&#125;
          </span>
          <span>{count}</span>
        </Badge>

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-xs">
          {previewEntries.map(([k, v], idx) => (
            <span
              key={idx}
              className="inline-flex max-w-30 items-center gap-0.5 truncate rounded bg-indigo-50 px-1 py-0.5 text-[11px] text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
            >
              <span className="font-medium text-indigo-600 dark:text-indigo-400">
                {k}:
              </span>
              <span className="truncate">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </span>
          ))}
          {remaining > 0 && (
            <span className="shrink-0 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
              +{remaining}
            </span>
          )}
          {count === 0 && (
            <span className="text-[11px] text-zinc-400 italic dark:text-zinc-500">
              {t("datagrid.complexTypes.empty")}
            </span>
          )}
        </div>

        {onOpenDetail && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDetail();
            }}
            className={cn(
              "shrink-0 rounded p-0.5 text-zinc-400 transition-opacity hover:bg-indigo-500/20 hover:text-indigo-600 dark:hover:text-indigo-400",
              isHovered ? "opacity-100" : "opacity-0",
            )}
            title={t("datagrid.complexTypes.inspectMap")}
          >
            <ArrowUpRight className="size-3" />
          </button>
        )}
      </div>
    );
  }

  // Render Tuple Type
  const tupleItems: unknown[] = Array.isArray(parsed)
    ? parsed
    : typeof parsed === "object" && parsed !== null
      ? Object.values(parsed)
      : [parsed];
  const count = tupleItems.length;
  const previewItems = tupleItems.slice(0, 3);
  const remaining = count - previewItems.length;

  return (
    <div
      className={cn(
        "group/ch-cell relative flex max-w-sm items-center gap-1.5 py-0.5",
        className,
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={tooltipText}
    >
      <Badge
        variant="outline"
        className="h-4.5 shrink-0 border-amber-500/30 bg-amber-500/10 px-1.5 py-0 font-mono text-[10px] font-semibold text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400"
      >
        <span className="font-bold tracking-tighter">(&thinsp;)</span>
        <span>{count}</span>
      </Badge>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-xs">
        {previewItems.map((item, idx) => (
          <span
            key={idx}
            className="inline-block max-w-22.5 truncate rounded bg-amber-50 px-1 py-0.5 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
          >
            {typeof item === "object" ? JSON.stringify(item) : String(item)}
          </span>
        ))}
        {remaining > 0 && (
          <span className="shrink-0 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
            +{remaining}
          </span>
        )}
      </div>

      {onOpenDetail && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail();
          }}
          className={cn(
            "shrink-0 rounded p-0.5 text-zinc-400 transition-opacity hover:bg-amber-500/20 hover:text-amber-600 dark:hover:text-amber-400",
            isHovered ? "opacity-100" : "opacity-0",
          )}
          title={t("datagrid.complexTypes.inspectTuple")}
        >
          <ArrowUpRight className="size-3" />
        </button>
      )}
    </div>
  );
};
