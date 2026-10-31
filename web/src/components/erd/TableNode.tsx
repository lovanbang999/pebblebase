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
          : "hover:border-border dark:hover:border-border hover:shadow-md",
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
            className="group-hover:bg-primary! dark:group-hover:bg-primary! bg-muted! dark:border-border! dark:bg-muted! h-3.5! w-3.5! border-2! border-white! opacity-0! transition-opacity group-hover:opacity-100!"
            style={{ top: ERD_NODE_HEADER_HEIGHT / 2 }}
          />
          <Handle
            type="source"
            position={Position.Right}
            id="source"
            className="group-hover:bg-primary! dark:group-hover:bg-primary! bg-muted! dark:border-border! dark:bg-muted! h-3.5! w-3.5! border-2! border-white! opacity-0! transition-opacity group-hover:opacity-100!"
            style={{ top: ERD_NODE_HEADER_HEIGHT / 2 }}
          />

          {/* Header */}
          <div
            style={{ height: ERD_NODE_HEADER_HEIGHT }}
            className="border-border/90 bg-muted/80 dark:border-border dark:bg-muted/80 flex cursor-grab items-center justify-between border-b px-2.5 active:cursor-grabbing"
          >
            <div className="flex min-w-0 items-center gap-1.5 leading-none">
              <div className="text-primary dark:text-primary border-border bg-background dark:border-border dark:bg-card flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-md border shadow-2xs">
                <Table className="h-3.5 w-3.5" />
              </div>
              <span
                className="text-foreground translate-y-0.5 truncate text-[12px] leading-none font-bold tracking-tight dark:text-white"
                title={table.name}
              >
                {table.name}
              </span>
            </div>

            <div className="nodrag flex shrink-0 items-center gap-1.5">
              <span className="border-border/80 bg-muted/80 text-foreground dark:border-border dark:bg-muted dark:text-foreground rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold">
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
                        className="nodrag hover:text-primary dark:hover:text-primary text-muted-foreground hover:bg-muted/70 dark:text-muted-foreground dark:hover:bg-muted cursor-pointer rounded-md p-1.5 transition-colors"
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
                      className="nodrag text-muted-foreground hover:bg-muted/70 hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground cursor-pointer rounded-md p-1.5 transition-colors"
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
          <div className="divide-border/90 dark:divide-border/80 divide-y">
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
                    "hover:bg-card dark:hover:bg-muted/40 cursor-crosshair",
                    isColHighlighted &&
                      "bg-accent ring-primary/50 dark:bg-accent ring-1 ring-inset",
                  )}
                >
                  {/* Column-Specific Connection Handles */}
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`${col.name}-target`}
                    className="group-hover:bg-primary! dark:group-hover:bg-primary! bg-muted! dark:border-border! dark:bg-muted! left-0! h-3.5! w-3.5! -translate-x-1/2! border-2! border-white! opacity-0! transition-opacity group-hover:opacity-100!"
                  />
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`${col.name}-source`}
                    className="group-hover:bg-primary! dark:group-hover:bg-primary! bg-muted! dark:border-border! dark:bg-muted! right-0! h-3.5! w-3.5! translate-x-1/2! border-2! border-white! opacity-0! transition-opacity group-hover:opacity-100!"
                  />

                  {/* Column Name & Key Badges */}
                  <div className="flex min-w-0 items-center gap-1.5 pr-2 leading-none">
                    {isPK ? (
                      <span
                        className="border-warning/30 bg-warning/90 text-warning dark:border-warning/80 dark:bg-warning/40 dark:text-warning inline-flex shrink-0 items-center justify-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] leading-none font-bold shadow-2xs"
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
                      <span className="text-muted-foreground dark:text-muted-foreground w-4 translate-y-0.5 text-center font-mono text-[12px] leading-none select-none">
                        ·
                      </span>
                    )}

                    <span
                      className={cn(
                        "translate-y-0.5 truncate text-[12px] leading-none",
                        isPK
                          ? "text-foreground font-semibold dark:text-white"
                          : "text-foreground dark:text-foreground font-medium",
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
                        className="bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground translate-y-0.5 rounded px-1 py-0.5 font-mono text-[9px] leading-none"
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
              <div className="border-border bg-card/70 text-muted-foreground dark:border-border/60 dark:bg-card/50 dark:text-muted-foreground flex h-[26px] items-center justify-center border-t px-2.5 text-center text-[11px] italic">
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
