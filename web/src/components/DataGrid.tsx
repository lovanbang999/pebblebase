import {
  useMemo,
  useState,
  useEffect,
  useRef,
  lazy,
  Suspense,
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
  RefreshCw,
  Filter as FilterIcon,
  X,
  Key,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Edit2,
  Trash2,
  Table as TableIcon,
  LayoutList,
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
} from "../lib/types";
import { exportTableData, fetchTableStats } from "../lib/api";
import { useTranslation } from "react-i18next";
import { EmptyState } from "./EmptyState";
import { QuickStatsBar } from "./QuickStatsBar";

const ImportModal = lazy(() =>
  import("./ImportModal").then((m) => ({ default: m.ImportModal })),
);
const SchemaInspector = lazy(() =>
  import("./SchemaInspector").then((m) => ({ default: m.SchemaInspector })),
);
const ColumnAnalyticsDrawer = lazy(() =>
  import("./ColumnAnalyticsDrawer").then((m) => ({
    default: m.ColumnAnalyticsDrawer,
  })),
);
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
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
  onOpenQueryConsole?: () => void;
  connId?: string;
  dbType?: "postgres" | "mysql" | "mongodb" | "sqlite";
}

// ─────────────────────────────────────────────────────────
// DocumentView — Compass-style expanded document card list
// ─────────────────────────────────────────────────────────
interface DocumentViewProps {
  rows: Record<string, any>[];
  table: TableSchema;
  extraColumns: string[];
  page: number;
  pageSize: number;
  isReadOnly: boolean;
  onEditRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
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
  t: (key: string, opts?: any) => string;
}

const DocumentView: FC<DocumentViewProps> = ({
  rows,
  table,
  extraColumns,
  page,
  pageSize,
  isReadOnly,
  onEditRow,
  onDeleteRow,
  onSaveCell,
  onNavigateRelation,
  t,
}) => {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [copiedRow, setCopiedRow] = useState<number | null>(null);
  const [editingDocIdx, setEditingDocIdx] = useState<number | null>(null);
  const [editingValues, setEditingValues] = useState<Record<string, string>>(
    {},
  );
  const [isSaving, setIsSaving] = useState(false);

  // Helper: get field display type label
  const getTypeLabel = (key: string, val: any): string => {
    const col = table.columns.find((c) => c.name === key);
    if (col) {
      if (col.type === "int") return "Int32";
      if (col.type === "float") return "Double";
      if (col.type === "bool") return "Boolean";
      if (col.type === "datetime") return "Date";
      if (col.type === "json") return "Object";
      if (col.type === "uuid") return "UUID";
      return "String";
    }
    if (val === null || val === undefined) return "Null";
    if (typeof val === "number")
      return Number.isInteger(val) ? "Int32" : "Double";
    if (typeof val === "boolean") return "Boolean";
    if (typeof val === "object") return "Object";
    return "String";
  };

  const enterEditMode = (idx: number, row: Record<string, any>) => {
    if (isReadOnly) return;
    const draft: Record<string, string> = {};
    Object.entries(row).forEach(([k, v]) => {
      if (!k.startsWith("_pb_")) {
        draft[k] =
          v === null || v === undefined
            ? ""
            : typeof v === "object"
              ? JSON.stringify(v)
              : String(v);
      }
    });
    setEditingDocIdx(idx);
    setEditingValues(draft);
    // Expand the card so all fields are visible in edit mode
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  };

  const cancelEdit = () => {
    setEditingDocIdx(null);
    setEditingValues({});
    setIsSaving(false);
  };

  const isDocModified = (row: Record<string, any>): boolean => {
    if (editingDocIdx === null) return false;
    return Object.entries(editingValues).some(([k, v]) => {
      const orig = row[k];
      const origStr =
        orig === null || orig === undefined
          ? ""
          : typeof orig === "object"
            ? JSON.stringify(orig)
            : String(orig);
      return v !== origStr;
    });
  };

  const handleUpdate = async (row: Record<string, any>) => {
    if (!onSaveCell || isSaving) return;
    setIsSaving(true);
    try {
      const changedEntries = Object.entries(editingValues).filter(([k, v]) => {
        const orig = row[k];
        const origStr =
          orig === null || orig === undefined
            ? ""
            : typeof orig === "object"
              ? JSON.stringify(orig)
              : String(orig);
        return v !== origStr;
      });
      for (const [key, rawVal] of changedEntries) {
        const colSchema = table.columns.find((c) => c.name === key);
        let parsed: any = rawVal;
        if (colSchema) {
          if (rawVal === "" && colSchema.nullable) parsed = null;
          else if (colSchema.type === "int") {
            const p = parseInt(rawVal, 10);
            parsed = isNaN(p) ? rawVal : p;
          } else if (colSchema.type === "float") {
            const p = parseFloat(rawVal);
            parsed = isNaN(p) ? rawVal : p;
          } else if (colSchema.type === "bool") parsed = rawVal === "true";
          else if (colSchema.type === "json") {
            try {
              parsed = JSON.parse(rawVal);
            } catch {
              parsed = rawVal;
            }
          }
        }
        await onSaveCell(row, key, parsed);
      }
      cancelEdit();
    } catch (err) {
      console.error("Document inline update failed:", err);
    } finally {
      setIsSaving(false);
    }
  };

  // Escape key to cancel editing
  useEffect(() => {
    if (editingDocIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelEdit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editingDocIdx]);

  const toggleExpand = (idx: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleCopyJson = (row: Record<string, any>, idx: number) => {
    navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    setCopiedRow(idx);
    setTimeout(() => setCopiedRow(null), 1500);
  };

  // All field keys for a given row (schema + dynamic)
  const allFieldKeys = (row: Record<string, any>) => {
    const schemaKeys = table.columns.map((c) => c.name);
    const rowKeys = Object.keys(row).filter((k) => !k.startsWith("_pb_"));
    return Array.from(
      new Set([...schemaKeys, ...extraColumns, ...rowKeys]),
    ).filter((k) => k in row);
  };

  const renderValue = (key: string, val: any, _row: Record<string, any>) => {
    if (val === undefined) {
      return (
        <span className="text-zinc-500 italic text-[11px] select-none">—</span>
      );
    }
    if (val === null) {
      return (
        <span className="text-zinc-500 italic text-[11px] font-mono">null</span>
      );
    }

    const colSchema = table.columns.find((c) => c.name === key);

    // Foreign key navigation
    if (colSchema?.is_foreign_key && onNavigateRelation) {
      const rel = table.relations?.find((r) => r.from_column === key);
      if (rel) {
        return (
          <button
            type="button"
            onClick={() => onNavigateRelation(rel.to_table, rel.to_column, val)}
            className="inline-flex items-center gap-1 font-mono text-[11px] text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
          >
            {String(val)}
            <ArrowUpRight className="w-3 h-3 shrink-0" />
          </button>
        );
      }
    }

    if (typeof val === "boolean") {
      return (
        <span
          className={cn(
            "font-mono text-[11px] font-semibold px-1.5 py-px rounded border",
            val
              ? "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50"
              : "text-zinc-600 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-transparent",
          )}
        >
          {String(val)}
        </span>
      );
    }

    if (typeof val === "object") {
      const json = JSON.stringify(val);
      const isLong = json.length > 80;
      return (
        <span
          className="font-mono text-[11px] text-amber-700 dark:text-amber-300/90 break-all cursor-help"
          title={JSON.stringify(val, null, 2)}
        >
          {isLong ? json.slice(0, 80) + "…" : json}
        </span>
      );
    }

    if (colSchema?.is_primary_key) {
      return (
        <span className="font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400">
          {String(val)}
        </span>
      );
    }

    if (typeof val === "number") {
      return (
        <span className="font-mono text-[11px] text-blue-700 dark:text-blue-300">
          {String(val)}
        </span>
      );
    }

    // String
    const str = String(val);
    const isDate =
      colSchema?.type === "datetime" || /^\d{4}-\d{2}-\d{2}T/.test(str);
    if (isDate) {
      return (
        <span className="font-mono text-[11px] text-violet-700 dark:text-violet-300">
          &quot;{str}&quot;
        </span>
      );
    }
    return (
      <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
        &quot;{str}&quot;
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-3 space-y-2 bg-white dark:bg-zinc-950">
      {rows.map((row, globalIdx) => {
        const rowNumber = page * pageSize + globalIdx + 1;
        const keys = allFieldKeys(row);
        const isExpanded = expandedRows.has(globalIdx);
        // Show first 8 fields collapsed, all when expanded
        const visibleKeys = isExpanded ? keys : keys.slice(0, 15);
        const hasMore = keys.length > 15;

        // Primary key field shown prominently at top
        const pkCol = table.columns.find((c) => c.is_primary_key);
        const pkKey = pkCol?.name ?? "_id";
        const pkVal = row[pkKey];

        return (
          <div
            key={globalIdx}
            className={cn(
              "group border rounded-lg bg-white dark:bg-zinc-900 overflow-hidden transition-colors",
              editingDocIdx === globalIdx
                ? "border-emerald-500/60 dark:border-emerald-500/40 ring-1 ring-emerald-500/20"
                : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700",
            )}
            onDoubleClick={() => {
              if (!isReadOnly && editingDocIdx !== globalIdx)
                enterEditMode(globalIdx, row);
            }}
          >
            {/* Card Header: row# + primary key + actions */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/70">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-600 shrink-0 select-none w-6 text-right">
                  {rowNumber}
                </span>
                <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-500 shrink-0">
                  {pkKey}:
                </span>
                <span className="font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400 truncate">
                  {pkVal !== undefined && pkVal !== null ? (
                    String(pkVal)
                  ) : (
                    <span className="text-zinc-400 italic">null</span>
                  )}
                </span>
                {editingDocIdx === globalIdx && (
                  <span className="ml-1 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 px-1.5 py-px rounded select-none">
                    editing
                  </span>
                )}
              </div>

              {/* Per-card actions — hidden when editing */}
              {editingDocIdx !== globalIdx && (
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!isReadOnly && (
                    <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 mr-1 select-none hidden group-hover:inline">
                      double-click to edit
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyJson(row, globalIdx)}
                    title={t("datagrid.documentView.copyJson")}
                    className="p-1 rounded text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    {copiedRow === globalIdx ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditRow(row)}
                    disabled={isReadOnly}
                    title={t("datagrid.editRecordTooltip")}
                    className={cn(
                      "p-1 rounded text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer",
                      isReadOnly &&
                        "opacity-40 cursor-not-allowed pointer-events-none",
                    )}
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRow(row)}
                    disabled={isReadOnly}
                    title={t("datagrid.deleteRecordTooltip")}
                    className={cn(
                      "p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer",
                      isReadOnly &&
                        "opacity-40 cursor-not-allowed pointer-events-none",
                    )}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>

            {/* Field list — Compass-style, one per line with line numbers */}
            <div className="py-1">
              {visibleKeys
                .filter((k) => k !== pkKey)
                .map((key, fieldIdx) => {
                  const isPk = table.columns.find(
                    (c) => c.name === key,
                  )?.is_primary_key;
                  const isEditing = editingDocIdx === globalIdx;
                  const typeLabel = getTypeLabel(key, row[key]);
                  const fieldLineNum = fieldIdx + 2; // starts at 2 (1 = _id)
                  const currentVal = editingValues[key] ?? "";
                  const origStr = (() => {
                    const orig = row[key];
                    return orig === null || orig === undefined
                      ? ""
                      : typeof orig === "object"
                        ? JSON.stringify(orig)
                        : String(orig);
                  })();
                  const isDirty = isEditing && currentVal !== origStr;

                  return (
                    <div
                      key={key}
                      className={cn(
                        "flex items-center gap-0 min-w-0 border-l-2 transition-colors",
                        isEditing && isDirty
                          ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10"
                          : "border-l-transparent",
                      )}
                    >
                      {/* Line number */}
                      {isEditing && (
                        <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0 w-8 text-right pr-2 select-none self-start pt-0.75">
                          {fieldLineNum}
                        </span>
                      )}

                      {/* Field name */}
                      <span
                        className={cn(
                          "font-mono text-[11px] text-zinc-500 dark:text-zinc-400 shrink-0 truncate self-start",
                          isEditing
                            ? "min-w-35 pt-0.75 px-2"
                            : "min-w-30 px-3 py-px",
                        )}
                      >
                        {key}
                      </span>
                      <span className="font-mono text-[11px] text-zinc-400 dark:text-zinc-600 shrink-0 self-start pt-0.75">
                        :
                      </span>

                      {/* Value — textarea in edit mode, styled display otherwise */}
                      {isEditing && !isPk ? (
                        <textarea
                          rows={1}
                          value={currentVal}
                          onChange={(e) => {
                            const el = e.target;
                            el.style.height = "auto";
                            el.style.height = `${el.scrollHeight}px`;
                            setEditingValues((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && e.ctrlKey) {
                              // Ctrl+Enter = insert newline
                              e.preventDefault();
                              const el = e.currentTarget;
                              const start =
                                el.selectionStart ?? currentVal.length;
                              const end = el.selectionEnd ?? currentVal.length;
                              const newVal =
                                currentVal.slice(0, start) +
                                "\n" +
                                currentVal.slice(end);
                              setEditingValues((prev) => ({
                                ...prev,
                                [key]: newVal,
                              }));
                              setTimeout(() => {
                                el.selectionStart = el.selectionEnd = start + 1;
                                el.style.height = "auto";
                                el.style.height = `${el.scrollHeight}px`;
                              }, 0);
                            }
                          }}
                          onClick={(e) => e.stopPropagation()}
                          ref={(el) => {
                            if (el) {
                              el.style.height = "auto";
                              el.style.height = `${el.scrollHeight}px`;
                            }
                          }}
                          className={cn(
                            "flex-1 min-w-0 font-mono text-[11px] bg-transparent border-0 border-b px-2 py-px resize-none overflow-hidden text-zinc-900 dark:text-zinc-100 focus:outline-none transition-colors leading-5",
                            isDirty
                              ? "border-b-emerald-500 dark:border-b-emerald-400"
                              : "border-b-zinc-200 dark:border-b-zinc-700 focus:border-b-zinc-400 dark:focus:border-b-zinc-500",
                          )}
                          autoFocus={
                            key === visibleKeys.filter((k) => k !== pkKey)[0]
                          }
                        />
                      ) : (
                        <span
                          className={cn(
                            "min-w-0 font-mono text-[11px] wrap-break-word flex-1",
                            isEditing
                              ? "px-2 py-px text-zinc-500 dark:text-zinc-500"
                              : "px-2 py-px",
                          )}
                        >
                          {isEditing ? (
                            // PK field shown as plain text in edit mode
                            <span className="text-amber-700 dark:text-amber-400">
                              {String(row[key] ?? "")}
                            </span>
                          ) : (
                            renderValue(key, row[key], row)
                          )}
                        </span>
                      )}

                      {/* Type label (Compass-style, right side) */}
                      <span
                        className={cn(
                          "font-mono text-[10px] shrink-0 pl-2 self-start pt-0.75",
                          isEditing
                            ? "text-zinc-400 dark:text-zinc-500 pr-3 min-w-14 text-right"
                            : "text-zinc-300 dark:text-zinc-700 pr-3 min-w-14 text-right",
                        )}
                      >
                        {typeLabel}
                      </span>
                    </div>
                  );
                })}

              {/* Expand / collapse — not shown in edit mode */}
              {hasMore && editingDocIdx !== globalIdx && (
                <button
                  type="button"
                  onClick={() => toggleExpand(globalIdx)}
                  className="mt-1.5 ml-3 flex items-center gap-1 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors cursor-pointer select-none"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUpIcon className="w-3.5 h-3.5" />
                      {t("datagrid.documentView.collapse")}
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon className="w-3.5 h-3.5" />
                      {t("datagrid.documentView.expand")} (+{keys.length - 15}{" "}
                      fields)
                    </>
                  )}
                </button>
              )}
            </div>

            {/* "Document modified." amber banner — only when editing AND changes exist */}
            {editingDocIdx === globalIdx && (
              <div
                className={cn(
                  "flex items-center justify-between px-3 py-2 border-t transition-colors",
                  isDocModified(row)
                    ? "border-amber-200 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30"
                    : "border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-mono transition-opacity",
                    isDocModified(row)
                      ? "text-amber-700 dark:text-amber-400 opacity-100"
                      : "opacity-0 select-none",
                  )}
                >
                  Document modified.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-3 py-1.5 text-[11px] font-mono font-medium rounded border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer uppercase tracking-wide"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || !onSaveCell || !isDocModified(row)}
                    onClick={() => handleUpdate(row)}
                    className={cn(
                      "px-3 py-1.5 text-[11px] font-mono font-semibold rounded border transition-colors uppercase tracking-wide",
                      isSaving || !onSaveCell || !isDocModified(row)
                        ? "border-zinc-200 dark:border-zinc-700 text-zinc-400 bg-zinc-100 dark:bg-zinc-800 cursor-not-allowed"
                        : "border-emerald-500 text-white bg-emerald-600 hover:bg-emerald-500 cursor-pointer",
                    )}
                  >
                    {isSaving ? "Saving..." : "Update"}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

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
  const [analyticsColumn, setAnalyticsColumn] = useState<ColumnSchema | null>(
    null,
  );
  const [tableStats, setTableStats] = useState<TableStats | null>(null);
  const [copiedCol, setCopiedCol] = useState<string | null>(null);

  // Right-click Context Menu State
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    row: Record<string, any>;
    colName: string;
    cellValue: any;
  } | null>(null);
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

  // Inline Cell Editing State
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    colName: string;
  } | null>(null);
  const [inlineValue, setInlineValue] = useState<string>("");

  const startEditingCell = (
    row: Record<string, any>,
    colName: string,
    rowIndex: number,
  ) => {
    if (isReadOnly) return;
    const colSchema = table.columns.find((c) => c.name === colName);
    if (colSchema?.is_primary_key) return;

    setEditingCell({ rowIndex, colName });
    const currentVal = row[colName];
    setInlineValue(
      currentVal === null || currentVal === undefined ? "" : String(currentVal),
    );
  };

  const saveCellEdit = async (row: Record<string, any>, colName: string) => {
    if (!editingCell || !onSaveCell) {
      setEditingCell(null);
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
  };

  useEffect(() => {
    if (!connId || !table.name) return;
    fetchTableStats(connId, table.name)
      .then((stats) => setTableStats(stats))
      .catch(() => setTableStats({ total_rows: totalCount, size_bytes: 0 }));
  }, [connId, table.name, totalCount]);

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: "csv" | "json") => {
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
      a.download = `${table.name}.${format}`;
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
                  <span title={t("datagrid.primaryKey")}>
                    <Key className="w-3 h-3 text-amber-400 shrink-0" />
                  </span>
                )}
                {col.is_foreign_key && (
                  <span title={t("datagrid.foreignKey")}>
                    <Layers className="w-3 h-3 text-sky-400 shrink-0" />
                  </span>
                )}
                <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-200 truncate">
                  {col.name}
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 font-normal px-1 py-0 h-4 bg-zinc-200/60 dark:bg-zinc-800/80 border-zinc-300/60 dark:border-transparent"
                >
                  {col.type}
                </Badge>
              </div>

              <div className="flex items-center gap-0.5">
                {/* Sort indicator */}
                <div className="text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200">
                  {isSorted ? (
                    sortDesc ? (
                      <ArrowDown className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                    ) : (
                      <ArrowUp className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                    )
                  ) : (
                    <ArrowUpDown className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>

                {/* Column Action Menu (⋮) */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        title={t("analytics.columnMenu")}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100 data-popup-open:opacity-100 transition-opacity cursor-pointer focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="w-48 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-200 shadow-xl p-1 z-50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/15 cursor-pointer rounded"
                      onClick={() => setAnalyticsColumn(col)}
                    >
                      <BarChart3 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                      <span>{t("analytics.openAnalytics")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="bg-zinc-200 dark:bg-zinc-800 my-1" />

                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer rounded"
                      onClick={() => onSortChange(col.name, false)}
                    >
                      <ArrowUp className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{t("analytics.sortAsc")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer rounded"
                      onClick={() => onSortChange(col.name, true)}
                    >
                      <ArrowDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{t("analytics.sortDesc")}</span>
                    </DropdownMenuItem>

                    {isSorted && (
                      <DropdownMenuItem
                        className="flex items-center gap-2 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400/90 hover:text-amber-900 dark:hover:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10 cursor-pointer rounded"
                        onClick={() => onSortChange("", false)}
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>{t("analytics.clearSort")}</span>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator className="bg-zinc-200 dark:bg-zinc-800 my-1" />

                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer rounded"
                      onClick={() => {
                        setFilterCol(col.name);
                        setShowFilterBuilder(true);
                      }}
                    >
                      <FilterIcon className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <span>{t("analytics.filterByColumn")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer rounded"
                      onClick={() => {
                        navigator.clipboard.writeText(col.name);
                        setCopiedCol(col.name);
                        setTimeout(() => setCopiedCol(null), 1500);
                      }}
                    >
                      {copiedCol === col.name ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
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
                    className="h-7 text-xs font-mono"
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
                    <SelectTrigger className="w-full h-7 text-xs font-mono">
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
                  className="h-7 text-xs font-mono"
                />
              </div>
            );
          }

          const renderContent = () => {
            if (val === undefined) {
              return (
                <span
                  className="text-zinc-600 italic text-[11px] font-mono select-none"
                  title={t("datagrid.fieldNotSet")}
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
                    title={t("datagrid.navigateToRelation", {
                      table: rel.to_table,
                      column: rel.to_column,
                      val,
                    })}
                  >
                    <span className="font-semibold">{String(val)}</span>
                    <ArrowUpRight className="w-3 h-3 opacity-70 group-hover/fk:opacity-100 group-hover/fk:translate-x-0.5 group-hover/fk:-translate-y-0.5 transition-all shrink-0" />
                  </button>
                );
              }
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
              className="w-full h-full cursor-pointer hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50 rounded px-1.5 py-1 -mx-1.5 -my-1 transition-colors flex items-center justify-between group/cell"
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
                <Badge
                  variant="outline"
                  className="text-[9px] font-mono text-amber-400/90 font-normal px-1 py-0 h-4 bg-amber-950/50 border-amber-800/40"
                >
                  {t("datagrid.dynamicBadge")}
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
                title={t("datagrid.fieldNotSet")}
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
    onSaveCell,
    onNavigateRelation,
    isReadOnly,
    t,
    editingCell,
    inlineValue,
    startEditingCell,
    saveCellEdit,
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
    estimateSize: () => 37,
    overscan: 10,
    useFlushSync: false,
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
          <Separator
            orientation="vertical"
            className="h-4 bg-zinc-200 dark:bg-zinc-800 self-center"
          />
          <div className="flex items-center gap-2 min-w-0">
            <TableIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h2 className="font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate max-w-28 sm:max-w-44 md:max-w-none">
              {table.name}
            </h2>
          </div>
          <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono hidden md:inline whitespace-nowrap">
            {totalCount.toLocaleString()}{" "}
            {totalCount === 1 ? "record" : "records"}
          </span>

          <Separator
            orientation="vertical"
            className="h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 self-center hidden md:inline-block"
          />

          {/* Sub-view switcher: [ Data Grid ] | [ Schema & DDL ] */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-700/60 shrink-0">
            <button
              type="button"
              onClick={() => setActiveSubView("grid")}
              className={cn(
                "px-2 sm:px-2.5 py-1 text-xs font-mono font-medium rounded flex items-center gap-1.5 transition-all",
                activeSubView === "grid"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
            >
              <TableIcon className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">{t("schema.dataGrid")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView("schema")}
              className={cn(
                "px-2 sm:px-2.5 py-1 text-xs font-mono font-medium rounded flex items-center gap-1.5 transition-all",
                activeSubView === "schema"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
            >
              <FileCode className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="hidden sm:inline">{t("schema.schemaDdl")}</span>
            </button>
          </div>

          {/* View Mode toggle: Table | Document — MongoDB only */}
          {activeSubView === "grid" && dbType === "mongodb" && (
            <div
              className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-700/60"
              title={t("datagrid.viewMode.toggleTooltip")}
            >
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "px-2 py-1 text-xs font-mono font-medium rounded flex items-center gap-1.5 transition-all",
                  viewMode === "table"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
                title={t("datagrid.viewMode.table")}
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("document")}
                className={cn(
                  "px-2 py-1 text-xs font-mono font-medium rounded flex items-center gap-1.5 transition-all",
                  viewMode === "document"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
                )}
                title={t("datagrid.viewMode.document")}
              >
                <LayoutList className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {isReadOnly && (
            <Badge
              variant="outline"
              className="text-[11px] font-mono px-2 py-0.5 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10 gap-1 select-none font-medium"
              title={t("datagrid.readOnlyBanner")}
            >
              <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t("connection.readOnlyBadge")}</span>
            </Badge>
          )}
          {activeSubView === "grid" && displayedRows.length !== rows.length && (
            <Badge
              variant="outline"
              className="text-[11px] text-amber-700 dark:text-amber-400/90 font-mono bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800/40 px-1.5 py-0 h-auto font-normal"
            >
              {t("datagrid.showingMatches", { count: displayedRows.length })}
            </Badge>
          )}
        </div>

        <div
          data-tour="grid-toolbar"
          className="flex items-center gap-1.5 sm:gap-2 shrink-0"
        >
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
                  placeholder={`${t("datagrid.searchPlaceholder")} (/)`}
                  className="pl-8 pr-7 h-8 text-xs font-mono w-28 sm:w-36 md:w-44 lg:w-52 focus:w-44 sm:focus:w-52 transition-all"
                />
                {quickSearch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setQuickSearch("")}
                    className="absolute right-1 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 h-6 w-6"
                    title={t("datagrid.clearSearchTooltip")}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>

              {/* Filter toggle */}
              <Button
                type="button"
                variant={
                  filters.length > 0 || showFilterBuilder
                    ? "secondary"
                    : "outline"
                }
                size="sm"
                onClick={() => setShowFilterBuilder(!showFilterBuilder)}
                className={cn(
                  "text-xs font-mono font-medium gap-1 sm:gap-1.5 px-2 sm:px-3",
                  (filters.length > 0 || showFilterBuilder) &&
                    "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-500/50 text-emerald-800 dark:text-emerald-300",
                )}
                title={t("datagrid.filterButton")}
              >
                <FilterIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {t("datagrid.filterButton")}
                </span>
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
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                title={t("datagrid.reloadTableTooltip")}
                className="border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 active:bg-zinc-200 dark:active:bg-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shrink-0"
              >
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5 transition-colors",
                    (isLoading || isRefreshing) &&
                      "animate-spin text-indigo-600 dark:text-indigo-400",
                  )}
                />
              </Button>

              {/* Open in SQL / Query Console */}
              {onOpenQueryConsole && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenQueryConsole}
                  title={t("datagrid.openQueryConsole")}
                  className="text-xs font-mono font-medium gap-1 sm:gap-1.5 px-2 lg:px-3 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white shrink-0"
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="hidden xl:inline">
                    {t("datagrid.openQueryConsole")}
                  </span>
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
                        className="text-xs font-mono font-medium gap-1 sm:gap-1.5 px-2 lg:px-3 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white shrink-0"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                        <span className="hidden lg:inline">
                          {t("datagrid.export")}
                        </span>
                        <ChevronDown className="w-3 h-3 text-zinc-400" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="w-44 text-xs font-mono"
                  >
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
                  title={
                    isReadOnly
                      ? t("datagrid.readOnlyTooltip")
                      : t("datagrid.importCsv")
                  }
                  className={cn(
                    "text-xs font-mono font-medium gap-1 sm:gap-1.5 px-2 xl:px-3 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white shrink-0",
                    isReadOnly && "cursor-not-allowed opacity-60",
                  )}
                >
                  <UploadCloud className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                  <span className="hidden xl:inline">
                    {t("datagrid.importCsv")}
                  </span>
                </Button>
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
                  "text-xs font-semibold gap-1 sm:gap-1.5 px-2.5 sm:px-3 shadow-xs transition-colors shrink-0",
                  isReadOnly
                    ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 cursor-not-allowed opacity-60"
                    : "bg-emerald-600 hover:bg-emerald-500 text-white",
                )}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>{t("datagrid.addRow")}</span>
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
                  title={t("datagrid.openQueryConsole")}
                  className="text-xs font-mono font-medium gap-1 sm:gap-1.5 px-2 sm:px-3 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white shrink-0"
                >
                  <Terminal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="hidden sm:inline">
                    {t("datagrid.openQueryConsole")}
                  </span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={handleRefresh}
                disabled={isLoading || isRefreshing}
                title={t("datagrid.reloadTableTooltip")}
                className="border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 active:bg-zinc-200 dark:active:bg-zinc-700/80 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors shrink-0"
              >
                <RefreshCw
                  className={cn(
                    "w-3.5 h-3.5 transition-colors",
                    (isLoading || isRefreshing) &&
                      "animate-spin text-indigo-600 dark:text-indigo-400",
                  )}
                />
              </Button>
            </>
          )}
        </div>
      </div>

      {activeSubView === "schema" ? (
        <Suspense
          fallback={
            <div className="p-8 text-center text-xs text-zinc-500 font-mono">
              Loading Schema...
            </div>
          }
        >
          <SchemaInspector
            connId={connId}
            table={table}
            isReadOnly={isReadOnly}
            onNavigateRelation={onNavigateRelation}
          />
        </Suspense>
      ) : (
        <>
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
            <div className="px-3 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/30 flex items-center justify-between text-xs font-mono text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="font-medium">
                  {t("datagrid.readOnlyBanner")}
                </span>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-bold border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/20"
              >
                {t("connection.readOnlyBadge")}
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
                  <span className="text-zinc-500 dark:text-zinc-400">
                    {t("datagrid.where")}
                  </span>
                  <Select
                    value={filterCol}
                    onValueChange={(val) => {
                      if (typeof val === "string") setFilterCol(val);
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs font-mono min-w-32">
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
                      if (typeof val === "string") setFilterOp(val as any);
                    }}
                  >
                    <SelectTrigger className="h-7 text-xs font-mono min-w-24">
                      <SelectValue placeholder={t("datagrid.operator")} />
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
                    placeholder={t("datagrid.valuePlaceholder")}
                    className="h-7 text-xs font-mono w-44"
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
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 uppercase font-mono tracking-wider mr-1">
                    {t("datagrid.activeFilters")}
                  </span>
                  {filters.map((f, i) => (
                    <Badge
                      key={i}
                      variant="outline"
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300 text-xs font-mono font-normal"
                    >
                      <span className="font-semibold text-emerald-900 dark:text-emerald-200">
                        {f.column}
                      </span>
                      <span className="text-emerald-600 dark:text-zinc-400">
                        {f.operator}
                      </span>
                      <span className="text-emerald-800 dark:text-zinc-200 font-medium">
                        {f.value}
                      </span>
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
                    {t("datagrid.clearAll")}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Grid Container */}
          <div
            ref={tableContainerRef}
            data-tour="datagrid-view"
            className="flex-1 overflow-auto relative flex flex-col"
          >
            {isLoading || isRefreshing ? (
              /* High-fidelity shadcn UI Table Skeleton */
              <table className="w-full caption-bottom text-sm border-collapse text-left border-b border-zinc-200 dark:border-zinc-800 animate-in fade-in duration-150">
                <TableHeader className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  <TableRow>
                    <TableHead className="w-12 px-3 py-2 text-xs font-mono font-medium text-zinc-400 not-last:border-r border-zinc-200 dark:border-zinc-800/80">
                      #
                    </TableHead>
                    {table?.columns?.map((c) => (
                      <TableHead
                        key={c.name}
                        className="px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-400 not-last:border-r border-zinc-200 dark:border-zinc-800/80 whitespace-nowrap h-auto"
                      >
                        <div className="flex items-center gap-1.5 py-1">
                          <Skeleton className="size-3.5 rounded shrink-0 bg-zinc-300/80 dark:bg-zinc-700/80" />
                          <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            {c.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 font-normal">
                            {c.type}
                          </span>
                        </div>
                      </TableHead>
                    )) ??
                      [1, 2, 3, 4, 5, 6].map((idx) => (
                        <TableHead
                          key={idx}
                          className="px-3 py-2 not-last:border-r border-zinc-200 dark:border-zinc-800/80"
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
                      className="hover:bg-transparent h-9.25"
                    >
                      <TableCell className="w-12 px-3 py-2 text-xs font-mono text-zinc-400 not-last:border-r border-zinc-200/80 dark:border-zinc-800/40">
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
                            className="px-3 py-2 not-last:border-r border-zinc-200/80 dark:border-zinc-800/40 whitespace-nowrap"
                          >
                            {isPk ? (
                              <div className="flex items-center gap-1.5">
                                <Skeleton className="size-3 rounded-full bg-amber-400/40 dark:bg-amber-400/30 shrink-0" />
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
                            className="px-3 py-2 not-last:border-r border-zinc-200/80 dark:border-zinc-800/40"
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
              <div className="flex-1 flex items-center justify-center p-8">
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
              <table className="w-full caption-bottom text-sm border-collapse text-left border-b border-zinc-200 dark:border-zinc-800">
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
                          <TableRow
                            key={row.id}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors group"
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setContextMenu({
                                mouseX: e.clientX,
                                mouseY: e.clientY,
                                row: row.original,
                                colName: "",
                                cellValue: undefined,
                              });
                            }}
                          >
                            {row.getVisibleCells().map((cell) => (
                              <TableCell
                                key={cell.id}
                                className="px-3 py-2 text-xs not-last:border-r border-zinc-200/80 dark:border-zinc-800/40 whitespace-nowrap max-w-sm truncate text-zinc-800 dark:text-zinc-200"
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setContextMenu({
                                    mouseX: e.clientX,
                                    mouseY: e.clientY,
                                    row: row.original,
                                    colName: cell.column.id.replace(
                                      "_extra_",
                                      "",
                                    ),
                                    cellValue: cell.getValue(),
                                  });
                                }}
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
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
          <div className="h-11 px-3 sm:px-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900/40 flex items-center justify-between gap-2 text-xs font-mono text-zinc-500 dark:text-zinc-400 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <span className="truncate">
                {totalCount === 0
                  ? `0 ${t("datagrid.records")}`
                  : `${t("datagrid.showing")} ${page * pageSize + 1} - ${Math.min((page + 1) * pageSize, totalCount)} ${t("datagrid.of")} ${totalCount}`}
              </span>
              <div className="hidden sm:flex items-center gap-1.5 ml-1 sm:ml-2 shrink-0">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t("datagrid.perPage")}
                </span>
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

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                {t("datagrid.page")} {page + 1} {t("datagrid.of")} {totalPages}
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

      {connId && isImportModalOpen && (
        <Suspense fallback={null}>
          <ImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            connId={connId}
            table={table}
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

      {/* Custom Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{
            position: "fixed",
            left: `${Math.min(contextMenu.mouseX, window.innerWidth - 230)}px`,
            top: `${Math.min(contextMenu.mouseY, window.innerHeight - 280)}px`,
          }}
          className="z-50 w-56 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-2xl p-1 text-xs font-mono animate-in fade-in-50 zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between">
            <span className="truncate">
              {contextMenu.colName &&
              contextMenu.colName !== "_actions" &&
              contextMenu.colName !== "_row_index"
                ? `Column: ${contextMenu.colName}`
                : `Row Actions`}
            </span>
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-4 font-normal"
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
                setContextMenu(null);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer",
                isReadOnly &&
                  "opacity-50 cursor-not-allowed hover:bg-transparent",
              )}
            >
              <Edit2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{t("datagrid.contextMenu.editRecord")}</span>
            </button>

            {/* Delete Record */}
            <button
              type="button"
              disabled={isReadOnly}
              onClick={() => {
                onDeleteRow(contextMenu.row);
                setContextMenu(null);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded transition-colors cursor-pointer",
                isReadOnly &&
                  "opacity-50 cursor-not-allowed hover:bg-transparent",
              )}
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>{t("datagrid.contextMenu.deleteRecord")}</span>
            </button>
          </div>

          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800/80" />

          <div className="py-1">
            {/* Copy Cell Value */}
            {contextMenu.cellValue !== undefined &&
              contextMenu.cellValue !== null && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      String(contextMenu.cellValue),
                    );
                    setCopiedNotification(t("datagrid.contextMenu.copied"));
                    setTimeout(() => setCopiedNotification(null), 1500);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-500 shrink-0" />
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
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                >
                  <FilterIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
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
                setCopiedNotification(t("datagrid.contextMenu.copied"));
                setTimeout(() => setCopiedNotification(null), 1500);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-zinc-800 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
            >
              <FileJson className="w-3.5 h-3.5 text-purple-500 shrink-0" />
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
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 rounded transition-colors cursor-pointer"
                >
                  <ArrowUpRight className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                  <span className="truncate">
                    {t("datagrid.contextMenu.navigateToRelation")} (
                    {rel.to_table})
                  </span>
                </button>
              );
            })()}

            {/* Copy Column Name */}
            {contextMenu.colName &&
              contextMenu.colName !== "_actions" &&
              contextMenu.colName !== "_row_index" && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(contextMenu.colName);
                    setCopiedNotification(t("datagrid.contextMenu.copied"));
                    setTimeout(() => setCopiedNotification(null), 1500);
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>{t("datagrid.contextMenu.copyColumnName")}</span>
                </button>
              )}
          </div>
        </div>
      )}

      {/* Copied Toast Notification */}
      {copiedNotification && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-3.5 py-2 rounded-md shadow-lg text-xs font-mono flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="w-4 h-4 shrink-0" />
          <span>{copiedNotification}</span>
        </div>
      )}
    </div>
  );
};
