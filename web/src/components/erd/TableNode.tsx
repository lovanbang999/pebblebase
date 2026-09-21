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
        "group relative rounded-xl select-none",
        "bg-white dark:bg-[#13141f]",
        "border shadow-lg transition-[border-color,box-shadow,opacity] duration-150",
        selected || isHighlighted
          ? "border-indigo-500 shadow-xl ring-2 shadow-indigo-500/15 ring-indigo-500/40"
          : "border-zinc-200/80 shadow-black/10 hover:border-zinc-300 dark:border-white/10 dark:shadow-black/40 dark:hover:border-white/25",
        isDimmed && "opacity-25 transition-opacity duration-150",
      )}
    >
      {/* Middle Wrapper: Dagre layout bounds with overflow: hidden to clip 2x content */}
      <div className="h-full w-full overflow-hidden rounded-[11px]">
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
            className="h-4! w-4! border-4! border-white! bg-indigo-500/80! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900!"
            style={{ top: 40 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="source"
            className="h-4! w-4! border-4! border-white! bg-indigo-500/80! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900!"
            style={{ top: 40 }}
          />

          {/* Header */}
          <div className="flex h-23 cursor-grab items-center justify-between border-b-2 border-zinc-200/80 bg-linear-to-r from-indigo-500/10 via-purple-500/10 to-transparent px-6 py-4 active:cursor-grabbing dark:border-white/10">
            <div className="flex min-w-0 items-center gap-4 leading-none">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-indigo-500/30 bg-indigo-500/20">
                <Table className="h-6 w-6 text-indigo-500 dark:text-indigo-400" />
              </div>
              <span
                className="translate-y-0.5 truncate text-[26px] leading-none font-semibold text-zinc-900 dark:text-white"
                title={table.name}
              >
                {table.name}
              </span>
            </div>

            <div className="nodrag flex shrink-0 items-center gap-2">
              <span className="rounded-md border-2 border-zinc-200 bg-zinc-100 px-3 py-1 font-sans text-[20px] text-zinc-400 dark:border-white/5 dark:bg-white/5 dark:text-zinc-500">
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
                        className="nodrag cursor-pointer rounded-lg p-2 text-amber-500/80 transition-colors hover:bg-amber-500/15 hover:text-amber-400"
                      >
                        <Sparkles className="h-6 w-6" />
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
                      className="nodrag cursor-pointer rounded-lg p-2 text-zinc-400 transition-colors hover:bg-indigo-500/10 hover:text-indigo-500"
                    >
                      <ExternalLink className="h-6 w-6" />
                    </button>
                  }
                />
                <TooltipContent side="top">{t("erd.openTable")}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Column List */}
          <div className="divide-y-2 divide-zinc-100 dark:divide-white/5">
            {displayColumns.map((col) => {
              const isPK = col.is_primary_key;
              const isFK = col.is_foreign_key;
              const isColHighlighted = Array.isArray(highlightedColumn)
                ? highlightedColumn.includes(col.name)
                : highlightedColumn === col.name;

              return (
                <div
                  key={col.name}
                  onMouseEnter={() => onHoverColumn?.(table.name, col.name)}
                  onMouseLeave={() => onHoverColumn?.(table.name, null)}
                  className={cn(
                    "relative flex h-14 items-center justify-between px-6 leading-none transition-colors",
                    "cursor-crosshair hover:bg-zinc-50 dark:hover:bg-white/5",
                    isPK && "bg-amber-500/4",
                    isFK && !isPK && "bg-blue-500/4",
                    isColHighlighted &&
                      "bg-indigo-500/20 ring-2 ring-indigo-500/60 ring-inset",
                  )}
                >
                  {/* Column-Specific Connection Handles */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${col.name}-target`}
                    className="left-0! h-4! w-4! -translate-x-1/2! border-4! border-white! bg-indigo-500! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900!"
                  />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`${col.name}-source`}
                    className="right-0! h-4! w-4! translate-x-1/2! border-4! border-white! bg-indigo-500! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900!"
                  />

                  {/* Column Name & Key Badges */}
                  <div className="flex min-w-0 items-center gap-3 pr-4 leading-none">
                    {isPK ? (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border-2 border-amber-500/30 bg-amber-500/15 px-2 py-1 text-[18px] leading-none font-semibold text-amber-600 dark:text-amber-400"
                        title={t("datagrid.primaryKey")}
                      >
                        <Key className="h-5 w-5 shrink-0 translate-y-0.5" />
                        <span className="translate-y-0.5">PK</span>
                      </span>
                    ) : isFK ? (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border-2 border-blue-500/30 bg-blue-500/15 px-2 py-1 text-[18px] leading-none font-semibold text-blue-600 dark:text-blue-400"
                        title={t("datagrid.foreignKey")}
                      >
                        <Link2 className="h-5 w-5 shrink-0 translate-y-0.5" />
                        <span className="translate-y-0.5">FK</span>
                      </span>
                    ) : (
                      <span className="w-6 translate-y-0.5 text-center font-mono text-[20px] leading-none text-zinc-300 dark:text-zinc-600">
                        ·
                      </span>
                    )}

                    <span
                      className={cn(
                        "translate-y-0.5 truncate text-[22px] leading-none",
                        isPK
                          ? "font-semibold text-zinc-900 dark:text-zinc-100"
                          : "text-zinc-700 dark:text-zinc-300",
                        isColHighlighted && "font-semibold text-indigo-400",
                      )}
                      title={col.name}
                    >
                      {col.name}
                    </span>
                  </div>

                  {/* Column Type */}
                  <div className="flex shrink-0 items-center gap-2 leading-none">
                    <span
                      className="max-w-45 translate-y-0.5 truncate font-mono text-[20px] leading-none tracking-wider text-zinc-400 uppercase dark:text-zinc-500"
                      title={col.type}
                    >
                      {col.type}
                    </span>
                    {col.nullable && (
                      <span
                        className="translate-y-0.5 font-mono text-[18px] leading-none text-zinc-400 dark:text-zinc-600"
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
              <div className="flex h-13 items-center justify-center border-t-2 border-zinc-100 bg-zinc-50/50 px-6 text-center text-[20px] text-zinc-400 italic dark:border-white/5 dark:bg-white/2 dark:text-zinc-500">
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
