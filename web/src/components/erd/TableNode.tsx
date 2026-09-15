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

  return (
    <div
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => onHoverTable?.(table.name)}
      onMouseLeave={() => onHoverTable?.(null)}
      className={cn(
        "group min-w-60 max-w-[320px] rounded-xl overflow-hidden text-xs font-mono select-none",
        "bg-white dark:bg-[#13141f]",
        "border shadow-lg transition-[border-color,box-shadow,opacity] duration-150",
        selected || isHighlighted
          ? "border-indigo-500 ring-2 ring-indigo-500/40 shadow-xl shadow-indigo-500/15"
          : "border-zinc-200/80 dark:border-white/10 hover:border-zinc-300 dark:hover:border-white/25 shadow-black/10 dark:shadow-black/40",
        isDimmed && "opacity-25 transition-opacity duration-150",
      )}
    >
      {/* Fallback Node-Level Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="w-2! h-2! bg-indigo-500/80! border-2! border-white! dark:border-zinc-900! opacity-0! group-hover:opacity-100! transition-opacity"
        style={{ top: 20 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="w-2! h-2! bg-indigo-500/80! border-2! border-white! dark:border-zinc-900! opacity-0! group-hover:opacity-100! transition-opacity"
        style={{ top: 20 }}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-linear-to-r from-indigo-500/10 via-purple-500/10 to-transparent border-b border-zinc-200/80 dark:border-white/10 cursor-grab active:cursor-grabbing">
        <div className="flex items-center gap-2 min-w-0 leading-none">
          <div className="w-5 h-5 rounded-md bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
            <Table className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
          </div>
          <span
            className="font-semibold text-zinc-900 dark:text-white truncate leading-none translate-y-px"
            title={table.name}
          >
            {table.name}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0 nodrag">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/5 border border-zinc-200 dark:border-white/5 font-sans">
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
                    className="p-1 rounded text-amber-500/80 hover:text-amber-400 hover:bg-amber-500/15 transition-colors cursor-pointer nodrag"
                  >
                    <Sparkles className="w-3 h-3" />
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
                  className="p-1 rounded text-zinc-400 hover:text-indigo-500 hover:bg-indigo-500/10 transition-colors cursor-pointer nodrag"
                >
                  <ExternalLink className="w-3 h-3" />
                </button>
              }
            />
            <TooltipContent side="top">{t("erd.openTable")}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Column List */}
      <div className="divide-y divide-zinc-100 dark:divide-white/5 max-h-95 overflow-y-auto no-scrollbar nowheel">
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
                "relative flex items-center justify-between px-3 py-1.5 transition-colors leading-none",
                "hover:bg-zinc-50 dark:hover:bg-white/5 cursor-crosshair",
                isPK && "bg-amber-500/4",
                isFK && !isPK && "bg-blue-500/4",
                isColHighlighted &&
                  "bg-indigo-500/20 ring-1 ring-inset ring-indigo-500/60",
              )}
            >
              {/* Column-Specific Connection Handles */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${col.name}-target`}
                className="w-2! h-2! bg-indigo-500! border-2! border-white! dark:border-zinc-900! -left-1! opacity-0! group-hover:opacity-100! transition-opacity"
              />
              <Handle
                type="source"
                position={Position.Right}
                id={`${col.name}-source`}
                className="w-2! h-2! bg-indigo-500! border-2! border-white! dark:border-zinc-900! -right-1! opacity-0! group-hover:opacity-100! transition-opacity"
              />

              {/* Column Name & Key Badges */}
              <div className="flex items-center gap-1.5 min-w-0 pr-2 leading-none">
                {isPK ? (
                  <span
                    className="inline-flex items-center justify-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0 leading-none"
                    title={t("datagrid.primaryKey")}
                  >
                    <Key className="w-2.5 h-2.5 shrink-0 translate-y-px" />
                    <span className="translate-y-px">PK</span>
                  </span>
                ) : isFK ? (
                  <span
                    className="inline-flex items-center justify-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 shrink-0 leading-none"
                    title={t("datagrid.foreignKey")}
                  >
                    <Link2 className="w-2.5 h-2.5 shrink-0 translate-y-px" />
                    <span className="translate-y-px">FK</span>
                  </span>
                ) : (
                  <span className="w-3 text-center text-[10px] text-zinc-300 dark:text-zinc-600 font-mono leading-none translate-y-px">
                    ·
                  </span>
                )}

                <span
                  className={cn(
                    "truncate text-[11px] leading-none translate-y-px",
                    isPK
                      ? "font-semibold text-zinc-900 dark:text-zinc-100"
                      : "text-zinc-700 dark:text-zinc-300",
                    isColHighlighted && "text-indigo-400 font-semibold",
                  )}
                  title={col.name}
                >
                  {col.name}
                </span>
              </div>

              {/* Column Type */}
              <div className="flex items-center gap-1 shrink-0 leading-none">
                <span
                  className="text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider font-mono truncate max-w-22.5 leading-none translate-y-px"
                  title={col.type}
                >
                  {col.type}
                </span>
                {col.nullable && (
                  <span
                    className="text-[9px] text-zinc-400 dark:text-zinc-600 font-mono leading-none translate-y-px"
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
          <div className="px-3 py-1.5 text-[10px] text-zinc-400 dark:text-zinc-500 italic bg-zinc-50/50 dark:bg-white/2 text-center border-t border-zinc-100 dark:border-white/5">
            {t("erd.columnsHidden", { count: hiddenCount })}
          </div>
        )}
      </div>
    </div>
  );
}

export const TableNode = memo(TableNodeComponent);
export default TableNode;
