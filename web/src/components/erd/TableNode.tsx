import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Table, Key, Link2, ExternalLink, Sparkles } from "lucide-react";
import type { TableSchema } from "../../lib/types";
import { cn } from "cn";
import {
  ERD_NODE_WIDTH,
  ERD_NODE_ROW_HEIGHT,
  ERD_NODE_HEADER_HEIGHT,
} from "@/constants/erd";
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
  const nodeHeight =
    ERD_NODE_HEADER_HEIGHT +
    displayColumns.length * ERD_NODE_ROW_HEIGHT +
    extraHeight;

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => onHoverTable?.(table.name)}
      onMouseLeave={() => onHoverTable?.(null)}
      style={{ width: ERD_NODE_WIDTH, height: nodeHeight }}
      className={cn(
        "group relative rounded-lg select-none",
        "bg-card",

        "border-border border shadow-sm transition-[border-color,opacity] duration-150",
        selected || isHighlighted
          ? "border-primary ring-primary ring-1"
          : "hover:border-zinc-300 hover:shadow-md dark:hover:border-zinc-700",
        isDimmed && "opacity-25 transition-opacity duration-150",
      )}
    >
      <div className="h-full w-full overflow-hidden rounded-md">
        <div className="font-mono text-xs select-none">
          {/* Fallback Node-Level Handles */}
          <Handle
            type="target"
            position={Position.Left}
            id="target"
            className="group-hover:bg-primary! dark:group-hover:bg-primary! h-3.5! w-3.5! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500!"
            style={{ top: ERD_NODE_HEADER_HEIGHT / 2 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="source"
            className="group-hover:bg-primary! dark:group-hover:bg-primary! h-3.5! w-3.5! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500!"
            style={{ top: ERD_NODE_HEADER_HEIGHT / 2 }}
          />

          {/* Header */}
          <div
            style={{ height: ERD_NODE_HEADER_HEIGHT }}
            className="flex cursor-grab items-center justify-between border-b border-zinc-200/90 bg-zinc-100/80 px-2.5 active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-800/80"
          >
            <div className="flex min-w-0 items-center gap-1.5 leading-none">
              <div className="text-primary dark:text-primary flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-white shadow-2xs dark:border-zinc-700 dark:bg-zinc-900">
                <Table className="h-3.5 w-3.5" />
              </div>
              <span
                className="translate-y-0.5 truncate text-[12px] leading-none font-bold tracking-tight text-zinc-900 dark:text-white"
                title={table.name}
              >
                {table.name}
              </span>
            </div>

            <div className="nodrag flex shrink-0 items-center gap-1.5">
              <span className="rounded border border-zinc-300/80 bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-700 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-200">
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
                        aria-label={t("erd.generateJoinConsole")}
                        className="nodrag hover:text-primary dark:hover:text-primary cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 dark:text-zinc-400 dark:hover:bg-zinc-700"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
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
                      aria-label={t("erd.openTable")}
                      className="nodrag cursor-pointer rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
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

              const typeBadgeClass = "text-muted-foreground";

              return (
                <div
                  key={col.name}
                  style={{ height: ERD_NODE_ROW_HEIGHT }}
                  onMouseEnter={() => onHoverColumn?.(table.name, col.name)}
                  onMouseLeave={() => onHoverColumn?.(table.name, null)}
                  className={cn(
                    "relative flex items-center justify-between px-2.5 leading-none transition-colors",
                    "cursor-crosshair hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                    isColHighlighted &&
                      "bg-accent ring-primary/50 dark:bg-accent ring-1 ring-inset",
                  )}
                >
                  {/* Column-Specific Connection Handles */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${col.name}-target`}
                    className="group-hover:bg-primary! dark:group-hover:bg-primary! left-0! h-3.5! w-3.5! -translate-x-1/2! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500!"
                  />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`${col.name}-source`}
                    className="group-hover:bg-primary! dark:group-hover:bg-primary! right-0! h-3.5! w-3.5! translate-x-1/2! border-2! border-white! bg-zinc-400! opacity-0! transition-opacity group-hover:opacity-100! dark:border-zinc-900! dark:bg-zinc-500!"
                  />

                  {/* Column Name & Key Badges */}
                  <div className="flex min-w-0 items-center gap-1.5 pr-2 leading-none">
                    {isPK ? (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded border border-amber-300 bg-amber-100/90 px-1.5 py-0.5 font-mono text-[9px] leading-none font-bold text-amber-900 shadow-2xs dark:border-amber-700/80 dark:bg-amber-900/40 dark:text-amber-300"
                        title={t("datagrid.primaryKey")}
                      >
                        <Key className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                        <span className="translate-y-0.5">PK</span>
                      </span>
                    ) : isFK ? (
                      <span
                        className="inline-flex shrink-0 items-center justify-center gap-1 rounded border border-sky-300 bg-sky-100/90 px-1.5 py-0.5 font-mono text-[9px] leading-none font-bold text-sky-900 shadow-2xs dark:border-sky-700/80 dark:bg-sky-900/40 dark:text-sky-300"
                        title={t("datagrid.foreignKey")}
                      >
                        <Link2 className="h-3.5 w-3.5 shrink-0 translate-y-0.5" />
                        <span className="translate-y-0.5">FK</span>
                      </span>
                    ) : (
                      <span className="w-4 translate-y-0.5 text-center font-mono text-[12px] leading-none text-zinc-300 select-none dark:text-zinc-600">
                        ·
                      </span>
                    )}

                    <span
                      className={cn(
                        "translate-y-0.5 truncate text-[12px] leading-none",
                        isPK
                          ? "font-semibold text-zinc-950 dark:text-white"
                          : "font-medium text-zinc-800 dark:text-zinc-200",
                        isColHighlighted &&
                          "text-primary dark:text-primary font-bold",
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
                        "max-w-28 translate-y-0.5 truncate px-1 py-0.5 font-mono text-[10px] leading-none font-normal",
                        typeBadgeClass,
                      )}
                      title={col.type}
                    >
                      {col.type}
                    </span>
                    {col.nullable && (
                      <span
                        className="translate-y-0.5 rounded bg-zinc-100 px-1 py-0.5 font-mono text-[9px] leading-none text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
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
              <div className="flex h-[26px] items-center justify-center border-t border-zinc-100 bg-zinc-50/70 px-2.5 text-center text-[11px] text-zinc-400 italic dark:border-zinc-800/60 dark:bg-zinc-900/50 dark:text-zinc-500">
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
