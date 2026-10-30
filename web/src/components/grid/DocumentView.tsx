import React, { useState, useEffect, type FC } from "react";
import {
  ChevronDown as ChevronDownIcon,
  ChevronUp as ChevronUpIcon,
  Copy,
  Check,
  Edit2,
  Trash2,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "cn";
import type { TableSchema } from "@/lib/types";

const COPY_FEEDBACK_MS = 2000;

export interface DocumentViewProps {
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

export const DocumentView: FC<DocumentViewProps> = React.memo(
  ({
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
        const changedEntries = Object.entries(editingValues).filter(
          ([k, v]) => {
            const orig = row[k];
            const origStr =
              orig === null || orig === undefined
                ? ""
                : typeof orig === "object"
                  ? JSON.stringify(orig)
                  : String(orig);
            return v !== origStr;
          },
        );
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
          <span className="text-[11px] text-zinc-500 italic select-none">
            —
          </span>
        );
      }
      if (val === null) {
        return (
          <span className="font-mono text-[11px] text-zinc-500 italic">
            null
          </span>
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
              onClick={() =>
                onNavigateRelation(rel.to_table, rel.to_column, val)
              }
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
                  ? "border-primary/60 ring-primary/20 dark:border-primary/40 ring-1"
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
                                e.preventDefault();
                                const el = e.currentTarget;
                                const start =
                                  el.selectionStart ?? currentVal.length;
                                const end =
                                  el.selectionEnd ?? currentVal.length;
                                const newVal =
                                  currentVal.slice(0, start) +
                                  "\n" +
                                  currentVal.slice(end);
                                setEditingValues((prev) => ({
                                  ...prev,
                                  [key]: newVal,
                                }));
                                setTimeout(() => {
                                  el.selectionStart = el.selectionEnd =
                                    start + 1;
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
                          : "border-primary bg-primary hover:bg-primary/90 cursor-pointer text-white",
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
  },
);
DocumentView.displayName = "DocumentView";
