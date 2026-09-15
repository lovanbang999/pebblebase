import {
  useMemo,
  useState,
  useEffect,
  useRef,
  type FC,
  type FormEvent,
} from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  RefreshCw,
  Filter as FilterIcon,
  X,
  Key,
  Layers,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Table as TableIcon,
  ArrowUpRight,
  Search,
  Inbox,
  ShieldAlert,
  Terminal,
  Download,
  UploadCloud,
  FileSpreadsheet,
  FileJson,
  ChevronDown,
  FileCode,
  BarChart3,
} from "lucide-react";
import type { TableSchema, FilterOption, ColumnSchema, TableStats } from "../lib/types";
import { getTableExportUrl, fetchTableStats } from "../lib/api";
import { useTranslation } from "react-i18next";
import { EmptyState } from "./EmptyState";
import { ImportModal } from "./ImportModal";
import { SchemaInspector } from "./SchemaInspector";
import { QuickStatsBar } from "./QuickStatsBar";
import { ColumnAnalyticsDrawer } from "./ColumnAnalyticsDrawer";
import { Button } from "@/components/ui/button";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "cn";

interface DataGridProps {
  table: TableSchema;
  rows: Record<string, any>[];
  totalCount: number;
  isLoading: boolean;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  sortBy: string;
  sortDesc: boolean;
  onSortChange: (column: string, desc: boolean) => void;
  filters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  onRefresh: () => void;
  onAddRow: () => void;
  onEditRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: any,
  ) => void;
  isReadOnly?: boolean;
  onOpenQueryConsole?: () => void;
  connId?: string;
}

export const DataGrid: FC<DataGridProps> = ({
  table,
  rows,
  totalCount,
  isLoading,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortDesc,
  onSortChange,
  filters,
  onFiltersChange,
  onRefresh,
  onAddRow,
  onEditRow,
  onDeleteRow,
  onNavigateRelation,
  isReadOnly = false,
  onOpenQueryConsole,
  connId,
}) => {
  const { t } = useTranslation();
  const [activeSubView, setActiveSubView] = useState<"grid" | "schema">("grid");
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [analyticsColumn, setAnalyticsColumn] = useState<ColumnSchema | null>(null);
  const [tableStats, setTableStats] = useState<TableStats | null>(null);

  useEffect(() => {
    if (!connId || !table.name) return;
    fetchTableStats(connId, table.name)
      .then((stats) => setTableStats(stats))
      .catch(() => setTableStats({ total_rows: totalCount, size_bytes: 0 }));
  }, [connId, table.name, totalCount]);

  const handleExport = (format: "csv" | "json") => {
    if (!connId) return;
    const url = getTableExportUrl(connId, table.name, format, {
      sort_by: sortBy,
      sort_desc: sortDesc,
      filters: filters,
    });
    window.open(url, "_blank");
  };

  // Filter Builder state
  const [filterCol, setFilterCol] = useState(table.columns[0]?.name || "");
  const [filterOp, setFilterOp] = useState<
    "eq" | "neq" | "gt" | "lt" | "contains"
  >("eq");
  const [filterVal, setFilterVal] = useState("");
  const [showFilterBuilder, setShowFilterBuilder] = useState(false);

  // Quick Search state with 300ms debounce
  const [quickSearch, setQuickSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const quickSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(quickSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [quickSearch]);

  // Global shortcut: '/' focuses quick search, 'Escape' clears it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === "/" &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        quickSearchInputRef.current?.focus();
      } else if (
        e.key === "Escape" &&
        document.activeElement === quickSearchInputRef.current
      ) {
        setQuickSearch("");
        quickSearchInputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Update filterCol when table changes
  useEffect(() => {
    setFilterCol(table.columns[0]?.name || "");
  }, [table]);

  // Discover extra fields from rows that were not in sampled table.columns
  const extraColumns = useMemo(() => {
    const schemaColNames = new Set(table.columns.map((c) => c.name));
    const extras = new Set<string>();
    rows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (!schemaColNames.has(k) && !k.startsWith("_pb_")) {
          extras.add(k);
        }
      });
    });
    return Array.from(extras).sort();
  }, [table.columns, rows]);

  // Client-side quick search filtering across all properties
  const displayedRows = useMemo(() => {
    if (!debouncedSearch.trim()) return rows;
    const term = debouncedSearch.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some(
        (v) =>
          v !== null &&
          v !== undefined &&
          String(v).toLowerCase().includes(term),
      ),
    );
  }, [rows, debouncedSearch]);

  // TanStack Table columns
  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    const cols: ColumnDef<Record<string, any>>[] = [
      {
        id: "_row_index",
        header: "#",
        size: 50,
        cell: (info) => (
          <span className="text-zinc-500 font-mono text-[11px] select-none">
            {page * pageSize + info.row.index + 1}
          </span>
        ),
      },
    ];

    // Standard schema columns
    table.columns.forEach((col) => {
      cols.push({
        id: col.name,
        accessorKey: col.name,
        header: () => {
          const isSorted = sortBy === col.name;
          return (
            <div
              className="flex items-center justify-between gap-1.5 cursor-pointer select-none group py-1"
              onClick={() => {
                if (sortBy === col.name) {
                  if (sortDesc) {
                    onSortChange("", false);
                  } else {
                    onSortChange(col.name, true);
                  }
                } else {
                  onSortChange(col.name, false);
                }
              }}
            >
              <div className="flex items-center gap-1.5 truncate">
                {col.is_primary_key && (
                  <span title={t('datagrid.primaryKey')}>
                    <Key className="w-3 h-3 text-amber-400 shrink-0" />
                  </span>
                )}
                {col.is_foreign_key && (
                  <span title={t('datagrid.foreignKey')}>
                    <Layers className="w-3 h-3 text-sky-400 shrink-0" />
                  </span>
                )}
                <span className="font-mono text-xs font-semibold text-zinc-200 truncate">
                  {col.name}
                </span>
                <Badge variant="outline" className="text-[10px] font-mono text-zinc-400 font-normal px-1 py-0 h-4 bg-zinc-800/80 border-transparent">
                  {col.type}
                </Badge>
              </div>

              <div className="flex items-center gap-1">
                {/* Column Analytics Button */}
                <button
                  type="button"
                  title={t('analytics.openAnalytics')}
                  className="p-1 rounded text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/15 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    setAnalyticsColumn(col);
                  }}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                </button>

                <div className="text-zinc-400 group-hover:text-zinc-200">
                  {isSorted ? (
                    sortDesc ? (
                      <ArrowDown className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <ArrowUp className="w-3 h-3 text-emerald-400" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </div>
            </div>
          );
        },
        cell: (info) => {
          const val = info.getValue();

          // Graceful handling of missing / null fields
          if (val === undefined) {
            return (
              <span
                className="text-zinc-600 italic text-[11px] font-mono select-none"
                title={t('datagrid.fieldNotSet')}
              >
                —
              </span>
            );
          }
          if (val === null) {
            return (
              <span className="text-zinc-500 italic text-[11px] font-mono">
                NULL
              </span>
            );
          }

          // Signature Prisma Studio Click-to-Navigate Foreign Key
          if (col.is_foreign_key && onNavigateRelation) {
            const rel = table.relations?.find(
              (r) => r.from_column === col.name,
            );
            if (rel) {
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigateRelation(rel.to_table, rel.to_column, val);
                  }}
                  className="inline-flex items-center gap-1 font-mono text-xs text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 hover:underline group/fk text-left px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/20 hover:bg-sky-100 dark:hover:bg-sky-950/50 border border-sky-200 dark:border-sky-800/30 transition-colors cursor-pointer"
                  title={t('datagrid.navigateToRelation', { table: rel.to_table, column: rel.to_column, val })}
                >
                  <span className="font-semibold">{String(val)}</span>
                  <ArrowUpRight className="w-3 h-3 opacity-70 group-hover/fk:opacity-100 group-hover/fk:translate-x-0.5 group-hover/fk:-translate-y-0.5 transition-all shrink-0" />
                </button>
              );
            }
          }

          // Booleans
          if (typeof val === "boolean") {
            return (
              <Badge
                variant={val ? "default" : "secondary"}
                className={`px-1.5 py-0 h-4 text-[10px] font-mono font-medium ${
                  val
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-transparent"
                }`}
              >
                {String(val)}
              </Badge>
            );
          }

          // Objects / Arrays / BSON
          if (typeof val === "object") {
            return (
              <span
                className="font-mono text-xs text-amber-700 dark:text-amber-300/90 truncate block max-w-xs cursor-help"
                title={JSON.stringify(val, null, 2)}
              >
                {JSON.stringify(val)}
              </span>
            );
          }

          // Primary key highlight
          if (col.is_primary_key) {
            return (
              <div className="flex items-center gap-1.5">
                <Key className="w-3 h-3 text-amber-500 dark:text-amber-400/80 shrink-0" />
                <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  {String(val)}
                </span>
              </div>
            );
          }

          return (
            <span className="font-mono text-xs text-zinc-800 dark:text-zinc-300 truncate block">
              {String(val)}
            </span>
          );
        },
      });
    });

    // Dynamic extra columns found in schemaless documents
    extraColumns.forEach((extraColName) => {
      cols.push({
        id: `_extra_${extraColName}`,
        accessorKey: extraColName,
        header: () => {
          const isSorted = sortBy === extraColName;
          return (
            <div
              className="flex items-center justify-between gap-1.5 cursor-pointer select-none group py-1"
              onClick={() => {
                if (sortBy === extraColName) {
                  if (sortDesc) {
                    onSortChange("", false);
                  } else {
                    onSortChange(extraColName, true);
                  }
                } else {
                  onSortChange(extraColName, false);
                }
              }}
            >
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-mono text-xs font-semibold text-amber-200/90 truncate">
                  {extraColName}
                </span>
                <Badge variant="outline" className="text-[9px] font-mono text-amber-400/90 font-normal px-1 py-0 h-4 bg-amber-950/50 border-amber-800/40">
                  {t('datagrid.dynamicBadge')}
                </Badge>
              </div>
              <div className="text-zinc-400 group-hover:text-zinc-200">
                {isSorted ? (
                  sortDesc ? (
                    <ArrowDown className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <ArrowUp className="w-3 h-3 text-emerald-400" />
                  )
                ) : (
                  <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
            </div>
          );
        },
        cell: (info) => {
          const val = info.getValue();
          if (val === undefined) {
            return (
              <span
                className="text-zinc-600 italic text-[11px] font-mono select-none"
                title={t('datagrid.fieldNotSet')}
              >
                —
              </span>
            );
          }
          if (val === null) {
            return (
              <span className="text-zinc-500 italic text-[11px] font-mono">
                NULL
              </span>
            );
          }
          if (typeof val === "boolean") {
            return (
              <Badge
                variant={val ? "default" : "secondary"}
                className={`px-1.5 py-0 h-4 text-[10px] font-mono font-medium ${
                  val
                    ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-transparent"
                }`}
              >
                {String(val)}
              </Badge>
            );
          }
          if (typeof val === "object") {
            return (
              <span
                className="font-mono text-xs text-amber-700 dark:text-amber-300/90 truncate block max-w-xs cursor-help"
                title={JSON.stringify(val, null, 2)}
              >
                {JSON.stringify(val)}
              </span>
            );
          }
          return (
            <span className="font-mono text-xs text-zinc-800 dark:text-zinc-300 truncate block">
              {String(val)}
            </span>
          );
        },
      });
    });

    // Row Actions column
    cols.push({
      id: "_actions",
      header: "",
      size: 70,
      cell: (info) => (
        <div className="flex items-center justify-end gap-1 opacity-70 hover:opacity-100 transition-opacity">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isReadOnly}
            title={isReadOnly ? t('datagrid.readOnlyTooltip') : t('datagrid.editRecordTooltip')}
            onClick={(e) => {
              e.stopPropagation();
              if (!isReadOnly) onEditRow(info.row.original);
            }}
            className={cn(
              "h-6 w-6",
              isReadOnly
                ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed opacity-50"
                : "text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400"
            )}
          >
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={isReadOnly}
            title={isReadOnly ? t('datagrid.readOnlyTooltip') : t('datagrid.deleteRecordTooltip')}
            onClick={(e) => {
              e.stopPropagation();
              if (!isReadOnly) onDeleteRow(info.row.original);
            }}
            className={cn(
              "h-6 w-6",
              isReadOnly
                ? "text-zinc-300 dark:text-zinc-600 cursor-not-allowed opacity-50"
                : "text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400"
            )}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    });

    return cols;
  }, [
    table,
    extraColumns,
    sortBy,
    sortDesc,
    onSortChange,
    page,
    pageSize,
    onEditRow,
    onDeleteRow,
    onNavigateRelation,
    isReadOnly,
    t,
  ]);

  // eslint-disable-next-line react-hooks/incompatible-library, react/incompatible-library
  const reactTable = useReactTable({
    data: displayedRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  const handleAddFilter = (e: FormEvent) => {
    e.preventDefault();
    if (!filterCol || !filterVal) return;
    onFiltersChange([
      ...filters,
      { column: filterCol, operator: filterOp, value: filterVal },
    ]);
    setFilterVal("");
  };

  const handleRemoveFilter = (index: number) => {
    const updated = [...filters];
    updated.splice(index, 1);
    onFiltersChange(updated);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-950 overflow-hidden transition-colors">
      {/* Top Action Bar */}
      <div className="h-11 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900/30">
        <div className="flex items-center gap-2.5 h-full">
          <SidebarTrigger className="-ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer shrink-0" />
          <Separator orientation="vertical" className="h-4 bg-zinc-200 dark:bg-zinc-800 self-center" />
          <div className="flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h2 className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {table.name}
            </h2>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
            {totalCount.toLocaleString()}{" "}
            {totalCount === 1 ? "record" : "records"}
          </span>

          <Separator orientation="vertical" className="h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 self-center" />

          {/* Sub-view switcher: [ Data Grid ] | [ Schema & DDL ] */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-700/60">
            <button
              type="button"
              onClick={() => setActiveSubView("grid")}
              className={cn(
                "px-2.5 py-1 text-xs font-mono font-medium rounded flex items-center gap-1.5 transition-all",
                activeSubView === "grid"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              <TableIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>{t("schema.dataGrid")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView("schema")}
              className={cn(
                "px-2.5 py-1 text-xs font-mono font-medium rounded flex items-center gap-1.5 transition-all",
                activeSubView === "schema"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              )}
            >
              <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>{t("schema.schemaDdl")}</span>
            </button>
          </div>

          {isReadOnly && (
            <Badge
              variant="outline"
              className="text-[11px] font-mono px-2 py-0.5 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10 gap-1 select-none font-medium"
              title={t('datagrid.readOnlyBanner')}
            >
              <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t('connection.readOnlyBadge')}</span>
            </Badge>
          )}
          {activeSubView === "grid" && displayedRows.length !== rows.length && (
            <Badge variant="outline" className="text-[11px] text-amber-700 dark:text-amber-400/90 font-mono bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 px-1.5 py-0 h-auto font-normal">
              {t('datagrid.showingMatches', { count: displayedRows.length })}
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeSubView === "grid" ? (
            <>
              {/* Quick Search Input */}
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-500 absolute left-2.5 pointer-events-none" />
                <Input
                  ref={quickSearchInputRef}
                  type="text"
                  value={quickSearch}
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder={`${t('datagrid.searchPlaceholder')} (/)`}
                  className="pl-8 pr-7 h-8 text-xs font-mono w-52"
                />
                {quickSearch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setQuickSearch("")}
                    className="absolute right-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 h-6 w-6"
                    title={t('datagrid.clearSearchTooltip')}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>

              {/* Filter toggle */}
              <Button
                type="button"
                variant={filters.length > 0 || showFilterBuilder ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowFilterBuilder(!showFilterBuilder)}
                className={cn(
                  "text-xs font-mono font-medium gap-1.5",
                  (filters.length > 0 || showFilterBuilder) &&
                    "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300"
                )}
              >
                <FilterIcon className="w-3.5 h-3.5" />
                {t('datagrid.filterButton')}
                {filters.length > 0 && (
                  <Badge className="w-4 h-4 p-0 rounded-full bg-emerald-500 text-white dark:text-zinc-950 text-[10px] font-bold flex items-center justify-center">
                    {filters.length}
                  </Badge>
                )}
              </Button>

              {/* Refresh */}
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={onRefresh}
                disabled={isLoading}
                title={t('datagrid.reloadTableTooltip')}
                className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:white"
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
                />
              </Button>

              {/* Open in SQL / Query Console */}
              {onOpenQueryConsole && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenQueryConsole}
                  title={t('datagrid.openQueryConsole')}
                  className="text-xs font-mono font-medium gap-1.5 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('datagrid.openQueryConsole')}</span>
                </Button>
              )}

              {/* Bulk Export Dropdown */}
              {connId && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        title={t("datagrid.export")}
                        className="text-xs font-mono font-medium gap-1.5 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-500" />
                        <span>{t("datagrid.export")}</span>
                        <ChevronDown className="w-3 h-3 text-zinc-400" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-44 text-xs font-mono">
                    <DropdownMenuItem onClick={() => handleExport("csv")}>
                      <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{t("datagrid.exportAsCsv")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("json")}>
                      <FileJson className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>{t("datagrid.exportAsJson")}</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Bulk Import CSV Button */}
              {connId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsImportModalOpen(true)}
                  disabled={isReadOnly}
                  title={isReadOnly ? t("datagrid.readOnlyTooltip") : t("datagrid.importCsv")}
                  className={cn(
                    "text-xs font-mono font-medium gap-1.5 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white",
                    isReadOnly && "cursor-not-allowed opacity-60"
                  )}
                >
                  <UploadCloud className="w-3.5 h-3.5 text-zinc-500" />
                  <span>{t("datagrid.importCsv")}</span>
                </Button>
              )}

              {/* Add Row CTA */}
              <Button
                type="button"
                size="sm"
                onClick={onAddRow}
                disabled={isReadOnly}
                title={isReadOnly ? t('datagrid.readOnlyTooltip') : t('datagrid.addRow')}
                className={cn(
                  "text-xs font-semibold gap-1.5 shadow-xs transition-colors",
                  isReadOnly
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 cursor-not-allowed opacity-60"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white"
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                {t('datagrid.addRow')}
              </Button>
            </>
          ) : (
            <>
              {/* Schema View Actions */}
              {onOpenQueryConsole && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenQueryConsole}
                  title={t('datagrid.openQueryConsole')}
                  className="text-xs font-mono font-medium gap-1.5 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white"
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{t('datagrid.openQueryConsole')}</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={onRefresh}
                disabled={isLoading}
                title={t('datagrid.reloadTableTooltip')}
                className="text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:white"
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
                />
              </Button>
            </>
          )}
        </div>
      </div>

      {activeSubView === "schema" ? (
        <SchemaInspector
          connId={connId}
          table={table}
          onNavigateRelation={onNavigateRelation}
        />
      ) : (
        <>
          {/* Quick Stats Bar */}
          <QuickStatsBar
            table={table}
            stats={tableStats}
            totalFilteredRows={totalCount}
            isFiltered={filters.length > 0}
          />

      {/* Read-Only Safety Banner */}
      {isReadOnly && (
        <div className="px-3 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between text-xs font-mono text-amber-800 dark:text-amber-300">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="font-medium">{t('datagrid.readOnlyBanner')}</span>
          </div>
          <Badge variant="outline" className="text-[10px] uppercase font-bold border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/20">
            {t('connection.readOnlyBadge')}
          </Badge>
        </div>
      )}

      {/* Filter Builder & Active Filter Chips */}
      {(showFilterBuilder || filters.length > 0) && (
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-800/80 bg-zinc-50 dark:bg-zinc-900/40 space-y-2">
          {showFilterBuilder && (
            <form
              onSubmit={handleAddFilter}
              className="flex items-center gap-2 flex-wrap text-xs font-mono"
            >
              <span className="text-zinc-500 dark:text-zinc-400">{t('datagrid.where')}</span>
              <Select
                value={filterCol}
                onValueChange={(val) => { if (typeof val === 'string') setFilterCol(val); }}
              >
                <SelectTrigger className="h-7 text-xs font-mono min-w-32">
                  <SelectValue placeholder={t('datagrid.column')} />
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
                onValueChange={(val) => { if (typeof val === 'string') setFilterOp(val as any); }}
              >
                <SelectTrigger className="h-7 text-xs font-mono min-w-24">
                  <SelectValue placeholder={t('datagrid.operator')} />
                </SelectTrigger>
                <SelectContent side="bottom" align="start">
                  <SelectItem value="eq">=</SelectItem>
                  <SelectItem value="neq">≠</SelectItem>
                  <SelectItem value="gt">&gt;</SelectItem>
                  <SelectItem value="lt">&lt;</SelectItem>
                  <SelectItem value="contains">CONTAINS</SelectItem>
                </SelectContent>
              </Select>

              <Input
                type="text"
                value={filterVal}
                onChange={(e) => setFilterVal(e.target.value)}
                placeholder={t('datagrid.valuePlaceholder')}
                className="h-7 text-xs font-mono w-44"
              />

              <Button
                type="submit"
                size="sm"
                disabled={!filterVal}
                className="h-7 text-xs font-medium"
              >
                {t('datagrid.apply')}
              </Button>
            </form>
          )}

          {/* Active chips */}
          {filters.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider mr-1">
                {t('datagrid.activeFilters')}
              </span>
              {filters.map((f, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs font-mono font-normal"
                >
                  <span className="font-semibold text-emerald-900 dark:text-emerald-200">{f.column}</span>
                  <span className="text-emerald-600 dark:text-zinc-400">{f.operator}</span>
                  <span className="text-emerald-800 dark:text-zinc-200 font-medium">{f.value}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleRemoveFilter(i)}
                    className="h-4 w-4 p-0 hover:text-rose-500 text-current ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </Badge>
              ))}
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => onFiltersChange([])}
                className="h-auto p-0 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 ml-2 underline"
              >
                {t('datagrid.clearAll')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Grid Container */}
      <div className="flex-1 overflow-auto relative flex flex-col">
        {isLoading ? (
          /* Loading Skeletons */
          <div className="flex-1 overflow-hidden p-4 space-y-2 animate-in fade-in duration-200">
            <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/20">
              <div className="h-10 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/60 px-4 flex items-center gap-4">
                <Skeleton className="h-3 w-6 rounded" />
                {table.columns.slice(0, 5).map((c) => (
                  <Skeleton
                    key={c.name}
                    className="h-3.5 w-28 rounded"
                  />
                ))}
              </div>
              {[1, 2, 3, 4, 5, 6, 7, 8].map((rowIdx) => (
                <div
                  key={rowIdx}
                  className="h-10 border-b border-zinc-200/60 dark:border-zinc-800/40 px-4 flex items-center gap-4"
                >
                  <Skeleton className="h-3 w-6 rounded" />
                  <Skeleton className="h-3 w-28 rounded" />
                  <Skeleton className="h-3 w-40 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                  <Skeleton className="h-3 w-32 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : displayedRows.length === 0 ? (
          /* Empty States */
          <div className="flex-1 flex items-center justify-center p-8">
            {quickSearch ? (
              <EmptyState
                icon={Search}
                title={t('datagrid.noSearchResultsTitle')}
                description={t('datagrid.noSearchResultsDesc', { term: quickSearch })}
                action={{
                  label: t('datagrid.clearSearch'),
                  onClick: () => setQuickSearch(""),
                }}
              />
            ) : filters.length > 0 ? (
              <EmptyState
                icon={FilterIcon}
                title={t('datagrid.noMatchingFiltersTitle')}
                description={t('datagrid.noMatchingFiltersDesc')}
                action={{
                  label: t('datagrid.clearAllFilters'),
                  onClick: () => onFiltersChange([]),
                }}
              />
            ) : (
              <EmptyState
                icon={Inbox}
                title={t('datagrid.tableIsEmptyTitle')}
                description={t('datagrid.tableIsEmptyDesc', { table: table.name })}
                action={
                  isReadOnly
                    ? undefined
                    : {
                        label: t('datagrid.insertFirstRecord'),
                        onClick: onAddRow,
                        icon: Plus,
                      }
                }
              />
            )}
          </div>
        ) : (
          /* Data Table */
          <Table className="w-full border-collapse text-left border-b border-zinc-200 dark:border-zinc-800">
            <TableHeader className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
              {reactTable.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className="px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 not-last:border-r border-zinc-200 dark:border-zinc-800/80 whitespace-nowrap h-auto"
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>

            <TableBody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
              {reactTable.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors group",
                    !isReadOnly && "cursor-pointer"
                  )}
                  onClick={() => !isReadOnly && onEditRow(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className="px-3 py-2 text-xs not-last:border-r border-zinc-200/80 dark:border-zinc-800/40 whitespace-nowrap max-w-sm truncate text-zinc-800 dark:text-zinc-200"
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination Footer */}
      <div className="h-11 px-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 flex items-center justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400">
        <div className="flex items-center gap-3">
          <span>
            {totalCount === 0
              ? `0 ${t('datagrid.records')}`
              : `${t('datagrid.showing')} ${page * pageSize + 1} - ${Math.min((page + 1) * pageSize, totalCount)} ${t('datagrid.of')} ${totalCount}`}
          </span>
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{t('datagrid.perPage')}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(val) => val && onPageSizeChange(Number(val))}
            >
              <SelectTrigger className="h-6 w-16 px-2 py-0 text-xs font-mono">
                <SelectValue placeholder={String(pageSize)} />
              </SelectTrigger>
              <SelectContent side="top" align="start" className="min-w-16">
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            {t('datagrid.page')} {page + 1} {t('datagrid.of')} {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={page <= 0}
              onClick={() => onPageChange(page - 1)}
              className="text-zinc-700 dark:text-zinc-300"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              disabled={page + 1 >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="text-zinc-700 dark:text-zinc-300"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
      </>
      )}

      {connId && (
        <ImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          connId={connId}
          table={table}
          onSuccess={() => {
            onRefresh();
          }}
        />
      )}

      {connId && (
        <ColumnAnalyticsDrawer
          isOpen={analyticsColumn !== null}
          onClose={() => setAnalyticsColumn(null)}
          connectionId={connId}
          tableName={table.name}
          column={analyticsColumn}
          activeFilters={filters}
        />
      )}
    </div>
  );
};
