import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Table, Key, Link2, ExternalLink, Sparkles } from "lucide-react";
import type { TableSchema } from "../../lib/types";
import { cn } from "cn";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface TableNodeData extends Record<string, unknown> {
  table: TableSchema;
  isDimmed?: boolean;
  isHighlighted?: boolean;
  compactMode?: boolean;
  highlightedColumn?: string | string[] | null;
  onOpenTable?: (tableName: string) => void;
  onGenerateJoinQuery?: (tableName: string) => void;
  onHoverColumn?: (tableName: string, columnName: string | null) => void;
  onHoverTable?: (tableName: string | null) => void;
}

export type TableNodeType = Node<TableNodeData, "tableNode">;

/** Helper to get human-designed semantic type chips (like Prisma / TablePlus) */
function getTypeChip(typeStr: string) {
  const t = typeStr.toUpperCase();
  if (
    t.includes("INT") ||
    t.includes("FLOAT") ||
    t.includes("DOUBLE") ||
    t.includes("DECIMAL") ||
    t.includes("NUMERIC") ||
    t.includes("SERIAL") ||
    t.includes("REAL")
  ) {
    return "border-amber-200/90 bg-amber-50 text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-300";
  }
  if (
    t.includes("CHAR") ||
    t.includes("TEXT") ||
    t.includes("STRING") ||
    t.includes("ENUM")
  ) {
    return "border-emerald-200/90 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-300";
  }
  if (t.includes("UUID") || t.includes("GUID") || t.includes("ID")) {
    return "border-indigo-200/90 bg-indigo-50 text-indigo-700 dark:border-indigo-800/60 dark:bg-indigo-950/50 dark:text-indigo-300";
  }
  if (t.includes("TIME") || t.includes("DATE")) {
    return "border-purple-200/90 bg-purple-50 text-purple-700 dark:border-purple-800/60 dark:bg-purple-950/50 dark:text-purple-300";
  }
  if (t.includes("BOOL")) {
    return "border-teal-200/90 bg-teal-50 text-teal-700 dark:border-teal-800/60 dark:bg-teal-950/50 dark:text-teal-300";
  }
  if (
    t.includes("JSON") ||
    t.includes("ARRAY") ||
    t.includes("BLOB") ||
    t.includes("BYTEA")
  ) {
    return "border-sky-200/90 bg-sky-50 text-sky-700 dark:border-sky-800/60 dark:bg-sky-950/50 dark:text-sky-300";
  }
  return "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300";
}

function TableNodeComponent({ data, selected }: NodeProps<TableNodeType>) {
  const { t } = useTranslation();
  const {
    table,
    isDimmed,
    isHighlighted,
    compactMode,
    highlightedColumn,
    onOpenTable,
    onGenerateJoinQuery,
    onHoverColumn,
    onHoverTable,
  } = data;

  const handleDoubleClick = () => {
    if (onOpenTable) {
      onOpenTable(table.name);
    }
  };

  const displayColumns = compactMode
    ? table.columns.filter((c) => c.is_primary_key || c.is_foreign_key)
    : table.columns;

  const hiddenCount = table.columns.length - displayColumns.length;
  const extraHeight = compactMode && hiddenCount > 0 ? 26 : 0;
  const nodeHeight = 46 + displayColumns.length * 28 + extraHeight;

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => onHoverTable?.(table.name)}
      onMouseLeave={() => onHoverTable?.(null)}
      style={{ width: 260, height: nodeHeight }}
      className={cn(
        "group relative rounded-lg select-none",
        "bg-white dark:bg-zinc-900",
        "border-t-[3px] border-t-indigo-500 dark:border-t-indigo-400",
        "border-r border-b border-l border-zinc-200/90 shadow-sm transition-[border-color,box-shadow,opacity] duration-150 dark:border-zinc-800",
        selected || isHighlighted
          ? "border-indigo-600 shadow-md ring-2 ring-indigo-600/20 dark:border-indigo-400 dark:ring-indigo-400/20"
          : "hover:border-zinc-300 hover:shadow-md dark:hover:border-zinc-700",
        isDimmed && "opacity-25 transition-opacity duration-150",
      )}
    >
      {/* Middle Wrapper: Dagre layout bounds with overflow: hidden to clip 2x content */}
      <div className="h-full w-full overflow-hidden rounded-b-[7px]">
        {/* 2x Retina Scale Adapter Layer */}
        <div
          style={{
            width: 520,
            transform: "scale(0.5)",
            transformOrigin: "top left",
            willChange: "transform",
          }}
          className="font-mono text-[24px] select-none"
        >
          {/* Fallback Node-Level Handles */}
          <Handle
            type="target"
            position={Position.Left}
            id="target"
            className="h-3.5! w-3.5! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:bg-indigo-500! group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500! dark:group-hover:bg-indigo-400!"
            style={{ top: 40 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="source"
            className="h-3.5! w-3.5! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:bg-indigo-500! group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500! dark:group-hover:bg-indigo-400!"
            style={{ top: 40 }}
          />

          {/* Header */}
          <div className="flex h-23 cursor-grab items-center justify-between border-b border-zinc-200/90 bg-zinc-100/80 px-5 py-3.5 active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-800/80">
            <div className="flex min-w-0 items-center gap-3.5 leading-none">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white text-indigo-600 shadow-2xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-indigo-400">
                <Table className="h-5 w-5" />
              </div>
              <span
                className="translate-y-0.5 truncate text-[25px] leading-none font-bold tracking-tight text-zinc-900 dark:text-white"
                title={table.name}
              >
                {table.name}
              </span>
            </div>

            <div className="nodrag flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-zinc-300/80 bg-zinc-200/80 px-2.5 py-0.5 font-mono text-[16px] font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
                {table.columns.length}
              </span>

              {/* Quick JOIN Query Generator Button */}
              {onGenerateJoinQuery && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onGenerateJoinQuery(table.name);
                        }}
                        className="nodrag cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-indigo-600 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-indigo-400"
                      >
                        <Sparkles className="h-5 w-5" />
                      </button>
                    }
                  />
                  <TooltipContent side="top">
                    {t("erd.generateJoinConsole")}
                  </TooltipContent>
                </Tooltip>
              )}

              {/* Open in Data Grid Button */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenTable?.(table.name);
                      }}
                      className="nodrag cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    >
                      <ExternalLink className="h-5 w-5" />
                    </button>
                  }
                />
                <TooltipContent side="top">{t("erd.openTable")}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Column List */}
          <div className="divide-y divide-zinc-100/90 dark:divide-zinc-800/80">
            {displayColumns.map((col) => {
              const isPK = col.is_primary_key;
              const isFK = col.is_foreign_key;
              const isColHighlighted = Array.isArray(highlightedColumn)
                ? highlightedColumn.includes(col.name)
                : highlightedColumn === col.name;

              const typeBadgeClass = getTypeChip(col.type);

              return (
                <div
                  key={col.name}
                  onMouseEnter={() => onHoverColumn?.(table.name, col.name)}
                  onMouseLeave={() => onHoverColumn?.(table.name, null)}
                  className={cn(
                    "relative flex h-14 items-center justify-between px-5 leading-none transition-colors",
                    "cursor-crosshair hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                    isColHighlighted &&
                      "bg-indigo-50/80 ring-1 ring-indigo-500/50 ring-inset dark:bg-indigo-950/50",
                  )}
                >
                  {/* Column-Specific Connection Handles */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${col.name}-target`}
                    className="left-0! h-3.5! w-3.5! -translate-x-1/2! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:bg-indigo-500! group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500! dark:group-hover:bg-indigo-400!"
                  />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`${col.name}-source`}
                    className="right-0! h-3.5! w-3.5! translate-x-1/2! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:bg-indigo-500! group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500! dark:group-hover:bg-indigo-400!"
                  />

                  {/* Column Name & Key Badges */}
                  <div className="flex min-w-0 items-center gap-2.5 pr-3 leading-none">
                    {isPK ? (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded border border-amber-300 bg-amber-100/90 px-1.5 py-0.5 font-mono text-[15px] leading-none font-bold text-amber-900 shadow-2xs dark:border-amber-700/80 dark:bg-amber-900/40 dark:text-amber-300"
                        title={t("datagrid.primaryKey")}
                      >
                        <Key className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                        <span className="translate-y-0.5">PK</span>
                      </span>
                    ) : isFK ? (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded border border-sky-300 bg-sky-100/90 px-1.5 py-0.5 font-mono text-[15px] leading-none font-bold text-sky-900 shadow-2xs dark:border-sky-700/80 dark:bg-sky-900/40 dark:text-sky-300"
                        title={t("datagrid.foreignKey")}
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                        <span className="translate-y-0.5">FK</span>
                      </span>
                    ) : (
                      <span className="w-4 translate-y-0.5 text-center font-mono text-[20px] leading-none text-zinc-300 select-none dark:text-zinc-600">
                        ·
                      </span>
                    )}

                    <span
                      className={cn(
                        "translate-y-0.5 truncate text-[22px] leading-none",
                        isPK
                          ? "font-semibold text-zinc-950 dark:text-white"
                          : "font-medium text-zinc-800 dark:text-zinc-200",
                        isColHighlighted &&
                          "font-bold text-indigo-600 dark:text-indigo-400",
                      )}
                      title={col.name}
                    >
                      {col.name}
                    </span>
                  </div>

                  {/* Column Type Badge */}
                  <div className="flex shrink-0 items-center gap-1.5 leading-none">
                    <span
                      className={cn(
                        "max-w-36 translate-y-0.5 truncate rounded border px-1.5 py-0.5 font-mono text-[16px] leading-none font-semibold uppercase",
                        typeBadgeClass,
                      )}
                      title={col.type}
                    >
                      {col.type}
                    </span>
                    {col.nullable && (
                      <span
                        className="translate-y-0.5 rounded bg-zinc-100 px-1 py-0.5 font-mono text-[14px] leading-none text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                        title={t("rowModal.nullable")}
                      >
                        ?
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Compact Mode Notice */}
            {compactMode && hiddenCount > 0 && (
              <div className="flex h-13 items-center justify-center border-t border-zinc-100 bg-zinc-50/70 px-5 text-center text-[18px] text-zinc-400 italic dark:border-zinc-800/60 dark:bg-zinc-900/50 dark:text-zinc-500">
                {t("erd.columnsHidden", { count: hiddenCount })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
export default TableNode;
