import type { FC } from "react";
import {
  ChevronDown,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  RefreshCw,
  Plus,
  Trash2,
  Download,
  Upload,
  Columns3,
  PanelRight,
  Terminal,
  LayoutList,
  Table as TableIcon,
  Search,
} from "lucide-react";
import type { DatabaseType, TableSchema } from "@/lib/types";
import type { TableSubview } from "./TableSubviewTabs";
import type { ExportFormat } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

interface TableActionToolbarProps {
  table: TableSchema;
  dbType?: DatabaseType;
  activeView: TableSubview;
  viewMode: "table" | "document";
  onViewModeChange: (mode: "table" | "document") => void;
  isReadOnly: boolean;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onAddRow: () => void;
  onDeleteSelected: () => void;
  hasSelectedRow: boolean;
  onExport: (format: ExportFormat) => void;
  onOpenImport: () => void;
  onOpenExportOptions: () => void;
  onOpenQuery?: () => void;
  onFindEverywhere?: () => void;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  hiddenColumns: string[];
  onToggleColumn: (column: string) => void;
  onShowAllColumns: () => void;
  isValueEditorOpen: boolean;
  canOpenValueEditor: boolean;
  onToggleValueEditor: () => void;
  showStats: boolean;
  onToggleStats: () => void;
  t: (key: string, options?: any) => string;
  pendingCount: number;
  isSubmittingDrafts: boolean;
  onSubmitDrafts: () => void;
  onRevertDrafts: () => void;
}

const PAGE_SIZES = [25, 50, 100, 250, 500];

export const TableActionToolbar: FC<TableActionToolbarProps> = ({
  table,
  dbType,
  activeView,
  viewMode,
  onViewModeChange,
  isReadOnly,
  isLoading,
  isRefreshing,
  onRefresh,
  onAddRow,
  onDeleteSelected,
  hasSelectedRow,
  onExport,
  onOpenImport,
  onOpenExportOptions,
  onOpenQuery,
  onFindEverywhere,
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  onPageSizeChange,
  hiddenColumns,
  onToggleColumn,
  onShowAllColumns,
  isValueEditorOpen,
  canOpenValueEditor,
  onToggleValueEditor,
  showStats,
  onToggleStats,
  t,
  pendingCount,
  isSubmittingDrafts,
  onSubmitDrafts,
  onRevertDrafts,
}) => (
  <div className="border-border bg-background dark:border-border dark:bg-background flex min-h-10 shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1">
    <SidebarTrigger className="mr-1 size-7 shrink-0" />
    {onFindEverywhere && (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title="Find this value everywhere"
        aria-label="Find this value everywhere"
        onClick={onFindEverywhere}
      >
        <Search className="size-3.5" />
      </Button>
    )}
    {activeView === "data" && (
      <>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={page <= 0}
          title={t("datagrid.firstPage", "First page")}
          aria-label={t("datagrid.firstPage", "First page")}
          onClick={() => onPageChange(0)}
        >
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={page <= 0}
          title={t("datagrid.previousPage")}
          aria-label={t("datagrid.previousPage")}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        <span className="text-muted-foreground min-w-24 text-center font-mono text-[11px]">
          {totalCount === 0
            ? t("datagrid.zeroRows", "0 rows")
            : t("datagrid.pageRange", {
                from: page * pageSize + 1,
                to: Math.min((page + 1) * pageSize, totalCount),
                total: totalCount,
                defaultValue: "{{from}}–{{to}} of {{total}}",
              })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={page + 1 >= totalPages}
          title={t("datagrid.nextPage")}
          aria-label={t("datagrid.nextPage")}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={page + 1 >= totalPages}
          title={t("datagrid.lastPage", "Last page")}
          aria-label={t("datagrid.lastPage", "Last page")}
          onClick={() => onPageChange(totalPages - 1)}
        >
          <ChevronsRight className="size-3.5" />
        </Button>
        <Select
          value={String(pageSize)}
          onValueChange={(value) => value && onPageSizeChange(Number(value))}
        >
          <SelectTrigger
            aria-label={t("datagrid.perPage")}
            className="h-7 w-[4.5rem] text-[11px]"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {t("datagrid.perPageOption", {
                  size,
                  defaultValue: "{{size}} / page",
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </>
    )}
    <span className="bg-border mx-1 h-5 w-px" />
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      disabled={isLoading || isRefreshing}
      title={t("datagrid.reloadTableTooltip")}
      aria-label={t("datagrid.reloadTableTooltip")}
      onClick={onRefresh}
    >
      <RefreshCw
        className={
          isRefreshing || isLoading ? "size-3.5 animate-spin" : "size-3.5"
        }
      />
    </Button>
    {activeView === "data" && (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isReadOnly}
          title={
            isReadOnly ? t("datagrid.readOnlyTooltip") : t("datagrid.addRow")
          }
          onClick={onAddRow}
          className="h-7 gap-1.5 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          <span>{t("datagrid.addRow")}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={isReadOnly || !hasSelectedRow}
          title={
            isReadOnly
              ? t("datagrid.readOnlyTooltip")
              : t(
                  "datagrid.deleteRow",
                  "Select a row with a primary key to delete it",
                )
          }
          aria-label={t("datagrid.deleteRow", "Delete selected row")}
          onClick={onDeleteSelected}
        >
          <Trash2 className="size-3.5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs"
              >
                <Download className="size-3.5" />
                <span>{t("datagrid.export")}</span>
                <ChevronDown className="size-3" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {(
              [
                "csv",
                "json",
                "jsonl",
                "sql",
                "xlsx",
                "parquet",
              ] as ExportFormat[]
            ).map((format) => (
              <DropdownMenuItem key={format} onClick={() => onExport(format)}>
                {format.toUpperCase()}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={onOpenExportOptions}>
              {t("datagrid.exportOptions")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {dbType === "mongodb" && (
          <div className="flex items-center rounded-md border p-0.5">
            <Button
              type="button"
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="icon-xs"
              title={t("datagrid.viewMode.table")}
              aria-label={t("datagrid.viewMode.table")}
              onClick={() => onViewModeChange("table")}
            >
              <TableIcon className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant={viewMode === "document" ? "secondary" : "ghost"}
              size="icon-xs"
              title={t("datagrid.viewMode.document")}
              aria-label={t("datagrid.viewMode.document")}
              onClick={() => onViewModeChange("document")}
            >
              <LayoutList className="size-3.5" />
            </Button>
          </div>
        )}
      </>
    )}
    {activeView === "data" && (
      <>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isReadOnly}
          className="h-7 gap-1.5 px-2 text-xs"
          title={
            isReadOnly ? t("datagrid.readOnlyTooltip") : t("datagrid.importCsv")
          }
          onClick={onOpenImport}
        >
          <Upload className="size-3.5" />
          <span>{t("datagrid.importCsv")}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t("datagrid.columnVisibility", "Column visibility")}
                aria-label={t("datagrid.columnVisibility", "Column visibility")}
              >
                <Columns3 className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {table.columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.name}
                checked={!hiddenColumns.includes(column.name)}
                onCheckedChange={() => onToggleColumn(column.name)}
              >
                {column.name}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuItem onClick={onShowAllColumns}>
              {t("datagrid.showAllColumns", "Show all columns")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </>
    )}
    {onOpenQuery && (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={t("datagrid.openQueryConsole")}
        aria-label={t("datagrid.openQueryConsole")}
        onClick={onOpenQuery}
      >
        <Terminal className="size-3.5" />
      </Button>
    )}
    <span className="flex-1" />
    {activeView === "data" && (
      <>
        {pendingCount > 0 && (
          <Badge variant="outline" className="h-6 px-2 text-[10px]">
            {t("datagrid.pendingChanges", {
              count: pendingCount,
              defaultValue: "{{count}} pending",
            })}
          </Badge>
        )}
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={pendingCount === 0 || isReadOnly || isSubmittingDrafts}
          title={
            isReadOnly
              ? t("datagrid.readOnlyTooltip")
              : t("datagrid.submitChanges", "Submit")
          }
          onClick={onSubmitDrafts}
        >
          {t("datagrid.submitChanges", "Submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={pendingCount === 0 || isSubmittingDrafts}
          title={t("datagrid.revertChanges", "Revert")}
          onClick={onRevertDrafts}
        >
          {t("datagrid.revertChanges", "Revert")}
        </Button>
      </>
    )}
    {activeView === "data" && (
      <Button
        type="button"
        variant={showStats ? "secondary" : "ghost"}
        size="icon-sm"
        title={t("datagrid.stats", "Table statistics")}
        aria-label={t("datagrid.stats", "Table statistics")}
        onClick={onToggleStats}
      >
        <span className="font-mono text-[10px]">Σ</span>
      </Button>
    )}
    {isReadOnly && (
      <Badge
        variant="outline"
        className="border-warning/40 h-6 gap-1 px-2 text-[10px]"
      >
        <span>Read-only</span>
      </Badge>
    )}
    {dbType !== "redis" && activeView === "data" && (
      <Button
        type="button"
        variant={isValueEditorOpen ? "secondary" : "ghost"}
        size="icon-sm"
        disabled={!canOpenValueEditor}
        title={t("cellInspector.title", "Open value editor")}
        aria-label={t("cellInspector.title", "Open value editor")}
        onClick={onToggleValueEditor}
      >
        <PanelRight className="size-3.5" />
      </Button>
    )}
  </div>
);
