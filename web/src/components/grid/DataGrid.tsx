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
  FileCode2,
  Database,
  Settings2,
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
} from "@/lib/types";
import { exportTableData, fetchTableStats, type ExportFormat } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/common";
import { QuickStatsBar } from "./QuickStatsBar";
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
      if (col.type === "binary") return "Binary";
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
    setTimeout(() => setCopiedRow(null), COPY_FEEDBACK_MS);
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
        <span className="text-[11px] text-zinc-500 italic select-none">—</span>
      );
    }
    if (val === null) {
      return (
        <span className="font-mono text-[11px] text-zinc-500 italic">null</span>
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
            className="inline-flex cursor-pointer items-center gap-1 font-mono text-[11px] text-sky-600 hover:underline dark:text-sky-400"
          >
            {String(val)}
            <ArrowUpRight className="h-3 w-3 shrink-0" />
          </button>
        );
      }
    }

    if (typeof val === "boolean") {
      return (
        <span
          className={cn(
            "rounded border px-1.5 py-px font-mono text-[11px] font-semibold",
            val
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "border-zinc-200 bg-zinc-100 text-zinc-600 dark:border-transparent dark:bg-zinc-800 dark:text-zinc-400",
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
          className="cursor-help font-mono text-[11px] break-all text-amber-700 dark:text-amber-300/90"
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
    <div className="flex-1 space-y-2 overflow-auto bg-white p-3 dark:bg-zinc-950">
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
              "group overflow-hidden rounded-lg border bg-white transition-colors dark:bg-zinc-900",
              editingDocIdx === globalIdx
                ? "border-emerald-500/60 ring-1 ring-emerald-500/20 dark:border-emerald-500/40"
                : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700",
            )}
            onDoubleClick={() => {
              if (!isReadOnly && editingDocIdx !== globalIdx)
                enterEditMode(globalIdx, row);
            }}
          >
            {/* Card Header: row# + primary key + actions */}
            <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/70 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/70">
              <div className="flex min-w-0 items-center gap-2">
                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-zinc-400 select-none dark:text-zinc-600">
                  {rowNumber}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                  {pkKey}:
                </span>
                <span className="truncate font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  {pkVal !== undefined && pkVal !== null ? (
                    String(pkVal)
                  ) : (
                    <span className="text-zinc-400 italic">null</span>
                  )}
                </span>
                {editingDocIdx === globalIdx && (
                  <span className="ml-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-px font-mono text-[10px] text-emerald-600 select-none dark:border-emerald-800/50 dark:bg-emerald-950/40 dark:text-emerald-400">
                    editing
                  </span>
                )}
              </div>

              {/* Per-card actions — hidden when editing */}
              {editingDocIdx !== globalIdx && (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  {!isReadOnly && (
                    <span className="mr-1 hidden font-mono text-[10px] text-zinc-400 select-none group-hover:inline dark:text-zinc-600">
                      double-click to edit
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleCopyJson(row, globalIdx)}
                    title={t("datagrid.documentView.copyJson")}
                    className="cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-blue-600 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
                  >
                    {copiedRow === globalIdx ? (
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditRow(row)}
                    disabled={isReadOnly}
                    title={t("datagrid.editRecordTooltip")}
                    className={cn(
                      "cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-emerald-400",
                      isReadOnly &&
                        "pointer-events-none cursor-not-allowed opacity-40",
                    )}
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRow(row)}
                    disabled={isReadOnly}
                    title={t("datagrid.deleteRecordTooltip")}
                    className={cn(
                      "cursor-pointer rounded p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400",
                      isReadOnly &&
                        "pointer-events-none cursor-not-allowed opacity-40",
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
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
                        "flex min-w-0 items-center gap-0 border-l-2 transition-colors",
                        isEditing && isDirty
                          ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10"
                          : "border-l-transparent",
                      )}
                    >
                      {/* Line number */}
                      {isEditing && (
                        <span className="w-8 shrink-0 self-start pt-0.75 pr-2 text-right font-mono text-[10px] text-zinc-400 select-none dark:text-zinc-600">
                          {fieldLineNum}
                        </span>
                      )}

                      {/* Field name */}
                      <span
                        className={cn(
                          "shrink-0 self-start truncate font-mono text-[11px] text-zinc-500 dark:text-zinc-400",
                          isEditing
                            ? "min-w-35 px-2 pt-0.75"
                            : "min-w-30 px-3 py-px",
                        )}
                      >
                        {key}
                      </span>
                      <span className="shrink-0 self-start pt-0.75 font-mono text-[11px] text-zinc-400 dark:text-zinc-600">
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
                            "min-w-0 flex-1 resize-none overflow-hidden border-0 border-b bg-transparent px-2 py-px font-mono text-[11px] leading-5 text-zinc-900 transition-colors focus:outline-none dark:text-zinc-100",
                            isDirty
                              ? "border-b-emerald-500 dark:border-b-emerald-400"
                              : "border-b-zinc-200 focus:border-b-zinc-400 dark:border-b-zinc-700 dark:focus:border-b-zinc-500",
                          )}
                          autoFocus={
                            key === visibleKeys.filter((k) => k !== pkKey)[0]
                          }
                        />
                      ) : (
                        <span
                          className={cn(
                            "min-w-0 flex-1 font-mono text-[11px] wrap-break-word",
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
                          "shrink-0 self-start pt-0.75 pl-2 font-mono text-[10px]",
                          isEditing
                            ? "min-w-14 pr-3 text-right text-zinc-400 dark:text-zinc-500"
                            : "min-w-14 pr-3 text-right text-zinc-300 dark:text-zinc-700",
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
                  className="mt-1.5 ml-3 flex cursor-pointer items-center gap-1 font-mono text-[11px] text-zinc-400 transition-colors select-none hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUpIcon className="h-3.5 w-3.5" />
                      {t("datagrid.documentView.collapse")}
                    </>
                  ) : (
                    <>
                      <ChevronDownIcon className="h-3.5 w-3.5" />
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
                  "flex items-center justify-between border-t px-3 py-2 transition-colors",
                  isDocModified(row)
                    ? "border-amber-200 bg-amber-50 dark:border-amber-800/60 dark:bg-amber-950/30"
                    : "border-zinc-100 bg-zinc-50/60 dark:border-zinc-800 dark:bg-zinc-900/60",
                )}
              >
                <span
                  className={cn(
                    "font-mono text-[11px] transition-opacity",
                    isDocModified(row)
                      ? "text-amber-700 opacity-100 dark:text-amber-400"
                      : "opacity-0 select-none",
                  )}
                >
                  Document modified.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="cursor-pointer rounded border border-zinc-300 bg-white px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide text-zinc-700 uppercase transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || !onSaveCell || !isDocModified(row)}
                    onClick={() => handleUpdate(row)}
                    className={cn(
                      "rounded border px-3 py-1.5 font-mono text-[11px] font-semibold tracking-wide uppercase transition-colors",
                      isSaving || !onSaveCell || !isDocModified(row)
                        ? "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800"
                        : "cursor-pointer border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500",
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
      {/* Top Action Bar */}
      <div className="flex h-11 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="flex h-full min-w-0 items-center gap-2 sm:gap-2.5">
          <SidebarTrigger className="-ml-1 shrink-0 cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" />
          <Separator
            orientation="vertical"
            className="h-4 self-center bg-zinc-200 dark:bg-zinc-800"
          />
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <TableIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
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
          <div className="flex shrink-0 items-center rounded-md border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700/60 dark:bg-zinc-800/80">
            <button
              type="button"
              onClick={() => setActiveSubView("grid")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs font-medium transition-all sm:px-2.5",
                activeSubView === "grid"
                  ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
              title={t("schema.dataGrid")}
            >
              <TableIcon className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden md:inline">{t("schema.dataGrid")}</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubView("schema")}
              className={cn(
                "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs font-medium transition-all sm:px-2.5",
                activeSubView === "schema"
                  ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
              )}
              title={t("schema.schemaDdl")}
            >
              <FileCode className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
              <span className="hidden md:inline">{t("schema.schemaDdl")}</span>
            </button>
          </div>

          {/* View Mode toggle: Table | Document — MongoDB only */}
          {activeSubView === "grid" && dbType === "mongodb" && (
            <div
              className="flex items-center rounded-md border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700/60 dark:bg-zinc-800/80"
              title={t("datagrid.viewMode.toggleTooltip")}
            >
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs font-medium transition-all",
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
                onClick={() => setViewMode("document")}
                className={cn(
                  "flex items-center gap-1.5 rounded px-2 py-1 font-mono text-xs font-medium transition-all",
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
          {activeSubView === "grid" && displayedRows.length !== rows.length && (
            <Badge
              variant="outline"
              className="h-auto border-amber-200 bg-amber-50 px-1.5 py-0 font-mono text-[11px] font-normal text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/40 dark:text-amber-400/90"
            >
              {t("datagrid.showingMatches", { count: displayedRows.length })}
            </Badge>
          )}
        </div>

        <div
          data-tour="grid-toolbar"
          className="flex shrink-0 items-center gap-1 sm:gap-1.5 lg:gap-2"
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
                  onChange={(e) => setQuickSearch(e.target.value)}
                  placeholder={`${t("datagrid.searchPlaceholder")} (/)`}
                  className="h-8 w-24 pr-7 pl-8 font-mono text-xs transition-all focus:w-44 sm:w-32 sm:focus:w-48 md:w-36 md:focus:w-52 lg:w-44"
                />
                {quickSearch && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setQuickSearch("")}
                    className="absolute right-1 h-6 w-6 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
                    title={t("datagrid.clearSearchTooltip")}
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
                      onClick={() => setShowFilterBuilder(!showFilterBuilder)}
                      className={cn(
                        "gap-1 px-2 font-mono text-xs font-medium sm:gap-1.5 sm:px-2.5 2xl:px-3",
                        (filters.length > 0 || showFilterBuilder) &&
                          "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300",
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
                      onClick={handleRefresh}
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
                        <Terminal className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
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
                    <TooltipContent side="bottom" className="font-mono text-xs">
                      {t("datagrid.export")}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenuContent
                    align="end"
                    className="w-52 font-mono text-xs"
                  >
                    <DropdownMenuItem onClick={() => handleExport("csv")}>
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>{t("datagrid.exportAsCsv")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("json")}>
                      <FileJson className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      <span>{t("datagrid.exportAsJson")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("jsonl")}>
                      <FileCode2 className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
                      <span>{t("datagrid.exportAsJsonl")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("xlsx")}>
                      <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
                      <span>{t("datagrid.exportAsXlsx")}</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExport("parquet")}>
                      <Database className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>{t("datagrid.exportAsParquet")}</span>
                    </DropdownMenuItem>
                    <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
                    <DropdownMenuItem
                      onClick={() => {
                        setImportModalMode("export");
                        setIsImportModalOpen(true);
                      }}
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
                        onClick={() => {
                          setImportModalMode("import");
                          setIsImportModalOpen(true);
                        }}
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
                    : "bg-emerald-600 text-white hover:bg-emerald-500",
                )}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{t("datagrid.addRow")}</span>
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
                        <Terminal className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
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
                      onClick={handleRefresh}
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

          {/* Filter Builder & Active Filter Chips */}
          {(showFilterBuilder || filters.length > 0) && (
            <div className="space-y-2 border-b border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/40">
              {showFilterBuilder && (
                <form
                  onSubmit={handleAddFilter}
                  className="flex flex-wrap items-center gap-2 font-mono text-xs"
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
                        setFilterOp(val);
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
                      <SelectItem value="contains">CONTAINS</SelectItem>
                    </SelectContent>
                  </Select>

                  <Input
                    type="text"
                    value={filterVal}
                    onChange={(e) => setFilterVal(e.target.value)}
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
                        onClick={() => handleRemoveFilter(i)}
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
                          <TableRow
                            key={row.id}
                            data-index={virtualRow.index}
                            ref={rowVirtualizer.measureElement}
                            className="group transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
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
                            {row.getVisibleCells().map((cell) => {
                              const colId = cell.column.id.replace(
                                "_extra_",
                                "",
                              );
                              const isCellFocused =
                                focusedCell?.rowIndex === virtualRow.index &&
                                focusedCell?.colName === colId;
                              const isEditingThisCell =
                                editingCell?.rowIndex === virtualRow.index &&
                                editingCell?.colName === colId;

                              return (
                                <TableCell
                                  key={cell.id}
                                  tabIndex={0}
                                  data-cell-editing={
                                    isEditingThisCell ? "true" : undefined
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setFocusedCell({
                                      rowIndex: virtualRow.index,
                                      colName: colId,
                                    });
                                  }}
                                  className={cn(
                                    "max-w-sm truncate border-zinc-200/80 px-3 py-2 text-xs whitespace-nowrap text-zinc-800 transition-all outline-none not-last:border-r dark:border-zinc-800/40 dark:text-zinc-200",
                                    isCellFocused &&
                                      "relative z-20 bg-emerald-500/10 font-medium ring-2 ring-emerald-500 ring-inset dark:bg-emerald-500/20 dark:ring-emerald-400",
                                  )}
                                  onContextMenu={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setContextMenu({
                                      mouseX: e.clientX,
                                      mouseY: e.clientY,
                                      row: row.original,
                                      colName: colId,
                                      cellValue: cell.getValue(),
                                    });
                                  }}
                                >
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                  )}
                                </TableCell>
                              );
                            })}
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
          <div className="flex h-11 min-w-0 items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50/80 px-3 font-mono text-xs text-zinc-500 sm:px-4 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <span className="truncate">
                {totalCount === 0
                  ? `0 ${t("datagrid.records")}`
                  : `${t("datagrid.showing")} ${page * pageSize + 1} - ${Math.min((page + 1) * pageSize, totalCount)} ${t("datagrid.of")} ${totalCount}`}
              </span>
              <div className="ml-1 hidden shrink-0 items-center gap-1.5 sm:ml-2 sm:flex">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t("datagrid.perPage")}
                </span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(val) => val && onPageSizeChange(Number(val))}
                >
                  <SelectTrigger className="h-6 w-16 px-2 py-0 font-mono text-xs">
                    <SelectValue placeholder={String(pageSize)} />
                  </SelectTrigger>
                  <SelectContent side="top" align="start" className="min-w-16">
                    {PAGE_SIZE_OPTIONS.map((sizeOpt) => (
                      <SelectItem key={sizeOpt} value={String(sizeOpt)}>
                        {sizeOpt}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] whitespace-nowrap text-zinc-500 dark:text-zinc-400">
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
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={page + 1 >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                  className="text-zinc-700 dark:text-zinc-300"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
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

      {/* Custom Right-Click Context Menu */}
      {contextMenu && (
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
                ? `Column: ${contextMenu.colName}`
                : `Row Actions`}
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
                setContextMenu(null);
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
                setContextMenu(null);
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
                    setTimeout(
                      () => setCopiedNotification(null),
                      COPY_FEEDBACK_MS,
                    );
                    setContextMenu(null);
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
                    setContextMenu(null);
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
                setCopiedNotification(t("datagrid.contextMenu.copied"));
                setTimeout(() => setCopiedNotification(null), COPY_FEEDBACK_MS);
                setContextMenu(null);
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
                    setContextMenu(null);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-sky-600 transition-colors hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-950/40"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-sky-500" />
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
                    setTimeout(
                      () => setCopiedNotification(null),
                      COPY_FEEDBACK_MS,
                    );
                    setContextMenu(null);
                  }}
                  className="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-left text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                >
                  <Copy className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <span>{t("datagrid.contextMenu.copyColumnName")}</span>
                </button>
              )}
          </div>
        </div>
      )}

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
