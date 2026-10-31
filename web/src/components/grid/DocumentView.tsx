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
          <span className="text-muted-foreground text-[11px] italic select-none">
            —
          </span>
        );
      }
      if (val === null) {
        return (
          <span className="text-muted-foreground font-mono text-[11px] italic">
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
                ? "border-success/30 bg-success/10 text-success dark:border-success/50 dark:bg-success/40 dark:text-success"
                : "border-border bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground dark:border-transparent",
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
            className="text-warning dark:text-warning/90 cursor-help font-mono text-[11px] break-all"
            title={JSON.stringify(val, null, 2)}
          >
            {isLong ? json.slice(0, 80) + "…" : json}
          </span>
        );
      }

      if (colSchema?.is_primary_key) {
        return (
          <span className="text-warning dark:text-warning font-mono text-[11px] font-semibold">
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
        <span className="text-success dark:text-success font-mono text-[11px]">
          &quot;{str}&quot;
        </span>
      );
    };

    return (
      <div className="bg-background dark:bg-background flex-1 space-y-2 overflow-auto p-3">
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
                "group bg-background dark:bg-card overflow-hidden rounded-lg border transition-colors",
                editingDocIdx === globalIdx
                  ? "border-primary/60 ring-primary/20 dark:border-primary/40 ring-1"
                  : "border-border hover:border-border dark:border-border dark:hover:border-border",
              )}
              onDoubleClick={() => {
                if (!isReadOnly && editingDocIdx !== globalIdx)
                  enterEditMode(globalIdx, row);
              }}
            >
              {/* Card Header: row# + primary key + actions */}
              <div className="border-border bg-card/70 dark:border-border dark:bg-card/70 flex items-center justify-between border-b px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-muted-foreground dark:text-muted-foreground w-6 shrink-0 text-right font-mono text-[11px] select-none">
                    {rowNumber}
                  </span>
                  <span className="text-muted-foreground dark:text-muted-foreground shrink-0 font-mono text-[11px]">
                    {pkKey}:
                  </span>
                  <span className="text-warning dark:text-warning truncate font-mono text-[11px] font-semibold">
                    {pkVal !== undefined && pkVal !== null ? (
                      String(pkVal)
                    ) : (
                      <span className="text-muted-foreground italic">null</span>
                    )}
                  </span>
                  {editingDocIdx === globalIdx && (
                    <span className="border-success/30 bg-success/10 text-success dark:border-success/50 dark:bg-success/40 dark:text-success ml-1 rounded border px-1.5 py-px font-mono text-[10px] select-none">
                      editing
                    </span>
                  )}
                </div>

                {/* Per-card actions — hidden when editing */}
                {editingDocIdx !== globalIdx && (
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {!isReadOnly && (
                      <span className="text-muted-foreground dark:text-muted-foreground mr-1 hidden font-mono text-[10px] select-none group-hover:inline">
                        double-click to edit
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleCopyJson(row, globalIdx)}
                      title={t("datagrid.documentView.copyJson")}
                      className="text-muted-foreground hover:bg-muted dark:hover:bg-muted cursor-pointer rounded p-1 transition-colors hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {copiedRow === globalIdx ? (
                        <Check className="text-success h-3.5 w-3.5" />
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
                        "text-muted-foreground hover:bg-muted hover:text-success dark:hover:bg-muted dark:hover:text-success cursor-pointer rounded p-1 transition-colors",
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
                        "text-muted-foreground hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/40 dark:hover:text-destructive cursor-pointer rounded p-1 transition-colors",
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
                            ? "border-l-success bg-success/40 dark:bg-success/10"
                            : "border-l-transparent",
                        )}
                      >
                        {/* Line number */}
                        {isEditing && (
                          <span className="text-muted-foreground dark:text-muted-foreground w-8 shrink-0 self-start pt-0.75 pr-2 text-right font-mono text-[10px] select-none">
                            {fieldLineNum}
                          </span>
                        )}

                        {/* Field name */}
                        <span
                          className={cn(
                            "text-muted-foreground shrink-0 self-start truncate font-mono text-[11px]",
                            isEditing
                              ? "min-w-35 px-2 pt-0.75"
                              : "min-w-30 px-3 py-px",
                          )}
                        >
                          {key}
                        </span>
                        <span className="text-muted-foreground dark:text-muted-foreground shrink-0 self-start pt-0.75 font-mono text-[11px]">
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
                              "text-foreground dark:text-foreground min-w-0 flex-1 resize-none overflow-hidden border-0 border-b bg-transparent px-2 py-px font-mono text-[11px] leading-5 transition-colors focus:outline-none",
                              isDirty
                                ? "border-b-success dark:border-b-success"
                                : "border-b-border focus:border-b-border dark:border-b-border dark:focus:border-b-border",
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
                                ? "text-muted-foreground dark:text-muted-foreground px-2 py-px"
                                : "px-2 py-px",
                            )}
                          >
                            {isEditing ? (
                              <span className="text-warning dark:text-warning">
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
                              ? "text-muted-foreground min-w-14 pr-3 text-right"
                              : "text-muted-foreground dark:text-foreground min-w-14 pr-3 text-right",
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
                    className="text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-muted-foreground mt-1.5 ml-3 flex cursor-pointer items-center gap-1 font-mono text-[11px] transition-colors select-none"
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
                      ? "border-warning/30 bg-warning/10 dark:border-warning/60 dark:bg-warning/30"
                      : "border-border bg-card/60 dark:border-border dark:bg-card/60",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[11px] transition-opacity",
                      isDocModified(row)
                        ? "text-warning dark:text-warning opacity-100"
                        : "opacity-0 select-none",
                    )}
                  >
                    Document modified.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="border-border bg-background text-foreground hover:bg-card dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted cursor-pointer rounded border px-3 py-1.5 font-mono text-[11px] font-medium tracking-wide uppercase transition-colors"
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
                          ? "border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted cursor-not-allowed"
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
