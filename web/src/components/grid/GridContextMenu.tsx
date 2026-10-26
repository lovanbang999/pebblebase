import React from "react";
import {
  Edit2,
  Trash2,
  Copy,
  Filter as FilterIcon,
  FileJson,
  ArrowUpRight,
  FileCode,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { TableSchema, FilterOption } from "@/lib/types";

export interface ContextMenuState {
  mouseX: number;
  mouseY: number;
  row: Record<string, any>;
  colName: string;
  cellValue: any;
}

export interface GridContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  table: TableSchema;
  filters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  onEditRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: any,
  ) => void;
  onInspectCell: (
    colName: string,
    cellValue: any,
    row: Record<string, any>,
    colType?: string,
  ) => void;
  onCopyNotify?: (msg: string) => void;
  isReadOnly?: boolean;
  t: (key: string, opts?: any) => string;
}

export const GridContextMenu: React.FC<GridContextMenuProps> = React.memo(
  ({
    contextMenu,
    onClose,
    table,
    filters,
    onFiltersChange,
    onEditRow,
    onDeleteRow,
    onNavigateRelation,
    onInspectCell,
    onCopyNotify,
    isReadOnly = false,
    t,
  }) => {
    if (!contextMenu) return null;

    const targetCol = table.columns.find((c) => c.name === contextMenu.colName);

    return (
      <div
        style={{
          position: "fixed",
          left: `${Math.min(contextMenu.mouseX, window.innerWidth - 230)}px`,
          top: `${Math.min(contextMenu.mouseY, window.innerHeight - 280)}px`,
        }}
        className="animate-in fade-in-50 zoom-in-95 z-50 w-56 rounded-lg border border-zinc-200 bg-white p-1 font-mono text-xs shadow-2xl duration-100 dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-100 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 dark:border-zinc-800/80 dark:text-zinc-400">
          <span className="truncate">
            {contextMenu.colName &&
            contextMenu.colName !== "_actions" &&
            contextMenu.colName !== "_row_index"
              ? t("datagrid.contextMenu.columnTitle", {
                  column: contextMenu.colName,
                })
              : t("datagrid.contextMenu.rowActions")}
          </span>
          <Badge
            variant="outline"
            className="h-4 px-1 py-0 text-[9px] font-normal"
          >
            Right-Click
          </Badge>
        </div>

        <div className="py-1">
          {/* Edit Record */}
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => {
              onEditRow(contextMenu.row);
              onClose();
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800",
              isReadOnly &&
                "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            <Edit2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{t("datagrid.contextMenu.editRecord")}</span>
          </button>

          {/* Delete Record */}
          <button
            type="button"
            disabled={isReadOnly}
            onClick={() => {
              onDeleteRow(contextMenu.row);
              onClose();
            }}
            className={cn(
              "flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40",
              isReadOnly &&
                "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            <Trash2 className="h-3.5 w-3.5 shrink-0 text-rose-500" />
            <span>{t("datagrid.contextMenu.deleteRecord")}</span>
          </button>
        </div>

        <div className="my-1 border-t border-zinc-100 dark:border-zinc-800/80" />

        <div className="py-1">
          {/* Inspect Cell Detail */}
          {contextMenu.colName && contextMenu.colName !== "_row_index" && (
            <button
              type="button"
              onClick={() => {
                onInspectCell(
                  contextMenu.colName,
                  contextMenu.cellValue,
                  contextMenu.row,
                  targetCol?.type,
                );
                onClose();
              }}
              className="flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <div className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                <span>{t("datagrid.contextMenu.inspectCell")}</span>
              </div>
              <kbd className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                Space
              </kbd>
            </button>
          )}

          {/* Copy Cell Value */}
          {contextMenu.cellValue !== undefined &&
            contextMenu.cellValue !== null && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(String(contextMenu.cellValue));
                  onCopyNotify?.(t("datagrid.contextMenu.copied"));
                  onClose();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Copy className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span>{t("datagrid.contextMenu.copyCellValue")}</span>
              </button>
            )}

          {/* Filter by this value */}
          {contextMenu.colName &&
            contextMenu.cellValue !== undefined &&
            contextMenu.cellValue !== null && (
              <button
                type="button"
                onClick={() => {
                  onFiltersChange([
                    ...filters,
                    {
                      column: contextMenu.colName,
                      operator: "eq",
                      value: String(contextMenu.cellValue),
                    },
                  ]);
                  onClose();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <FilterIcon className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{t("datagrid.contextMenu.filterByValue")}</span>
              </button>
            )}

          {/* Copy Row as JSON */}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(
                JSON.stringify(contextMenu.row, null, 2),
              );
              onCopyNotify?.(t("datagrid.contextMenu.copied"));
              onClose();
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-zinc-800 transition-colors hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <FileJson className="h-3.5 w-3.5 shrink-0 text-purple-500" />
            <span>{t("datagrid.contextMenu.copyRowJson")}</span>
          </button>

          {/* Relation Navigation if FK */}
          {(() => {
            if (!contextMenu.colName || !onNavigateRelation) return null;
            const rel = table.relations?.find(
              (r) => r.from_column === contextMenu.colName,
            );
            if (!rel) return null;
            return (
              <button
                type="button"
                onClick={() => {
                  onNavigateRelation(
                    rel.to_table,
                    rel.to_column,
                    contextMenu.cellValue,
                  );
                  onClose();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-sky-600 transition-colors hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40"
              >
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                <span className="truncate">
                  {t("datagrid.contextMenu.navigateToRelation")} ({rel.to_table}
                  )
                </span>
              </button>
            );
          })()}
        </div>
      </div>
    );
  },
);
GridContextMenu.displayName = "GridContextMenu";
