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
  rowIndex?: number;
}

export interface ExtraGridContextMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
}

export interface GridContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  table: TableSchema;
  filters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  onEditRow: (row: Record<string, any>) => void;
  onEditCell: (
    row: Record<string, any>,
    column: string,
    rowIndex: number,
  ) => void;
  onSetNull: (row: Record<string, any>, column: string) => void;
  onCloneRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
  onSortChange: (column: string, desc: boolean) => void;
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
  mutationBlockedReason?: string;
  // Phase 6 extension point for FK peek and Find This Value Everywhere.
  getExtraMenuItems?: (context: ContextMenuState) => ExtraGridContextMenuItem[];
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
    onEditCell,
    onSetNull,
    onCloneRow,
    onDeleteRow,
    onSortChange,
    onNavigateRelation,
    onInspectCell,
    onCopyNotify,
    isReadOnly = false,
    mutationBlockedReason,
    getExtraMenuItems = () => [],
    t,
  }) => {
    if (!contextMenu) return null;

    const targetCol = table.columns.find((c) => c.name === contextMenu.colName);
    const cellTarget = Boolean(
      targetCol && contextMenu.colName !== "_row_index",
    );
    const writeBlocked =
      isReadOnly || !table.columns.some((column) => column.is_primary_key);
    const cellWriteBlocked =
      writeBlocked || !cellTarget || Boolean(targetCol?.is_primary_key);
    const rowIndex = contextMenu.rowIndex ?? 0;

    const item = (
      label: string,
      onSelect: () => void,
      disabled = false,
      title?: string,
      icon?: React.ReactNode,
    ) => (
      <button
        key={label}
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => {
          onSelect();
          onClose();
        }}
        className={cn(
          "text-foreground hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors",
          disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
        )}
      >
        {icon}
        <span>{label}</span>
      </button>
    );

    return (
      <div
        style={{
          position: "fixed",
          left: `${Math.min(contextMenu.mouseX, window.innerWidth - 230)}px`,
          top: `${Math.min(contextMenu.mouseY, window.innerHeight - 280)}px`,
        }}
        className="animate-in fade-in-50 zoom-in-95 border-border bg-background dark:border-border dark:bg-card z-50 w-56 rounded-lg border p-1 font-mono text-xs shadow-2xl duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-border text-muted-foreground dark:border-border/80 dark:text-muted-foreground flex items-center justify-between border-b px-2.5 py-1.5 text-[11px] font-semibold">
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
          {cellTarget &&
            item(
              "Edit Cell",
              () => onEditCell(contextMenu.row, contextMenu.colName, rowIndex),
              cellWriteBlocked,
              mutationBlockedReason,
              <Edit2 className="h-3.5 w-3.5" />,
            )}
          {cellTarget &&
            item(
              "Set NULL",
              () => onSetNull(contextMenu.row, contextMenu.colName),
              cellWriteBlocked,
              mutationBlockedReason,
            )}
          {cellTarget &&
            item(
              "Copy",
              () => {
                void navigator.clipboard.writeText(
                  contextMenu.cellValue === null
                    ? "NULL"
                    : String(contextMenu.cellValue ?? ""),
                );
                onCopyNotify?.(t("datagrid.contextMenu.copied"));
              },
              false,
              undefined,
              <Copy className="h-3.5 w-3.5" />,
            )}
          {cellTarget &&
            item(
              "Filter by This Value",
              () =>
                onFiltersChange([
                  ...filters,
                  {
                    column: contextMenu.colName,
                    operator: "eq",
                    value:
                      contextMenu.cellValue === null
                        ? "null"
                        : String(contextMenu.cellValue),
                  },
                ]),
              contextMenu.cellValue === undefined ||
                contextMenu.cellValue === null,
            )}
          {cellTarget &&
            item("Sort Ascending", () =>
              onSortChange(contextMenu.colName, false),
            )}
          {cellTarget &&
            item("Sort Descending", () =>
              onSortChange(contextMenu.colName, true),
            )}
          {item("Copy Row as JSON", () => {
            const cleanRow = Object.fromEntries(
              Object.entries(contextMenu.row).filter(
                ([key]) => !key.startsWith("_pb_"),
              ),
            );
            void navigator.clipboard.writeText(
              JSON.stringify(cleanRow, null, 2),
            );
            onCopyNotify?.(t("datagrid.contextMenu.copied"));
          })}
          {item(
            "Clone Row",
            () => onCloneRow(contextMenu.row),
            writeBlocked,
            mutationBlockedReason,
          )}
          {item(
            "Delete Row",
            () => onDeleteRow(contextMenu.row),
            writeBlocked,
            mutationBlockedReason,
            <Trash2 className="h-3.5 w-3.5" />,
          )}
          {cellTarget &&
            item(
              "Inspect Cell",
              () =>
                onInspectCell(
                  contextMenu.colName,
                  contextMenu.cellValue,
                  contextMenu.row,
                  targetCol?.type,
                ),
              false,
              undefined,
              <FileCode className="h-3.5 w-3.5" />,
            )}
          {(() => {
            const relation = table.relations?.find(
              (candidate) => candidate.from_column === contextMenu.colName,
            );
            if (!relation || !onNavigateRelation || !cellTarget) return null;
            return item(`Navigate to ${relation.to_table}`, () =>
              onNavigateRelation(
                relation.to_table,
                relation.to_column,
                contextMenu.cellValue,
              ),
            );
          })()}
          {getExtraMenuItems(contextMenu).map((extra) =>
            item(extra.label, extra.onSelect, extra.disabled, extra.title),
          )}
        </div>

        <div className="hidden">
          {/* Edit Record */}
          <button
            type="button"
            disabled={isReadOnly}
            title={isReadOnly ? mutationBlockedReason : undefined}
            onClick={() => {
              onEditRow(contextMenu.row);
              onClose();
            }}
            className={cn(
              "text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors",
              isReadOnly &&
                "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            <Edit2 className="text-success dark:text-success h-3.5 w-3.5 shrink-0" />
            <span>{t("datagrid.contextMenu.editRecord")}</span>
          </button>

          {/* Delete Record */}
          <button
            type="button"
            disabled={isReadOnly}
            title={isReadOnly ? mutationBlockedReason : undefined}
            onClick={() => {
              onDeleteRow(contextMenu.row);
              onClose();
            }}
            className={cn(
              "text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/40 flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors",
              isReadOnly &&
                "cursor-not-allowed opacity-50 hover:bg-transparent",
            )}
          >
            <Trash2 className="text-destructive h-3.5 w-3.5 shrink-0" />
            <span>{t("datagrid.contextMenu.deleteRecord")}</span>
          </button>
        </div>

        <div className="border-border dark:border-border/80 my-1 border-t" />

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
              className="text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileCode className="text-primary dark:text-primary h-3.5 w-3.5 shrink-0" />
                <span>{t("datagrid.contextMenu.inspectCell")}</span>
              </div>
              <kbd className="bg-muted/80 text-muted-foreground dark:bg-muted dark:text-muted-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
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
                className="text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors"
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
                className="text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors"
              >
                <FilterIcon className="text-warning h-3.5 w-3.5 shrink-0" />
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
            className="text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left transition-colors"
          >
            <FileJson className="text-primary h-3.5 w-3.5 shrink-0" />
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
