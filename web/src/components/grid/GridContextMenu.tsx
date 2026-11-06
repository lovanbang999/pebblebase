import React, { useRef, useState, useLayoutEffect } from "react";
import {
  Edit2,
  Trash2,
  Copy,
  Filter as FilterIcon,
  FileJson,
  ArrowUpRight,
  FileCode,
  ArrowUp,
  ArrowDown,
  CopyPlus,
  MinusCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
  icon?: React.ReactNode;
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

export const GridContextMenu = React.memo(function GridContextMenu({
  contextMenu,
  onClose,
  table,
  filters,
  onFiltersChange,
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
}: GridContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const [coords, setCoords] = useState<{ left: number; top: number }>(() => {
    if (!contextMenu) return { left: 0, top: 0 };
    const margin = 12;
    const estW = 240;
    const estH = 340;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
    const vh = typeof window !== "undefined" ? window.innerHeight : 768;

    let initX = contextMenu.mouseX;
    let initY = contextMenu.mouseY;

    if (initX + estW > vw - margin) {
      initX = Math.max(margin, vw - estW - margin);
    }
    if (initY + estH > vh - margin) {
      initY = Math.max(margin, vh - estH - margin);
    }

    return { left: initX, top: initY };
  });

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = contextMenu.mouseX;
    let top = contextMenu.mouseY;

    // Horizontal collision: flip left if overflowing right edge
    if (left + rect.width > vw - margin) {
      const flippedX = contextMenu.mouseX - rect.width;
      left =
        flippedX >= margin
          ? flippedX
          : Math.max(margin, vw - rect.width - margin);
    } else {
      left = Math.max(margin, left);
    }

    // Vertical collision: flip upward if overflowing bottom edge
    if (top + rect.height > vh - margin) {
      const flippedY = contextMenu.mouseY - rect.height;
      if (flippedY >= margin) {
        top = flippedY;
      } else {
        top = Math.max(margin, vh - rect.height - margin);
      }
    } else {
      top = Math.max(margin, top);
    }

    setCoords({ left: Math.round(left), top: Math.round(top) });
  }, [contextMenu]);

  if (!contextMenu) return null;

  const targetCol = table.columns.find((c) => c.name === contextMenu.colName);
  const cellTarget = Boolean(targetCol && contextMenu.colName !== "_row_index");
  const writeBlocked =
    isReadOnly || !table.columns.some((column) => column.is_primary_key);
  const cellWriteBlocked =
    writeBlocked || !cellTarget || Boolean(targetCol?.is_primary_key);
  const rowIndex = contextMenu.rowIndex ?? 0;

  const extraItems = getExtraMenuItems(contextMenu);
  const relation = table.relations?.find(
    (candidate) => candidate.from_column === contextMenu.colName,
  );
  const hasRelationAction = Boolean(
    relation && onNavigateRelation && cellTarget,
  );
  const hasNavigationGroup = hasRelationAction || extraItems.length > 0;

  const renderItem = (
    label: string,
    onSelect: () => void,
    options?: {
      disabled?: boolean;
      title?: string;
      icon?: React.ReactNode;
      shortcut?: string;
      destructive?: boolean;
    },
  ) => (
    <button
      key={label}
      type="button"
      disabled={options?.disabled}
      title={options?.title}
      onClick={() => {
        onSelect();
        onClose();
      }}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors",
        options?.destructive
          ? "text-destructive hover:bg-destructive/10 dark:hover:bg-destructive/20"
          : "text-foreground hover:bg-muted dark:hover:bg-muted/80",
        options?.disabled &&
          "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {options?.icon}
        <span className="truncate">{label}</span>
      </div>
      {options?.shortcut && (
        <kbd className="bg-muted text-muted-foreground ml-2 shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px]">
          {options.shortcut}
        </kbd>
      )}
    </button>
  );

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: `${coords.left}px`,
        top: `${coords.top}px`,
      }}
      className="animate-in fade-in-50 zoom-in-95 border-border bg-popover text-popover-foreground z-50 max-h-[calc(100vh-24px)] w-60 overflow-y-auto overscroll-contain rounded-lg border p-1 font-mono text-xs shadow-2xl duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="border-border text-muted-foreground dark:border-border/80 flex items-center justify-between border-b px-2.5 py-1.5 text-[11px] font-semibold">
        <span className="truncate font-medium">
          {cellTarget
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

      {/* Cell Actions */}
      {cellTarget && (
        <div className="py-1">
          {renderItem(
            t("datagrid.contextMenu.editCell", "Edit Cell"),
            () => onEditCell(contextMenu.row, contextMenu.colName, rowIndex),
            {
              disabled: cellWriteBlocked,
              title: mutationBlockedReason,
              icon: <Edit2 className="size-3.5 shrink-0 text-emerald-500" />,
              shortcut: "Enter",
            },
          )}
          {renderItem(
            t("datagrid.contextMenu.setNull", "Set NULL"),
            () => onSetNull(contextMenu.row, contextMenu.colName),
            {
              disabled: cellWriteBlocked,
              title: mutationBlockedReason,
              icon: (
                <MinusCircle className="size-3.5 shrink-0 text-amber-500" />
              ),
            },
          )}
          {renderItem(
            t("datagrid.contextMenu.copyCellValue", "Copy Cell Value"),
            () => {
              void navigator.clipboard.writeText(
                contextMenu.cellValue === null
                  ? "NULL"
                  : String(contextMenu.cellValue ?? ""),
              );
              onCopyNotify?.(t("datagrid.contextMenu.copied"));
            },
            {
              icon: <Copy className="size-3.5 shrink-0 text-blue-500" />,
            },
          )}
          {renderItem(
            t("datagrid.contextMenu.filterByValue", "Filter by this Value"),
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
            {
              disabled:
                contextMenu.cellValue === undefined ||
                contextMenu.cellValue === null,
              icon: <FilterIcon className="size-3.5 shrink-0 text-amber-500" />,
            },
          )}
          {renderItem(
            t("datagrid.contextMenu.inspectCell", "Inspect Cell Detail"),
            () =>
              onInspectCell(
                contextMenu.colName,
                contextMenu.cellValue,
                contextMenu.row,
                targetCol?.type,
              ),
            {
              icon: <FileCode className="text-primary size-3.5 shrink-0" />,
              shortcut: "Space",
            },
          )}
        </div>
      )}

      {/* Sorting Actions */}
      {cellTarget && (
        <>
          <div className="border-border/60 my-0.5 border-t" />
          <div className="py-1">
            {renderItem(
              t("datagrid.contextMenu.sortAsc", "Sort Ascending"),
              () => onSortChange(contextMenu.colName, false),
              {
                icon: (
                  <ArrowUp className="text-muted-foreground size-3.5 shrink-0" />
                ),
              },
            )}
            {renderItem(
              t("datagrid.contextMenu.sortDesc", "Sort Descending"),
              () => onSortChange(contextMenu.colName, true),
              {
                icon: (
                  <ArrowDown className="text-muted-foreground size-3.5 shrink-0" />
                ),
              },
            )}
          </div>
        </>
      )}

      {/* Row Operations */}
      <div className="border-border/60 my-0.5 border-t" />
      <div className="py-1">
        {renderItem(
          t("datagrid.contextMenu.copyRowJson", "Copy Row as JSON"),
          () => {
            const cleanRow = Object.fromEntries(
              Object.entries(contextMenu.row).filter(
                ([key]) => !key.startsWith("_pb_"),
              ),
            );
            void navigator.clipboard.writeText(
              JSON.stringify(cleanRow, null, 2),
            );
            onCopyNotify?.(t("datagrid.contextMenu.copied"));
          },
          {
            icon: <FileJson className="size-3.5 shrink-0 text-purple-500" />,
          },
        )}
        {renderItem(
          t("datagrid.contextMenu.cloneRow", "Clone Row"),
          () => onCloneRow(contextMenu.row),
          {
            disabled: writeBlocked,
            title: mutationBlockedReason,
            icon: (
              <CopyPlus className="text-muted-foreground size-3.5 shrink-0" />
            ),
          },
        )}
        {renderItem(
          t("datagrid.contextMenu.deleteRow", "Delete Row"),
          () => onDeleteRow(contextMenu.row),
          {
            disabled: writeBlocked,
            title: mutationBlockedReason,
            destructive: true,
            icon: <Trash2 className="size-3.5 shrink-0" />,
          },
        )}
      </div>

      {/* Foreign Key & External Navigation */}
      {hasNavigationGroup && (
        <>
          <div className="border-border/60 my-0.5 border-t" />
          <div className="py-1">
            {hasRelationAction && relation && (
              <button
                type="button"
                onClick={() => {
                  onNavigateRelation?.(
                    relation.to_table,
                    relation.to_column,
                    contextMenu.cellValue,
                  );
                  onClose();
                }}
                className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-sky-600 transition-colors hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40"
              >
                <ArrowUpRight className="size-3.5 shrink-0 text-sky-500" />
                <span className="truncate">
                  {t("datagrid.contextMenu.navigateToRelation", {
                    table: relation.to_table,
                    defaultValue: `Navigate to ${relation.to_table}`,
                  })}
                </span>
              </button>
            )}
            {extraItems.map((extra) =>
              renderItem(extra.label, extra.onSelect, {
                disabled: extra.disabled,
                title: extra.title,
                icon: extra.icon ?? (
                  <ArrowUpRight className="size-3.5 shrink-0 text-sky-500" />
                ),
              }),
            )}
          </div>
        </>
      )}
    </div>
  );
});

GridContextMenu.displayName = "GridContextMenu";
