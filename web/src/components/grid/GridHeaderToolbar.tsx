import { memo, type FC, type FormEvent, type RefObject } from "react";
import {
  Table as TableIcon,
  FileCode,
  LayoutList,
  ShieldAlert,
  Search,
  X,
  Filter as FilterIcon,
  RefreshCw,
  Terminal,
  Download,
  ChevronDown,
  FileSpreadsheet,
  FileJson,
  FileCode2,
  Database,
  Settings2,
  UploadCloud,
  Plus,
} from "lucide-react";
import type { TableSchema, FilterOption, DatabaseType } from "@/lib/types";
import type { ExportFormat } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";

export interface GridHeaderToolbarProps {
  table: TableSchema;
  totalCount: number;
  displayedRowsCount: number;
  rawRowsCount: number;
  activeSubView: "grid" | "schema";
  onSubViewChange: (view: "grid" | "schema") => void;
  viewMode: "table" | "document";
  onViewModeChange: (mode: "table" | "document") => void;
  dbType?: DatabaseType;
  isReadOnly?: boolean;
  quickSearch: string;
  onQuickSearchChange: (val: string) => void;
  quickSearchInputRef: RefObject<HTMLInputElement | null>;
  filters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  showFilterBuilder: boolean;
  onToggleFilterBuilder: () => void;
  filterCol: string;
  onFilterColChange: (col: string) => void;
  filterOp: "eq" | "neq" | "gt" | "lt" | "contains";
  onFilterOpChange: (op: "eq" | "neq" | "gt" | "lt" | "contains") => void;
  filterVal: string;
  onFilterValChange: (val: string) => void;
  onAddFilter: (e: FormEvent) => void;
  onRemoveFilter: (index: number) => void;
  extraColumns: string[];
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onOpenQueryConsole?: () => void;
  connId?: string;
  onExport: (format: ExportFormat) => void;
  onOpenImportModal: (mode: "import" | "export") => void;
  onAddRow: () => void;
  t: (key: string, options?: any) => string;
  children?: React.ReactNode;
}

export const GridHeaderToolbar: FC<GridHeaderToolbarProps> = memo(
  ({
    table,
    totalCount,
    displayedRowsCount,
    rawRowsCount,
    activeSubView,
    onSubViewChange,
    viewMode,
    onViewModeChange,
    dbType,
    isReadOnly = false,
    quickSearch,
    onQuickSearchChange,
    quickSearchInputRef,
    filters,
    onFiltersChange,
    showFilterBuilder,
    onToggleFilterBuilder,
    filterCol,
    onFilterColChange,
    filterOp,
    onFilterOpChange,
    filterVal,
    onFilterValChange,
    onAddFilter,
    onRemoveFilter,
    extraColumns,
    isLoading,
    isRefreshing,
    onRefresh,
    onOpenQueryConsole,
    connId,
    onExport,
    onOpenImportModal,
    onAddRow,
    t,
    children,
  }) => {
    return (
      <>
        {/* Top Action Bar */}
        <div className="flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-1 dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="flex h-full min-w-0 items-center gap-2 sm:gap-2.5">
            <SidebarTrigger className="-ml-1 shrink-0 cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" />
            <Separator
              orientation="vertical"
              className="h-4 self-center bg-zinc-200 dark:bg-zinc-800"
            />
            <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
              <TableIcon className="text-primary h-4 w-4 shrink-0" />
              <h2
                className="max-w-28 truncate font-mono text-sm font-semibold text-zinc-900 sm:max-w-36 md:max-w-48 lg:max-w-none dark:text-zinc-100"
                title={table.name}
              >
                {table.name}
              </h2>
            </div>
            <span className="hidden font-mono text-xs whitespace-nowrap text-zinc-500 2xl:inline dark:text-zinc-400">
              {totalCount.toLocaleString()}{" "}
              {totalCount === 1 ? "record" : "records"}
            </span>

            <Separator
              orientation="vertical"
              className="mx-1 hidden h-4 self-center bg-zinc-200 2xl:inline-block dark:bg-zinc-800"
            />

            {/* Sub-view switcher: [ Data Grid ] | [ Schema & DDL ] */}
            <div className="border-border bg-secondary flex shrink-0 items-center rounded border p-0.5">
              <button
                type="button"
                onClick={() => onSubViewChange("grid")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 font-sans text-xs font-medium transition-colors sm:px-2.5",
                  activeSubView === "grid"
                    ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
                title={t("schema.dataGrid")}
              >
                <TableIcon className="text-primary h-3.5 w-3.5 shrink-0" />
                <span className="hidden md:inline">{t("schema.dataGrid")}</span>
              </button>
              <button
                type="button"
                onClick={() => onSubViewChange("schema")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 font-sans text-xs font-medium transition-colors sm:px-2.5",
                  activeSubView === "schema"
                    ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
                title={t("schema.schemaDdl")}
              >
                <FileCode className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
                <span className="hidden md:inline">
                  {t("schema.schemaDdl")}
                </span>
              </button>
            </div>

            {/* View Mode toggle: Table | Document — MongoDB only */}
            {activeSubView === "grid" && dbType === "mongodb" && (
              <div
                className="border-border bg-secondary flex items-center rounded border p-0.5"
                title={t("datagrid.viewMode.toggleTooltip")}
              >
                <button
                  type="button"
                  onClick={() => onViewModeChange("table")}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2 py-1 font-sans text-xs font-medium transition-colors",
                    viewMode === "table"
                      ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                  title={t("datagrid.viewMode.table")}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onViewModeChange("document")}
                  className={cn(
                    "flex items-center gap-1.5 rounded px-2 py-1 font-sans text-xs font-medium transition-colors",
                    viewMode === "document"
                      ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                      : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                  )}
                  title={t("datagrid.viewMode.document")}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {isReadOnly && (
              <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-700 select-none dark:text-amber-400"
                title={t("datagrid.readOnlyBanner")}
              >
                <ShieldAlert className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-400" />
                <span>{t("connection.readOnlyBadge")}</span>
              </Badge>
            )}
            {activeSubView === "grid" &&
              displayedRowsCount !== rawRowsCount && (
                <Badge
                  variant="outline"
                  className="h-auto border-amber-200 bg-amber-50 px-1.5 py-0 font-mono text-[11px] font-normal text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-400/90"
                >
                  {t("datagrid.showingMatches", { count: displayedRowsCount })}
                </Badge>
              )}
          </div>

          <div
            data-tour="grid-toolbar"
            className="flex min-w-0 flex-wrap items-center gap-1 sm:gap-1.5 lg:gap-2"
          >
            {activeSubView === "grid" ? (
              <>
                {/* Quick Search Input */}
                <div className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
                  <Input
                    ref={quickSearchInputRef}
                    type="text"
                    value={quickSearch}
                    onChange={(e) => onQuickSearchChange(e.target.value)}
                    placeholder={`${t("datagrid.searchPlaceholder")} (/)`}
                    aria-label={t("datagrid.searchPlaceholder")}
                    title={t("datagrid.searchScopeHelp")}
                    className="h-8 w-24 pr-7 pl-8 font-mono text-xs transition-all focus:w-44 sm:w-32 sm:focus:w-48 md:w-36 md:focus:w-52 lg:w-44"
                  />
                  {quickSearch && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onQuickSearchChange("")}
                      className="absolute right-1 h-6 w-6 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                      title={t("datagrid.clearSearchTooltip")}
                      aria-label={t("datagrid.clearSearchTooltip")}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Filter toggle */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant={
                          filters.length > 0 || showFilterBuilder
                            ? "secondary"
                            : "outline"
                        }
                        size="sm"
                        onClick={onToggleFilterBuilder}
                        className={cn(
                          "gap-1 px-2 font-mono text-xs font-medium sm:gap-1.5 sm:px-2.5 2xl:px-3",
                          (filters.length > 0 || showFilterBuilder) &&
                            "dark:border-primary/50 border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
                        )}
                      >
                        <FilterIcon className="h-3.5 w-3.5" />
                        <span className="hidden 2xl:inline">
                          {t("datagrid.filterButton")}
                        </span>
                        {filters.length > 0 && (
                          <Badge className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 p-0 text-[10px] font-bold text-white dark:text-zinc-950">
                            {filters.length}
                          </Badge>
                        )}
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom" className="font-mono text-xs">
                    {t("datagrid.filterButton")}
                  </TooltipContent>
                </Tooltip>

                {/* Refresh */}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={onRefresh}
                        disabled={isLoading || isRefreshing}
                        aria-label={t("datagrid.reloadTableTooltip")}
                        className="shrink-0 border-zinc-200 text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 active:bg-zinc-200 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100 dark:active:bg-zinc-700/80"
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5 transition-colors",
                            (isLoading || isRefreshing) &&
                              "animate-spin text-indigo-600 dark:text-indigo-400",
                          )}
                        />
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom" className="font-mono text-xs">
                    {t("datagrid.reloadTableTooltip")}
                  </TooltipContent>
                </Tooltip>

                {/* Open in SQL / Query Console */}
                {onOpenQueryConsole && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenQueryConsole?.()}
                          aria-label={t("datagrid.openQueryConsole")}
                          className="shrink-0 gap-1 border-zinc-200 px-2 font-mono text-xs font-medium text-zinc-700 hover:text-zinc-950 sm:gap-1.5 2xl:px-3 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-white"
                        >
                          <Terminal className="text-primary h-3.5 w-3.5 shrink-0" />
                          <span className="hidden 2xl:inline">
                            {t("datagrid.openQueryConsole")}
                          </span>
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom" className="font-mono text-xs">
                      {t("datagrid.openQueryConsole")}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Bulk Export Dropdown */}
                {connId && (
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <DropdownMenuTrigger
                            render={
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={t("datagrid.export")}
                                className="shrink-0 gap-1 border-zinc-200 px-2 font-mono text-xs font-medium text-zinc-700 hover:text-zinc-950 sm:gap-1.5 2xl:px-3 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-white"
                              >
                                <Download className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                                <span className="hidden 2xl:inline">
                                  {t("datagrid.export")}
                                </span>
                                <ChevronDown className="h-3 w-3 text-zinc-400" />
                              </Button>
                            }
                          />
                        }
                      />
                      <TooltipContent
                        side="bottom"
                        className="font-mono text-xs"
                      >
                        {t("datagrid.export")}
                      </TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent
                      align="end"
                      className="w-52 font-mono text-xs"
                    >
                      <DropdownMenuItem onClick={() => onExport("csv")}>
                        <FileSpreadsheet className="text-primary h-3.5 w-3.5" />
                        <span>{t("datagrid.exportAsCsv")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExport("json")}>
                        <FileJson className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                        <span>{t("datagrid.exportAsJson")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExport("jsonl")}>
                        <FileCode2 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                        <span>{t("datagrid.exportAsJsonl")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExport("xlsx")}>
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                        <span>{t("datagrid.exportAsXlsx")}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExport("parquet")}>
                        <Database className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                        <span>{t("datagrid.exportAsParquet")}</span>
                      </DropdownMenuItem>
                      <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                      <DropdownMenuItem
                        onClick={() => onOpenImportModal("export")}
                      >
                        <Settings2 className="h-3.5 w-3.5 text-zinc-500" />
                        <span>{t("datagrid.exportOptions")}</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Bulk Import CSV Button */}
                {connId && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenImportModal("import")}
                          disabled={isReadOnly}
                          aria-label={
                            isReadOnly
                              ? t("datagrid.readOnlyTooltip")
                              : t("datagrid.importCsv")
                          }
                          className={cn(
                            "shrink-0 gap-1 border-zinc-200 px-2 font-mono text-xs font-medium text-zinc-700 hover:text-zinc-950 sm:gap-1.5 2xl:px-3 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-white",
                            isReadOnly && "cursor-not-allowed opacity-60",
                          )}
                        >
                          <UploadCloud className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                          <span className="hidden 2xl:inline">
                            {t("datagrid.importCsv")}
                          </span>
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom" className="font-mono text-xs">
                      {isReadOnly
                        ? t("datagrid.readOnlyTooltip")
                        : t("datagrid.importCsv")}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Add Row CTA */}
                <Button
                  type="button"
                  size="sm"
                  onClick={onAddRow}
                  disabled={isReadOnly}
                  title={
                    isReadOnly
                      ? t("datagrid.readOnlyTooltip")
                      : t("datagrid.addRow")
                  }
                  className={cn(
                    "shrink-0 gap-1 px-2.5 text-xs font-semibold shadow-xs transition-colors sm:gap-1.5 sm:px-3",
                    isReadOnly
                      ? "cursor-not-allowed border border-zinc-200 bg-zinc-100 text-zinc-400 opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                      : "bg-primary hover:bg-primary/90 text-white",
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">
                    {t("datagrid.addRow")}
                  </span>
                </Button>
              </>
            ) : (
              <>
                {/* Schema View Actions */}
                {onOpenQueryConsole && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onOpenQueryConsole?.()}
                          aria-label={t("datagrid.openQueryConsole")}
                          className="shrink-0 gap-1 border-zinc-200 px-2 font-mono text-xs font-medium text-zinc-700 hover:text-zinc-950 sm:gap-1.5 2xl:px-3 dark:border-zinc-800 dark:text-zinc-300 dark:hover:text-white"
                        >
                          <Terminal className="text-primary h-3.5 w-3.5 shrink-0" />
                          <span className="hidden 2xl:inline">
                            {t("datagrid.openQueryConsole")}
                          </span>
                        </Button>
                      }
                    />
                    <TooltipContent side="bottom" className="font-mono text-xs">
                      {t("datagrid.openQueryConsole")}
                    </TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-sm"
                        onClick={onRefresh}
                        disabled={isLoading || isRefreshing}
                        aria-label={t("datagrid.reloadTableTooltip")}
                        className="shrink-0 border-zinc-200 text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-950 active:bg-zinc-200 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100 dark:active:bg-zinc-700/80"
                      >
                        <RefreshCw
                          className={cn(
                            "h-3.5 w-3.5 transition-colors",
                            (isLoading || isRefreshing) &&
                              "animate-spin text-indigo-600 dark:text-indigo-400",
                          )}
                        />
                      </Button>
                    }
                  />
                  <TooltipContent side="bottom" className="font-mono text-xs">
                    {t("datagrid.reloadTableTooltip")}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>
        </div>

        {activeSubView === "grid" && (
          <>
            {children}
            {(showFilterBuilder || filters.length > 0) && (
              <div className="space-y-2 border-b border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/40">
                {showFilterBuilder && (
                  <form
                    onSubmit={onAddFilter}
                    className="flex flex-wrap items-center gap-2 font-mono text-xs"
                  >
                    <span className="text-zinc-500 dark:text-zinc-400">
                      {t("datagrid.where")}
                    </span>
                    <Select
                      value={filterCol}
                      onValueChange={(val) => {
                        if (typeof val === "string") onFilterColChange(val);
                      }}
                    >
                      <SelectTrigger className="h-7 min-w-32 font-mono text-xs">
                        <SelectValue placeholder={t("datagrid.column")} />
                      </SelectTrigger>
                      <SelectContent side="bottom" align="start">
                        {table.columns.map((c) => (
                          <SelectItem key={c.name} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                        {extraColumns.map((extra) => (
                          <SelectItem key={extra} value={extra}>
                            {extra} (dynamic)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={filterOp}
                      onValueChange={(val) => {
                        if (
                          val === "eq" ||
                          val === "neq" ||
                          val === "gt" ||
                          val === "lt" ||
                          val === "contains"
                        ) {
                          onFilterOpChange(val);
                        }
                      }}
                    >
                      <SelectTrigger className="h-7 min-w-24 font-mono text-xs">
                        <SelectValue placeholder={t("datagrid.operator")} />
                      </SelectTrigger>
                      <SelectContent side="bottom" align="start">
                        <SelectItem value="eq">=</SelectItem>
                        <SelectItem value="neq">≠</SelectItem>
                        <SelectItem value="gt">&gt;</SelectItem>
                        <SelectItem value="lt">&lt;</SelectItem>
                        <SelectItem value="contains">
                          {t("datagrid.contains")}
                        </SelectItem>
                      </SelectContent>
                    </Select>

                    <Input
                      type="text"
                      value={filterVal}
                      onChange={(e) => onFilterValChange(e.target.value)}
                      placeholder={t("datagrid.valuePlaceholder")}
                      className="h-7 w-44 font-mono text-xs"
                    />

                    <Button
                      type="submit"
                      size="sm"
                      disabled={!filterVal}
                      className="h-7 text-xs font-medium"
                    >
                      {t("datagrid.apply")}
                    </Button>
                  </form>
                )}

                {/* Active chips */}
                {filters.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="mr-1 font-mono text-[11px] tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                      {t("datagrid.activeFilters")}
                    </span>
                    {filters.map((f, i) => (
                      <Badge
                        key={i}
                        variant="outline"
                        className="inline-flex items-center gap-1.5 border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-normal text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                      >
                        <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                          {f.column}
                        </span>
                        <span className="text-emerald-600 dark:text-zinc-400">
                          {f.operator}
                        </span>
                        <span className="font-medium text-emerald-800 dark:text-zinc-200">
                          {f.value}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onRemoveFilter(i)}
                          className="ml-0.5 h-4 w-4 p-0 text-current hover:text-rose-500"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      onClick={() => onFiltersChange([])}
                      className="ml-2 h-auto p-0 text-[11px] text-zinc-500 underline hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                    >
                      {t("datagrid.clearAll")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </>
    );
  },
);

GridHeaderToolbar.displayName = "GridHeaderToolbar";
