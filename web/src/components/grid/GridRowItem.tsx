import { memo, type FC, type MouseEvent } from "react";
import { flexRender, type Row } from "@tanstack/react-table";
import { TableRow, TableCell } from "@/components/ui/table";
import { cn } from "cn";

export interface GridRowItemProps {
  row: Row<Record<string, any>>;
  virtualIndex: number;
  measureElement?: (el: HTMLElement | null) => void;
  focusedCell: { rowIndex: number; colName: string } | null;
  editingCell: { rowIndex: number; colName: string } | null;
  onRowContextMenu: (e: MouseEvent, row: Record<string, any>) => void;
  onCellClick: (e: MouseEvent, rowIndex: number, colName: string) => void;
  onCellContextMenu: (
    e: MouseEvent,
    row: Record<string, any>,
    colName: string,
    cellValue: unknown,
  ) => void;
}

const areEqual = (
  prevProps: GridRowItemProps,
  nextProps: GridRowItemProps,
): boolean => {
  if (prevProps.virtualIndex !== nextProps.virtualIndex) return false;
  if (prevProps.row !== nextProps.row) return false;

  const prevIsFocused =
    prevProps.focusedCell?.rowIndex === prevProps.virtualIndex;
  const nextIsFocused =
    nextProps.focusedCell?.rowIndex === nextProps.virtualIndex;
  if (prevIsFocused !== nextIsFocused) return false;
  if (
    prevIsFocused &&
    prevProps.focusedCell?.colName !== nextProps.focusedCell?.colName
  ) {
    return false;
  }

  const prevIsEditing =
    prevProps.editingCell?.rowIndex === prevProps.virtualIndex;
  const nextIsEditing =
    nextProps.editingCell?.rowIndex === nextProps.virtualIndex;
  if (prevIsEditing !== nextIsEditing) return false;
  if (
    prevIsEditing &&
    prevProps.editingCell?.colName !== nextProps.editingCell?.colName
  ) {
    return false;
  }

  return true;
};

export const GridRowItem: FC<GridRowItemProps> = memo(
  ({
    row,
    virtualIndex,
    measureElement,
    focusedCell,
    editingCell,
    onRowContextMenu,
    onCellClick,
    onCellContextMenu,
  }) => {
    return (
      <TableRow
        data-index={virtualIndex}
        ref={measureElement}
        className="group transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
        onContextMenu={(e) => {
          e.preventDefault();
          onRowContextMenu(e, row.original);
        }}
      >
        {row.getVisibleCells().map((cell) => {
          const colId = cell.column.id.replace("_extra_", "");
          const isCellFocused =
            focusedCell?.rowIndex === virtualIndex &&
            focusedCell?.colName === colId;
          const isEditingThisCell =
            editingCell?.rowIndex === virtualIndex &&
            editingCell?.colName === colId;

          return (
            <TableCell
              key={cell.id}
              tabIndex={0}
              data-cell-editing={isEditingThisCell ? "true" : undefined}
              onClick={(e) => {
                e.stopPropagation();
                onCellClick(e, virtualIndex, colId);
              }}
              className={cn(
                "max-w-sm truncate border-zinc-200/80 px-3 py-2 text-xs whitespace-nowrap text-zinc-800 transition-all outline-none not-last:border-r dark:border-zinc-800/40 dark:text-zinc-200",
                isCellFocused &&
                  "relative z-20 bg-emerald-500/10 font-medium ring-2 ring-emerald-500 ring-inset dark:bg-emerald-500/20 dark:ring-emerald-400",
              )}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onCellContextMenu(e, row.original, colId, cell.getValue());
              }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          );
        })}
      </TableRow>
    );
  },
  areEqual,
);

GridRowItem.displayName = "GridRowItem";
