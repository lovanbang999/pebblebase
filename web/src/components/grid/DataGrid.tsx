import {
  useMemo,
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
  useCallback,
  type FC,
  type FormEvent,
} from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Filter as FilterIcon,
  X,
  Key,
  Layers,
  ArrowUpRight,
  Search,
  Inbox,
  ShieldAlert,
  BarChart3,
  MoreVertical,
  Copy,
  RotateCcw,
  Check,
} from "lucide-react";
import type {
  TableSchema,
  FilterOption,
  ColumnSchema,
  TableStats,
  DatabaseType,
} from "@/lib/types";
import { exportTableData, fetchTableStats, type ExportFormat } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/common";
import { QuickStatsBar } from "./QuickStatsBar";
import {
  ClickHouseComplexCell,
  detectClickHouseComplexType,
} from "./ClickHouseComplexCell";
import {
  PAGE_SIZE_OPTIONS,
  VIRTUALIZER_ROW_HEIGHT,
  VIRTUALIZER_OVERSCAN,
  COPY_FEEDBACK_MS,
} from "@/constants";

const ImportModal = lazy(() =>
  import("@/components/modals/ImportModal").then((m) => ({
    default: m.ImportModal,
  })),
);
const SchemaInspector = lazy(() =>
  import("@/components/schema/SchemaInspector").then((m) => ({
    default: m.SchemaInspector,
  })),
);
const ColumnAnalyticsDrawer = lazy(() =>
  import("./ColumnAnalyticsDrawer").then((m) => ({
    default: m.ColumnAnalyticsDrawer,
  })),
);
const CellDetailDrawer = lazy(() =>
  import("./cell-inspector/CellDetailDrawer").then((m) => ({
    default: m.CellDetailDrawer,
  })),
);
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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
  onRefresh: () => void | Promise<void>;
  onAddRow: () => void;
  onEditRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
  onDuplicateRow?: (row: Record<string, any>) => void;
  onSaveCell?: (
    row: Record<string, any>,
    columnName: string,
    newValue: any,
  ) => Promise<void>;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: any,
  ) => void;
  isReadOnly?: boolean;
  onOpenQueryConsole?: (query?: string, title?: string) => void;
  connId?: string;
  dbType?: DatabaseType;
}

import { DocumentView } from "./DocumentView";
import { GridContextMenu, type ContextMenuState } from "./GridContextMenu";
import { GridPaginationFooter } from "./GridPaginationFooter";
import { GridHeaderToolbar } from "./GridHeaderToolbar";
import { GridRowItem } from "./GridRowItem";

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
  onDuplicateRow,
  onSaveCell,
  onNavigateRelation,
  isReadOnly = false,
  onOpenQueryConsole,
  connId,
  dbType,
}) => {
  const { t } = useTranslation();
  const [activeSubView, setActiveSubView] = useState<"grid" | "schema">("grid");
  const [viewMode, setViewMode] = useState<"table" | "document">(
    dbType === "mongodb" ? "document" : "table",
  );
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalMode, setImportModalMode] = useState<"import" | "export">(
    "import",
  );
  const [analyticsColumn, setAnalyticsColumn] = useState<ColumnSchema | null>(
    null,
  );
  const [tableStats, setTableStats] = useState<TableStats | null>(null);
  const [copiedCol, setCopiedCol] = useState<string | null>(null);

  // Listen for external subview switch requests (e.g. from table context menu)
  useEffect(() => {
    const handleSwitchSubView = (e: Event) => {
      const customEvent = e as CustomEvent<"grid" | "schema">;
      if (customEvent.detail === "grid" || customEvent.detail === "schema") {
        setActiveSubView(customEvent.detail);
      }
    };
    window.addEventListener("pb:switch-subview", handleSwitchSubView);
    return () => {
      window.removeEventListener("pb:switch-subview", handleSwitchSubView);
    };
  }, []);

  // Right-click Context Menu State
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [cellDrawerState, setCellDrawerState] = useState<{
    isOpen: boolean;
    columnName: string;
    columnType?: string;
    cellValue: unknown;
    row?: Record<string, any>;
  }>({
    isOpen: false,
    columnName: "",
    cellValue: null,
  });
  const [copiedNotification, setCopiedNotification] = useState<string | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing || isLoading) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  // Close context menu on click outside, scroll, or Escape key
  useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", handleClose);
    window.addEventListener("contextmenu", handleClose);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleClose, true);
    return () => {
      window.removeEventListener("click", handleClose);
      window.removeEventListener("contextmenu", handleClose);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleClose, true);
    };
  }, [contextMenu]);

  // Focused Cell & Inline Cell Editing State
  const [focusedCell, setFocusedCell] = useState<{
    rowIndex: number;
    colName: string;
  } | null>(null);
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    colName: string;
  } | null>(null);
  const [inlineValue, setInlineValue] = useState<string>("");

  const startEditingCell = useCallback(
    (row: Record<string, any>, colName: string, rowIndex: number) => {
      if (isReadOnly) return;
      const colSchema = table.columns.find((c) => c.name === colName);
      if (colSchema?.is_primary_key) return;

      setFocusedCell({ rowIndex, colName });
      setEditingCell({ rowIndex, colName });
      const currentVal = row[colName];
      setInlineValue(
        currentVal === null || currentVal === undefined
          ? ""
          : String(currentVal),
      );
    },
    [isReadOnly, table.columns],
  );

  const handleRowContextMenu = useCallback(
    (e: React.MouseEvent, row: Record<string, any>) => {
      setContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
        row,
        colName: "",
        cellValue: undefined,
      });
    },
    [],
  );

  const handleCellClick = useCallback(
    (_e: React.MouseEvent, rowIndex: number, colName: string) => {
      setFocusedCell({ rowIndex, colName });
    },
    [],
  );

  const handleCellContextMenu = useCallback(
    (
      e: React.MouseEvent,
      row: Record<string, any>,
      colName: string,
      cellValue: unknown,
    ) => {
      setContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
        row,
        colName,
        cellValue,
      });
    },
    [],
  );

  useEffect(() => {
    if (!connId || !table.name) return;
    fetchTableStats(connId, table.name)
      .then((stats) => setTableStats(stats))
      .catch(() => setTableStats({ total_rows: totalCount, size_bytes: 0 }));
  }, [connId, table.name, totalCount]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    if (!connId || isExporting) return;
    try {
      setIsExporting(true);
      const blob = await exportTableData(connId, table.name, format, {
        sort_by: sortBy,
        sort_desc: sortDesc,
        filters: filters,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${table.name}.${format === "xlsx" ? "xlsx" : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      console.error("Export failed:", err);
    } finally {
      setIsExporting(false);
    }
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

  // Phase 33: Column-Level Inline Search (Ctrl+F)
  const [openSearchCols, setOpenSearchCols] = useState<Record<string, boolean>>(
    {},
  );
  const [columnSearches, setColumnSearches] = useState<Record<string, string>>(
    {},
  );
  const searchInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);

  // Sync column searches with incoming filters prop
  useEffect(() => {
    const next: Record<string, string> = {};
    filters.forEach((f) => {
      if (f.operator === "contains") {
        next[f.column] = f.value;
      }
    });
    setColumnSearches(next);
    setOpenSearchCols((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((k) => {
        if (!next[k] && document.activeElement !== searchInputRefs.current[k]) {
          delete updated[k];
        }
      });
      return updated;
    });
  }, [filters]);

  // Reset open column searches when switching tables
  useEffect(() => {
    setOpenSearchCols({});
    setColumnSearches({});
  }, [table.name]);

  const handleOpenColumnSearch = useCallback((colName: string) => {
    setOpenSearchCols((prev) => ({ ...prev, [colName]: true }));
    setTimeout(() => {
      const el = searchInputRefs.current[colName];
      if (el) {
        el.focus();
        el.select();
      }
    }, 40);
  }, []);

  const handleCloseColumnSearch = useCallback((colName: string) => {
    setOpenSearchCols((prev) => {
      const next = { ...prev };
      delete next[colName];
      return next;
    });
  }, []);

  const handleColumnSearchChange = useCallback(
    (colName: string, val: string) => {
      setColumnSearches((prev) => ({ ...prev, [colName]: val }));
      const otherFilters = filters.filter(
        (f) => !(f.column === colName && f.operator === "contains"),
      );
      if (val.trim() !== "") {
        onFiltersChange([
          ...otherFilters,
          { column: colName, operator: "contains", value: val },
        ]);
      } else {
        onFiltersChange(otherFilters);
      }
    },
    [filters, onFiltersChange],
  );

  const handleClearColumnSearch = useCallback(
    (colName: string) => {
      setColumnSearches((prev) => {
        const next = { ...prev };
        delete next[colName];
        return next;
      });
      handleCloseColumnSearch(colName);
      const otherFilters = filters.filter(
        (f) => !(f.column === colName && f.operator === "contains"),
      );
      onFiltersChange(otherFilters);
    },
    [filters, onFiltersChange, handleCloseColumnSearch],
  );

  const handleColumnSearchBlur = useCallback(
    (colName: string) => {
      if (!columnSearches[colName]?.trim()) {
        handleCloseColumnSearch(colName);
      }
    },
    [columnSearches, handleCloseColumnSearch],
  );

  const handleColumnSearchKeyDown = useCallback(
    (colName: string, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleClearColumnSearch(colName);
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    [handleClearColumnSearch],
  );

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
          <span className="font-mono text-[11px] text-zinc-500 select-none">
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
          const isSearchOpen = Boolean(openSearchCols[col.name]);
          const activeSearchVal = columnSearches[col.name] ?? "";
          const hasActiveFilter = Boolean(activeSearchVal.trim());

          if (isSearchOpen) {
            return (
              <div
                data-column-search="true"
                className="flex w-full min-w-32.5 items-center gap-1 py-0.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="relative flex flex-1 items-center">
                  <Search className="pointer-events-none absolute left-2 h-3 w-3 shrink-0 text-emerald-500" />
                  <input
                    ref={(el) => {
                      searchInputRefs.current[col.name] = el;
                    }}
                    type="text"
                    autoFocus
                    value={activeSearchVal}
                    onChange={(e) =>
                      handleColumnSearchChange(col.name, e.target.value)
                    }
                    onKeyDown={(e) => handleColumnSearchKeyDown(col.name, e)}
                    onBlur={() => handleColumnSearchBlur(col.name)}
                    placeholder={t("grid.column.search.placeholder", {
                      column: col.name,
                    })}
                    className="h-6 w-full rounded border border-emerald-500/80 bg-white py-0.5 pr-6 pl-7 font-mono text-xs text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:ring-1 focus:ring-emerald-500 focus:outline-none dark:border-emerald-500/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                  <button
                    type="button"
                    title={t("grid.column.search.clear")}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearColumnSearch(col.name);
                    }}
                    className="absolute right-1 cursor-pointer rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              className="group flex cursor-pointer items-center justify-between gap-1.5 py-1 select-none"
              onMouseEnter={() => setHoveredCol(col.name)}
              onMouseLeave={() =>
                setHoveredCol((prev) => (prev === col.name ? null : prev))
              }
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
                  <span title={t("datagrid.primaryKey")}>
                    <Key className="h-3 w-3 shrink-0 text-amber-400" />
                  </span>
                )}
                {col.is_foreign_key && (
                  <span title={t("datagrid.foreignKey")}>
                    <Layers className="h-3 w-3 shrink-0 text-sky-400" />
                  </span>
                )}
                <span className="truncate font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-200">
                  {col.name}
                </span>
                <Badge
                  variant="outline"
                  className="h-4 border-zinc-300/60 bg-zinc-200/60 px-1 py-0 font-mono text-[10px] font-normal text-zinc-600 dark:border-transparent dark:bg-zinc-800/80 dark:text-zinc-400"
                >
                  {col.type}
                </Badge>
                {hasActiveFilter && (
                  <Badge
                    variant="outline"
                    className="h-3.5 border-emerald-500/30 bg-emerald-500/10 px-1 py-0 font-mono text-[9px] font-medium text-emerald-600 dark:text-emerald-400"
                    title={`contains: ${activeSearchVal}`}
                  >
                    🔍
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-0.5">
                {/* Inline Search Button (🔍) */}
                <button
                  type="button"
                  title={`${t("grid.column.search.placeholder", { column: col.name })} (Ctrl+F)`}
                  className={cn(
                    "cursor-pointer rounded p-1 transition-all focus:outline-none",
                    hasActiveFilter
                      ? "bg-emerald-500/10 text-emerald-500 opacity-100 dark:text-emerald-400"
                      : "text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenColumnSearch(col.name);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Search className="h-3 w-3" />
                </button>

                {/* Sort indicator */}
                <div className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                  {isSorted ? (
                    sortDesc ? (
                      <ArrowDown className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
                    ) : (
                      <ArrowUp className="h-3 w-3 text-emerald-500 dark:text-emerald-400" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </div>

                {/* Column Action Menu (⋮) */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        title={t("analytics.columnMenu")}
                        className="cursor-pointer rounded p-1 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-200 hover:text-zinc-900 focus:outline-none data-popup-open:opacity-100 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="z-50 w-48 border border-zinc-200 bg-white p-1 text-zinc-900 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 hover:text-indigo-900 dark:text-indigo-300 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-200"
                      onClick={() => setAnalyticsColumn(col)}
                    >
                      <BarChart3 className="h-3.5 w-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
                      <span>{t("analytics.openAnalytics")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      onClick={() => handleOpenColumnSearch(col.name)}
                    >
                      <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span>
                        {t("grid.column.search.placeholder", {
                          column: col.name,
                        })}
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1 bg-zinc-200 dark:bg-zinc-800" />

                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      onClick={() => onSortChange(col.name, false)}
                    >
                      <ArrowUp className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span>{t("analytics.sortAsc")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      onClick={() => onSortChange(col.name, true)}
                    >
                      <ArrowDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span>{t("analytics.sortDesc")}</span>
                    </DropdownMenuItem>

                    {isSorted && (
                      <DropdownMenuItem
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-amber-700 hover:bg-amber-50 hover:text-amber-900 dark:text-amber-400/90 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                        onClick={() => onSortChange("", false)}
                      >
                        <RotateCcw className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span>{t("analytics.clearSort")}</span>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator className="my-1 bg-zinc-200 dark:bg-zinc-800" />

                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      onClick={() => {
                        setFilterCol(col.name);
                        setShowFilterBuilder(true);
                      }}
                    >
                      <FilterIcon className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      <span>{t("analytics.filterByColumn")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      onClick={() => {
                        navigator.clipboard.writeText(col.name);
                        setCopiedCol(col.name);
                        setTimeout(() => setCopiedCol(null), COPY_FEEDBACK_MS);
                      }}
                    >
                      {copiedCol === col.name ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                      )}
                      <span>
                        {copiedCol === col.name
                          ? t("analytics.columnNameCopied")
                          : t("analytics.copyColumnName")}
                      </span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        },
        cell: (info) => {
          const row = info.row.original;
          const rowIndex = info.row.index;
          const val = info.getValue();
          const isEditing =
            editingCell?.rowIndex === rowIndex &&
            editingCell?.colName === col.name;

          if (isEditing) {
            if (col.type === "int" || col.type === "float") {
              return (
                <div className="w-full" onClick={(e) => e.stopPropagation()}>
                  <NumberInput
                    isFloat={col.type === "float"}
                    step={col.type === "float" ? "any" : 1}
                    value={inlineValue}
                    autoFocus
                    onChange={(v) => setInlineValue(v)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveCellEdit(row, col.name);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        setEditingCell(null);
                      }
                    }}
                    onBlur={() => saveCellEdit(row, col.name)}
                    className="h-7 font-mono text-xs"
                  />
                </div>
              );
            }

            if (col.type === "bool") {
              return (
                <div className="w-full" onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={inlineValue === "" ? "null" : inlineValue}
                    onValueChange={(v) => {
                      const parsed = v === "null" ? null : v === "true";
                      setEditingCell(null);
                      if (onSaveCell && parsed !== row[col.name]) {
                        onSaveCell(row, col.name, parsed);
                      }
                    }}
                  >
                    <SelectTrigger className="h-7 w-full font-mono text-xs">
                      <SelectValue placeholder="(null)" />
                    </SelectTrigger>
                    <SelectContent side="bottom" align="start">
                      <SelectItem value="null">(null)</SelectItem>
                      <SelectItem value="true">true</SelectItem>
                      <SelectItem value="false">false</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            }

            return (
              <div className="w-full" onClick={(e) => e.stopPropagation()}>
                <Input
                  type="text"
                  value={inlineValue}
                  autoFocus
                  onChange={(e) => setInlineValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveCellEdit(row, col.name);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingCell(null);
                    }
                  }}
                  onBlur={() => saveCellEdit(row, col.name)}
                  className="h-7 font-mono text-xs"
                />
              </div>
            );
          }

          const renderContent = () => {
            if (val === undefined) {
              return (
                <span
                  className="font-mono text-[11px] text-zinc-600 italic select-none"
                  title={t("datagrid.fieldNotSet")}
                >
                  —
                </span>
              );
            }
            if (val === null) {
              return (
                <span className="font-mono text-[11px] text-zinc-500 italic">
                  NULL
                </span>
              );
            }

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
                    className="group/fk inline-flex cursor-pointer items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-left font-mono text-xs text-sky-600 transition-colors hover:bg-sky-100 hover:text-sky-700 hover:underline dark:border-sky-800/30 dark:bg-sky-950/20 dark:text-sky-400 dark:hover:bg-sky-950/50 dark:hover:text-sky-300"
                    title={t("datagrid.navigateToRelation", {
                      table: rel.to_table,
                      column: rel.to_column,
                      val,
                    })}
                  >
                    <span className="font-semibold">{String(val)}</span>
                    <ArrowUpRight className="h-3 w-3 shrink-0 opacity-70 transition-all group-hover/fk:translate-x-0.5 group-hover/fk:-translate-y-0.5 group-hover/fk:opacity-100" />
                  </button>
                );
              }
            }

            if (
              typeof val === "boolean" ||
              (col.type === "bool" &&
                (val === 1 ||
                  val === 0 ||
                  val === "1" ||
                  val === "0" ||
                  val === "true" ||
                  val === "false" ||
                  val === "\x01" ||
                  val === "\x00"))
            ) {
              const boolVal =
                typeof val === "boolean"
                  ? val
                  : val === 1 ||
                    val === "1" ||
                    val === "true" ||
                    val === "\x01";
              return (
                <Badge
                  variant={boolVal ? "default" : "secondary"}
                  className={`h-4 px-1.5 py-0 font-mono text-[10px] font-medium ${
                    boolVal
                      ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-400"
                      : "border border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-transparent dark:bg-zinc-800 dark:text-zinc-400"
                  }`}
                >
                  {String(boolVal)}
                </Badge>
              );
            }

            if (col.type === "binary") {
              return (
                <div className="flex items-center gap-1.5 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                  <span className="inline-flex shrink-0 items-center rounded border border-zinc-200 bg-zinc-100 px-1 py-0 font-mono text-[9px] font-semibold text-zinc-500 uppercase select-none dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
                    BIN
                  </span>
                  <span className="max-w-xs truncate">{String(val)}</span>
                </div>
              );
            }

            if (col.type === "uuid") {
              return (
                <span className="block truncate font-mono text-xs text-zinc-800 select-all dark:text-zinc-200">
                  {String(val)}
                </span>
              );
            }

            const chComplexKind = detectClickHouseComplexType(col.type, val);
            if (chComplexKind) {
              return (
                <ClickHouseComplexCell
                  kind={chComplexKind}
                  columnType={col.type}
                  value={val}
                  onOpenDetail={() => {
                    setCellDrawerState({
                      isOpen: true,
                      columnName: col.name,
                      columnType: col.type,
                      cellValue: val,
                      row,
                    });
                  }}
                />
              );
            }

            if (typeof val === "object") {
              return (
                <span
                  className="block max-w-xs cursor-help truncate font-mono text-xs text-amber-700 dark:text-amber-300/90"
                  title={JSON.stringify(val, null, 2)}
                >
                  {JSON.stringify(val)}
                </span>
              );
            }

            if (col.is_primary_key) {
              return (
                <div className="flex items-center gap-1.5">
                  <Key className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-400/80" />
                  <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {String(val)}
                  </span>
                </div>
              );
            }

            const strVal = String(val);
            const cleanStr = /[\x00-\x08\x0B-\x0C\x0E-\x1F]/.test(strVal)
              ? `0x${Array.from(strVal)
                  .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
                  .join("")}`
              : strVal;

            return (
              <span className="block truncate font-mono text-xs text-zinc-800 dark:text-zinc-300">
                {cleanStr}
              </span>
            );
          };

          const isCellEditable = !isReadOnly && !col.is_primary_key;

          if (!isCellEditable) {
            return renderContent();
          }

          return (
            <div
              onClick={(e) => {
                e.stopPropagation();
                startEditingCell(row, col.name, rowIndex);
              }}
              className="group/cell -mx-1.5 -my-1 flex h-full w-full cursor-pointer items-center justify-between rounded px-1.5 py-1 transition-colors hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50"
            >
              <div className="flex-1 truncate">{renderContent()}</div>
            </div>
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
          const isSearchOpen = Boolean(openSearchCols[extraColName]);
          const activeSearchVal = columnSearches[extraColName] ?? "";
          const hasActiveFilter = Boolean(activeSearchVal.trim());

          if (isSearchOpen) {
            return (
              <div
                data-column-search="true"
                className="flex w-full min-w-32.5 items-center gap-1 py-0.5"
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
              >
                <div className="relative flex flex-1 items-center">
                  <Search className="pointer-events-none absolute left-2 h-3 w-3 shrink-0 text-amber-400" />
                  <input
                    ref={(el) => {
                      searchInputRefs.current[extraColName] = el;
                    }}
                    type="text"
                    autoFocus
                    value={activeSearchVal}
                    onChange={(e) =>
                      handleColumnSearchChange(extraColName, e.target.value)
                    }
                    onKeyDown={(e) =>
                      handleColumnSearchKeyDown(extraColName, e)
                    }
                    onBlur={() => handleColumnSearchBlur(extraColName)}
                    placeholder={t("grid.column.search.placeholder", {
                      column: extraColName,
                    })}
                    className="h-6 w-full rounded border border-amber-500/80 bg-white py-0.5 pr-6 pl-7 font-mono text-xs text-zinc-900 shadow-sm placeholder:text-zinc-400 focus:ring-1 focus:ring-amber-500 focus:outline-none dark:border-amber-500/80 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                  />
                  <button
                    type="button"
                    title={t("grid.column.search.clear")}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearColumnSearch(extraColName);
                    }}
                    className="absolute right-1 cursor-pointer rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-rose-500 dark:hover:bg-zinc-800 dark:hover:text-rose-400"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          }

          return (
            <div
              className="group flex cursor-pointer items-center justify-between gap-1.5 py-1 select-none"
              onMouseEnter={() => setHoveredCol(extraColName)}
              onMouseLeave={() =>
                setHoveredCol((prev) => (prev === extraColName ? null : prev))
              }
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
                <span className="truncate font-mono text-xs font-semibold text-amber-200/90">
                  {extraColName}
                </span>
                <Badge
                  variant="outline"
                  className="h-4 border-amber-800/40 bg-amber-950/50 px-1 py-0 font-mono text-[9px] font-normal text-amber-400/90"
                >
                  {t("datagrid.dynamicBadge")}
                </Badge>
                {hasActiveFilter && (
                  <Badge
                    variant="outline"
                    className="h-3.5 border-amber-500/30 bg-amber-500/10 px-1 py-0 font-mono text-[9px] font-medium text-amber-400"
                    title={`contains: ${activeSearchVal}`}
                  >
                    🔍
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {/* Column Inline Search (🔍) */}
                <button
                  type="button"
                  title={`${t("grid.column.search.placeholder", { column: extraColName })} (Ctrl+F)`}
                  className={cn(
                    "cursor-pointer rounded p-1 transition-all focus:outline-none",
                    hasActiveFilter
                      ? "bg-amber-500/10 text-amber-400 opacity-100"
                      : "text-zinc-400 opacity-0 group-hover:opacity-100 hover:bg-zinc-200 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenColumnSearch(extraColName);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Search className="h-3 w-3" />
                </button>

                <div className="text-zinc-400 group-hover:text-zinc-200">
                  {isSorted ? (
                    sortDesc ? (
                      <ArrowDown className="h-3 w-3 text-emerald-400" />
                    ) : (
                      <ArrowUp className="h-3 w-3 text-emerald-400" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </div>
              </div>
            </div>
          );
        },
        cell: (info) => {
          const val = info.getValue();
          if (val === undefined) {
            return (
              <span
                className="font-mono text-[11px] text-zinc-600 italic select-none"
                title={t("datagrid.fieldNotSet")}
              >
                —
              </span>
            );
          }
          if (val === null) {
            return (
              <span className="font-mono text-[11px] text-zinc-500 italic">
                NULL
              </span>
            );
          }
          if (typeof val === "boolean") {
            return (
              <Badge
                variant={val ? "default" : "secondary"}
                className={`h-4 px-1.5 py-0 font-mono text-[10px] font-medium ${
                  val
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-400"
                    : "border border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-transparent dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {String(val)}
              </Badge>
            );
          }
          if (typeof val === "object") {
            return (
              <span
                className="block max-w-xs cursor-help truncate font-mono text-xs text-amber-700 dark:text-amber-300/90"
                title={JSON.stringify(val, null, 2)}
              >
                {JSON.stringify(val)}
              </span>
            );
          }
          return (
            <span className="block truncate font-mono text-xs text-zinc-800 dark:text-zinc-300">
              {String(val)}
            </span>
          );
        },
      });
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
    onNavigateRelation,
    isReadOnly,
    t,
    editingCell,
    inlineValue,
    openSearchCols,
    columnSearches,
    handleColumnSearchChange,
    handleColumnSearchKeyDown,
    handleColumnSearchBlur,
    handleClearColumnSearch,
    handleOpenColumnSearch,
  ]);

  // eslint-disable-next-line react-hooks/incompatible-library, react/incompatible-library
  const reactTable = useReactTable({
    data: displayedRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });

  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRows = reactTable.getRowModel().rows;
  // Virtualize rows for smooth 60fps scrolling & minimal DOM memory
  // eslint-disable-next-line react-hooks/incompatible-library, react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: tableRows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => VIRTUALIZER_ROW_HEIGHT,
    overscan: VIRTUALIZER_OVERSCAN,
    useFlushSync: false,
  });

  const saveCellEdit = useCallback(
    async (
      row: Record<string, any>,
      colName: string,
      moveFocusDown = false,
    ) => {
      if (!editingCell || !onSaveCell) {
        setEditingCell(null);
        if (moveFocusDown && focusedCell) {
          const nextRowIndex = Math.min(
            focusedCell.rowIndex + 1,
            displayedRows.length - 1,
          );
          setFocusedCell({ rowIndex: nextRowIndex, colName });
          rowVirtualizer.scrollToIndex(nextRowIndex, { align: "auto" });
        }
        return;
      }

      const colSchema = table.columns.find((c) => c.name === colName);
      let parsedVal: any = inlineValue;

      if (colSchema) {
        if (inlineValue === "" && colSchema.nullable) {
          parsedVal = null;
        } else if (colSchema.type === "int") {
          const p = parseInt(inlineValue, 10);
          parsedVal = isNaN(p) ? inlineValue : p;
        } else if (colSchema.type === "float") {
          const p = parseFloat(inlineValue);
          parsedVal = isNaN(p) ? inlineValue : p;
        } else if (colSchema.type === "bool") {
          parsedVal = inlineValue === "true";
        } else if (colSchema.type === "json") {
          try {
            parsedVal = JSON.parse(inlineValue);
          } catch {
            parsedVal = inlineValue;
          }
        }
      }

      if (parsedVal !== row[colName]) {
        try {
          await onSaveCell(row, colName, parsedVal);
        } catch (err) {
          console.error("Failed to save inline cell edit:", err);
        }
      }

      setEditingCell(null);
      if (moveFocusDown && focusedCell) {
        const nextRowIndex = Math.min(
          focusedCell.rowIndex + 1,
          displayedRows.length - 1,
        );
        setFocusedCell({ rowIndex: nextRowIndex, colName });
        rowVirtualizer.scrollToIndex(nextRowIndex, { align: "auto" });
      }
    },
    [
      editingCell,
      onSaveCell,
      focusedCell,
      displayedRows.length,
      rowVirtualizer,
      table.columns,
      inlineValue,
    ],
  );

  // Keyboard-First DataGrid Navigation Listener
  useEffect(() => {
    if (activeSubView !== "grid" || viewMode !== "table") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      // If user is focused inside search bar or outside inputs, ignore
      const isSearchInput = activeEl === quickSearchInputRef.current;
      const isModalOrOutside =
        activeEl &&
        (activeEl.tagName === "INPUT" ||
          activeEl.tagName === "TEXTAREA" ||
          activeEl.tagName === "SELECT") &&
        !activeEl.closest("[data-cell-editing='true']") &&
        !activeEl.closest("[data-column-search='true']");

      if (isSearchInput || isModalOrOutside) return;

      // Ctrl+F / Cmd+F: Column-Level Inline Search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        const targetCol =
          focusedCell?.colName && focusedCell.colName !== "_row_index"
            ? focusedCell.colName
            : hoveredCol || table.columns[0]?.name;
        if (targetCol) {
          handleOpenColumnSearch(targetCol);
        }
        return;
      }

      if (!focusedCell && displayedRows.length > 0) {
        if (
          e.key === "Tab" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowUp" ||
          e.key === "ArrowRight" ||
          e.key === "ArrowLeft" ||
          e.key === "Enter"
        ) {
          const firstDataCol =
            table.columns.find((c) => !c.is_primary_key)?.name ||
            table.columns[0]?.name ||
            "_row_index";
          setFocusedCell({ rowIndex: 0, colName: firstDataCol });
        }
        return;
      }

      if (!focusedCell || displayedRows.length === 0) return;

      const currentRowIndex = focusedCell.rowIndex;
      const currentRow = displayedRows[currentRowIndex];
      if (!currentRow) return;

      const leafCols = reactTable.getVisibleLeafColumns();
      const visibleColNames = leafCols.map((c) => c.id.replace("_extra_", ""));
      const currentColName = focusedCell.colName;
      let currentColIndex = visibleColNames.indexOf(currentColName);
      if (currentColIndex === -1) currentColIndex = 0;

      // 1. Ctrl+D / Cmd+D: Duplicate Row
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (!isReadOnly) {
          if (onDuplicateRow) {
            onDuplicateRow(currentRow);
          } else {
            onAddRow();
          }
        }
        return;
      }

      // 2. Delete / Backspace: Trigger Delete Confirmation (when not in edit mode)
      if (!editingCell && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        if (!isReadOnly) {
          onDeleteRow(currentRow);
        }
        return;
      }

      // 3. Escape: Cancel Edit Mode or Clear Column Filter on Focused Cell
      if (e.key === "Escape") {
        if (editingCell) {
          e.preventDefault();
          setEditingCell(null);
          return;
        }
        if (focusedCell?.colName && columnSearches[focusedCell.colName]) {
          e.preventDefault();
          handleClearColumnSearch(focusedCell.colName);
          return;
        }
        return;
      }

      // 4. Enter: Edit Mode Toggle & Commit-And-Down
      if (e.key === "Enter") {
        e.preventDefault();
        if (editingCell) {
          saveCellEdit(currentRow, editingCell.colName, true);
        } else {
          const colSchema = table.columns.find(
            (c) => c.name === currentColName,
          );
          if (
            !isReadOnly &&
            !colSchema?.is_primary_key &&
            currentColName !== "_row_index"
          ) {
            startEditingCell(currentRow, currentColName, currentRowIndex);
          }
        }
        return;
      }

      // Space: Open Cell Detail Inspector
      if (e.key === " " && !editingCell) {
        if (currentColName && currentColName !== "_row_index") {
          e.preventDefault();
          const colSchema = table.columns.find(
            (c) => c.name === currentColName,
          );
          setCellDrawerState({
            isOpen: true,
            columnName: currentColName,
            columnType: colSchema?.type,
            cellValue: currentRow[currentColName],
            row: currentRow,
          });
          return;
        }
      }

      // 5. ArrowUp / ArrowDown: Move up/down rows
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (editingCell) {
          saveCellEdit(currentRow, editingCell.colName);
        }
        const nextRowIndex = Math.max(0, currentRowIndex - 1);
        setFocusedCell({ rowIndex: nextRowIndex, colName: currentColName });
        rowVirtualizer.scrollToIndex(nextRowIndex, { align: "auto" });
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (editingCell) {
          saveCellEdit(currentRow, editingCell.colName);
        }
        const nextRowIndex = Math.min(
          displayedRows.length - 1,
          currentRowIndex + 1,
        );
        setFocusedCell({ rowIndex: nextRowIndex, colName: currentColName });
        rowVirtualizer.scrollToIndex(nextRowIndex, { align: "auto" });
        return;
      }

      // 6. Tab / Shift+Tab: Move left/right cells
      if (e.key === "Tab") {
        e.preventDefault();
        if (editingCell) {
          saveCellEdit(currentRow, editingCell.colName);
        }
        if (e.shiftKey) {
          // Shift+Tab: Move left
          if (currentColIndex > 0) {
            setFocusedCell({
              rowIndex: currentRowIndex,
              colName: visibleColNames[currentColIndex - 1],
            });
          } else if (currentRowIndex > 0) {
            const prevRowIndex = currentRowIndex - 1;
            const lastColName = visibleColNames[visibleColNames.length - 1];
            setFocusedCell({ rowIndex: prevRowIndex, colName: lastColName });
            rowVirtualizer.scrollToIndex(prevRowIndex, { align: "auto" });
          }
        } else {
          // Tab: Move right
          if (currentColIndex < visibleColNames.length - 1) {
            setFocusedCell({
              rowIndex: currentRowIndex,
              colName: visibleColNames[currentColIndex + 1],
            });
          } else if (currentRowIndex < displayedRows.length - 1) {
            const nextRowIndex = currentRowIndex + 1;
            const firstColName = visibleColNames[0];
            setFocusedCell({ rowIndex: nextRowIndex, colName: firstColName });
            rowVirtualizer.scrollToIndex(nextRowIndex, { align: "auto" });
          }
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeSubView,
    viewMode,
    focusedCell,
    editingCell,
    displayedRows,
    reactTable,
    table,
    isReadOnly,
    onDuplicateRow,
    onAddRow,
    onDeleteRow,
    saveCellEdit,
    startEditingCell,
    rowVirtualizer,
    hoveredCol,
    handleOpenColumnSearch,
    handleClearColumnSearch,
    columnSearches,
  ]);

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
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-white transition-colors dark:bg-zinc-950">
      <GridHeaderToolbar
        table={table}
        totalCount={totalCount}
        displayedRowsCount={displayedRows.length}
        rawRowsCount={rows.length}
        activeSubView={activeSubView}
        onSubViewChange={setActiveSubView}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        dbType={dbType}
        isReadOnly={isReadOnly}
        quickSearch={quickSearch}
        onQuickSearchChange={setQuickSearch}
        quickSearchInputRef={quickSearchInputRef}
        filters={filters}
        onFiltersChange={onFiltersChange}
        showFilterBuilder={showFilterBuilder}
        onToggleFilterBuilder={() => setShowFilterBuilder((prev) => !prev)}
        filterCol={filterCol}
        onFilterColChange={setFilterCol}
        filterOp={filterOp}
        onFilterOpChange={setFilterOp}
        filterVal={filterVal}
        onFilterValChange={setFilterVal}
        onAddFilter={handleAddFilter}
        onRemoveFilter={handleRemoveFilter}
        extraColumns={extraColumns}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onOpenQueryConsole={onOpenQueryConsole}
        connId={connId}
        onExport={handleExport}
        onOpenImportModal={(mode) => {
          setImportModalMode(mode);
          setIsImportModalOpen(true);
        }}
        onAddRow={onAddRow}
        t={t}
      >
        {/* Quick Stats Bar */}
        <QuickStatsBar
          table={table}
          stats={tableStats}
          totalFilteredRows={totalCount}
          isFiltered={filters.length > 0}
          onOpenAnalytics={(col) =>
            setAnalyticsColumn(col || table.columns[0] || null)
          }
        />

        {/* Read-Only Safety Banner */}
        {isReadOnly && (
          <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 font-mono text-xs text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span className="font-medium">
                {t("datagrid.readOnlyBanner")}
              </span>
            </div>
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/20 text-[10px] font-bold text-amber-700 uppercase dark:text-amber-400"
            >
              {t("connection.readOnlyBadge")}
            </Badge>
          </div>
        )}
      </GridHeaderToolbar>

      {activeSubView === "schema" ? (
        <Suspense
          fallback={
            <div className="p-8 text-center font-mono text-xs text-zinc-500">
              Loading Schema...
            </div>
          }
        >
          <SchemaInspector
            connId={connId}
            table={table}
            isReadOnly={isReadOnly}
            onNavigateRelation={onNavigateRelation}
            onOpenQueryConsole={onOpenQueryConsole}
          />
        </Suspense>
      ) : (
        <>
          {/* Grid Container */}
          <div
            ref={tableContainerRef}
            data-tour="datagrid-view"
            className="relative flex flex-1 flex-col overflow-auto"
          >
            {isLoading || isRefreshing ? (
              /* High-fidelity shadcn UI Table Skeleton */
              <table className="animate-in fade-in w-full caption-bottom border-collapse border-b border-zinc-200 text-left text-sm duration-150 dark:border-zinc-800">
                <TableHeader className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  <TableRow>
                    <TableHead className="w-12 border-zinc-200 px-3 py-2 font-mono text-xs font-medium text-zinc-400 not-last:border-r dark:border-zinc-800/80">
                      #
                    </TableHead>
                    {table?.columns?.map((c) => (
                      <TableHead
                        key={c.name}
                        className="h-auto border-zinc-200 px-3 py-2 text-xs font-medium whitespace-nowrap text-zinc-600 not-last:border-r dark:border-zinc-800/80 dark:text-zinc-400"
                      >
                        <div className="flex items-center gap-1.5 py-1">
                          <Skeleton className="size-3.5 shrink-0 rounded bg-zinc-300/80 dark:bg-zinc-700/80" />
                          <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {c.name}
                          </span>
                          <span className="font-mono text-[10px] font-normal text-zinc-400 dark:text-zinc-500">
                            {c.type}
                          </span>
                        </div>
                      </TableHead>
                    )) ??
                      [1, 2, 3, 4, 5, 6].map((idx) => (
                        <TableHead
                          key={idx}
                          className="border-zinc-200 px-3 py-2 not-last:border-r dark:border-zinc-800/80"
                        >
                          <Skeleton className="h-4 w-24 rounded" />
                        </TableHead>
                      ))}
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-zinc-200 dark:divide-zinc-800/50">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((rowIdx) => (
                    <TableRow
                      key={rowIdx}
                      className="h-9.25 hover:bg-transparent"
                    >
                      <TableCell className="w-12 border-zinc-200/80 px-3 py-2 font-mono text-xs text-zinc-400 not-last:border-r dark:border-zinc-800/40">
                        <Skeleton className="h-3 w-4 rounded bg-zinc-200/70 dark:bg-zinc-800/70" />
                      </TableCell>
                      {table?.columns?.map((c, cIdx) => {
                        const isNumeric =
                          /int|float|num|dec|serial|money/i.test(c.type);
                        const isBool = /bool/i.test(c.type);
                        const isDate = /date|time/i.test(c.type);
                        const isPk = c.is_primary_key;

                        return (
                          <TableCell
                            key={c.name}
                            className="border-zinc-200/80 px-3 py-2 whitespace-nowrap not-last:border-r dark:border-zinc-800/40"
                          >
                            {isPk ? (
                              <div className="flex items-center gap-1.5">
                                <Skeleton className="size-3 shrink-0 rounded-full bg-amber-400/40 dark:bg-amber-400/30" />
                                <Skeleton className="h-3 w-8 rounded bg-zinc-200 dark:bg-zinc-800" />
                              </div>
                            ) : isBool ? (
                              <Skeleton className="h-4 w-12 rounded-full bg-emerald-500/20 dark:bg-emerald-500/15" />
                            ) : isDate ? (
                              <Skeleton className="h-3 w-28 rounded bg-zinc-200/80 dark:bg-zinc-800/80" />
                            ) : isNumeric ? (
                              <Skeleton
                                className="h-3 rounded bg-zinc-200/80 dark:bg-zinc-800/80"
                                style={{
                                  width: `${32 + ((rowIdx * 17 + cIdx * 13) % 40)}px`,
                                }}
                              />
                            ) : (
                              <Skeleton
                                className="h-3 rounded bg-zinc-200/90 dark:bg-zinc-800/90"
                                style={{
                                  width: `${55 + ((rowIdx * 23 + cIdx * 31) % 110)}px`,
                                  maxWidth: "85%",
                                }}
                              />
                            )}
                          </TableCell>
                        );
                      }) ??
                        [1, 2, 3, 4, 5, 6].map((cIdx) => (
                          <TableCell
                            key={cIdx}
                            className="border-zinc-200/80 px-3 py-2 not-last:border-r dark:border-zinc-800/40"
                          >
                            <Skeleton className="h-3.5 w-24 rounded" />
                          </TableCell>
                        ))}
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            ) : displayedRows.length === 0 ? (
              /* Empty States */
              <div className="flex flex-1 items-center justify-center p-8">
                {quickSearch ? (
                  <EmptyState
                    icon={Search}
                    title={t("datagrid.noSearchResultsTitle")}
                    description={t("datagrid.noSearchResultsDesc", {
                      term: quickSearch,
                    })}
                    action={{
                      label: t("datagrid.clearSearch"),
                      onClick: () => setQuickSearch(""),
                    }}
                  />
                ) : filters.length > 0 ? (
                  <EmptyState
                    icon={FilterIcon}
                    title={t("datagrid.noMatchingFiltersTitle")}
                    description={t("datagrid.noMatchingFiltersDesc")}
                    action={{
                      label: t("datagrid.clearAllFilters"),
                      onClick: () => onFiltersChange([]),
                    }}
                  />
                ) : (
                  <EmptyState
                    icon={Inbox}
                    title={t("datagrid.tableIsEmptyTitle")}
                    description={t("datagrid.tableIsEmptyDesc", {
                      table: table.name,
                    })}
                    action={
                      isReadOnly
                        ? undefined
                        : {
                            label: t("datagrid.insertFirstRecord"),
                            onClick: onAddRow,
                            icon: Plus,
                          }
                    }
                  />
                )}
              </div>
            ) : viewMode === "document" ? (
              /* Document View - Compass-style expanded document cards */
              <DocumentView
                rows={displayedRows}
                table={table}
                extraColumns={extraColumns}
                page={page}
                pageSize={pageSize}
                isReadOnly={isReadOnly}
                onEditRow={onEditRow}
                onDeleteRow={onDeleteRow}
                onSaveCell={onSaveCell}
                onNavigateRelation={onNavigateRelation}
                t={t}
              />
            ) : (
              /* Data Table */
              <table className="w-full caption-bottom border-collapse border-b border-zinc-200 text-left text-sm dark:border-zinc-800">
                <TableHeader className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
                  {reactTable.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          style={{ width: header.getSize() }}
                          className="h-auto border-zinc-200 px-3 py-2 text-xs font-medium whitespace-nowrap text-zinc-600 not-last:border-r dark:border-zinc-800/80 dark:text-zinc-400"
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
                  {rowVirtualizer.getVirtualItems().length > 0 && (
                    <>
                      {rowVirtualizer.getVirtualItems()[0].start > 0 && (
                        <tr>
                          <td
                            colSpan={reactTable.getVisibleLeafColumns().length}
                            style={{
                              height: `${rowVirtualizer.getVirtualItems()[0].start}px`,
                              padding: 0,
                              border: 0,
                            }}
                          />
                        </tr>
                      )}
                      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const row = tableRows[virtualRow.index];
                        if (!row) return null;
                        return (
                          <GridRowItem
                            key={row.id}
                            row={row}
                            virtualIndex={virtualRow.index}
                            measureElement={rowVirtualizer.measureElement}
                            focusedCell={focusedCell}
                            editingCell={editingCell}
                            onRowContextMenu={handleRowContextMenu}
                            onCellClick={handleCellClick}
                            onCellContextMenu={handleCellContextMenu}
                          />
                        );
                      })}
                      {rowVirtualizer.getTotalSize() -
                        (rowVirtualizer.getVirtualItems()[
                          rowVirtualizer.getVirtualItems().length - 1
                        ]?.end ?? 0) >
                        0 && (
                        <tr>
                          <td
                            colSpan={reactTable.getVisibleLeafColumns().length}
                            style={{
                              height: `${
                                rowVirtualizer.getTotalSize() -
                                (rowVirtualizer.getVirtualItems()[
                                  rowVirtualizer.getVirtualItems().length - 1
                                ]?.end ?? 0)
                              }px`,
                              padding: 0,
                              border: 0,
                            }}
                          />
                        </tr>
                      )}
                    </>
                  )}
                </TableBody>
              </table>
            )}
          </div>

          {/* Pagination Footer */}
          <GridPaginationFooter
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            totalPages={totalPages}
            onPageChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            t={t}
          />
        </>
      )}

      {connId && isImportModalOpen && (
        <Suspense fallback={null}>
          <ImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            connId={connId}
            table={table}
            initialMode={importModalMode}
            tableStats={tableStats}
            filters={filters}
            sortBy={sortBy}
            sortDesc={sortDesc}
            onSuccess={() => {
              onRefresh();
            }}
          />
        </Suspense>
      )}

      {connId && analyticsColumn !== null && (
        <Suspense fallback={null}>
          <ColumnAnalyticsDrawer
            isOpen={analyticsColumn !== null}
            onClose={() => setAnalyticsColumn(null)}
            connectionId={connId}
            tableName={table.name}
            column={analyticsColumn}
            columns={table.columns}
            onSelectColumn={(col) => setAnalyticsColumn(col)}
            activeFilters={filters}
          />
        </Suspense>
      )}

      {cellDrawerState.isOpen && (
        <Suspense fallback={null}>
          <CellDetailDrawer
            isOpen={cellDrawerState.isOpen}
            onClose={() =>
              setCellDrawerState((prev) => ({ ...prev, isOpen: false }))
            }
            tableName={table.name}
            columnName={cellDrawerState.columnName}
            columnType={cellDrawerState.columnType}
            cellValue={cellDrawerState.cellValue}
            row={cellDrawerState.row}
            isReadOnly={isReadOnly}
            onSaveCell={onSaveCell}
          />
        </Suspense>
      )}

      {/* Custom Right-Click Context Menu */}
      <GridContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        table={table}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onEditRow={onEditRow}
        onDeleteRow={onDeleteRow}
        onNavigateRelation={onNavigateRelation}
        onInspectCell={(colName, cellValue, row, colType) => {
          setCellDrawerState({
            isOpen: true,
            columnName: colName,
            columnType: colType,
            cellValue,
            row,
          });
        }}
        onCopyNotify={(msg) => {
          setCopiedNotification(msg);
          setTimeout(() => setCopiedNotification(null), 2000);
        }}
        isReadOnly={isReadOnly}
        t={t}
      />

      {/* Copied Toast Notification */}
      {copiedNotification && (
        <div className="animate-in fade-in slide-in-from-bottom-2 fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-md bg-emerald-600 px-3.5 py-2 font-mono text-xs text-white shadow-lg duration-150">
          <Check className="h-4 w-4 shrink-0" />
          <span>{copiedNotification}</span>
        </div>
      )}
    </div>
  );
};
