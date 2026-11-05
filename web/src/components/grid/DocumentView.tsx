import React, { useState, useMemo, useCallback, useRef } from "react";
import {
  ListTree,
  Code2,
  Table as TableIcon,
  Copy,
  CopyPlus,
  Check,
  Edit2,
  Trash2,
  Maximize2,
  Minimize2,
  Save,
  AlertCircle,
} from "lucide-react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import type { TableSchema } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { DocumentTreeNode } from "./bson/DocumentTreeNode";
import {
  detectBsonType,
  formatBsonValue,
  type BsonType,
} from "./bson/bsonTypes";
import { BsonBadge } from "./bson/BsonBadge";
import { BsonCellEditor } from "./cell-inspector/BsonCellEditor";

const COPY_FEEDBACK_MS = 2000;

export type DocumentSubViewMode = "tree" | "json" | "table";

export interface DocumentViewProps {
  rows: Record<string, any>[];
  table: TableSchema;
  extraColumns: string[];
  page: number;
  pageSize: number;
  isReadOnly: boolean;
  isTabActive?: boolean;
  isLoading?: boolean;
  onEditRow: (row: Record<string, any>) => void;
  onDeleteRow: (row: Record<string, any>) => void;
  onSaveCell?: (
    row: Record<string, any>,
    columnName: string,
    newValue: any,
  ) => Promise<void>;
  onCloneRow?: (row: Record<string, any>) => Promise<void> | void;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: any,
  ) => void;
  t: (key: string, opts?: any) => string;
}

// Helper to flatten nested objects for the flattened Table View sub-mode
function flattenDoc(
  obj: Record<string, any>,
  prefix = "",
  depth = 0,
  maxDepth = 2,
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("_pb_")) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === "object" && depth < maxDepth) {
      if (Array.isArray(val)) {
        if (val.length === 0) {
          result[path] = val;
        } else {
          val.slice(0, 3).forEach((item, idx) => {
            if (typeof item === "object" && item !== null) {
              Object.assign(
                result,
                flattenDoc(item, `${path}.${idx}`, depth + 1, maxDepth),
              );
            } else {
              result[`${path}.${idx}`] = item;
            }
          });
        }
      } else {
        Object.assign(result, flattenDoc(val, path, depth + 1, maxDepth));
      }
    } else {
      result[path] = val;
    }
  }
  return result;
}

export function DocumentViewSkeleton({ className }: { className?: string }) {
  return (
    <div
      data-testid="document-view-skeleton"
      className={cn(
        "bg-background dark:bg-background flex flex-1 flex-col overflow-hidden",
        className,
      )}
    >
      {/* Sub-Header Toolbar Skeleton */}
      <div className="border-border bg-card/60 dark:border-border dark:bg-card/40 flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="border-border/80 bg-background/80 flex items-center gap-1 rounded-md border p-0.5">
          <Skeleton className="h-6 w-14 rounded" />
          <Skeleton className="h-6 w-14 rounded" />
          <Skeleton className="h-6 w-14 rounded" />
        </div>
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-6 w-20 rounded" />
        </div>
      </div>

      {/* Main Content Area: Stacked Compass Document Cards */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {/* Card 1: Rich Object Card Skeleton */}
        <div className="bg-card/60 dark:bg-card/40 border-border overflow-hidden rounded-lg border shadow-2xs">
          <div className="border-border bg-muted/40 dark:border-border dark:bg-muted/20 flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-6 rounded" />
              <Skeleton className="h-3.5 w-8 rounded" />
              <Skeleton className="h-3.5 w-48 rounded" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="size-5 rounded" />
              <Skeleton className="size-5 rounded" />
            </div>
          </div>
          <div className="space-y-2.5 p-3 font-mono text-xs">
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-12 rounded" />
              <Skeleton className="h-3 w-48 rounded" />
              <Skeleton className="ml-auto h-3.5 w-14 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-3 w-36 rounded" />
              <Skeleton className="ml-auto h-3.5 w-12 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-14 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="ml-auto h-3.5 w-10 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="size-3.5 rounded" />
              <Skeleton className="h-3 w-10 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="ml-auto h-3.5 w-12 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-6">
              <Skeleton className="h-3 w-6 rounded" />
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="ml-auto h-3.5 w-10 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="ml-auto h-3.5 w-10 rounded-full" />
            </div>
          </div>
        </div>

        {/* Card 2: Medium Object Card Skeleton */}
        <div className="bg-card/60 dark:bg-card/40 border-border overflow-hidden rounded-lg border shadow-2xs">
          <div className="border-border bg-muted/40 dark:border-border dark:bg-muted/20 flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-6 rounded" />
              <Skeleton className="h-3.5 w-8 rounded" />
              <Skeleton className="h-3.5 w-44 rounded" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="size-5 rounded" />
              <Skeleton className="size-5 rounded" />
            </div>
          </div>
          <div className="space-y-2.5 p-3 font-mono text-xs">
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-12 rounded" />
              <Skeleton className="h-3 w-44 rounded" />
              <Skeleton className="ml-auto h-3.5 w-14 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-3 w-40 rounded" />
              <Skeleton className="ml-auto h-3.5 w-12 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-14 rounded" />
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="ml-auto h-3.5 w-10 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-18 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="ml-auto h-3.5 w-12 rounded-full" />
            </div>
          </div>
        </div>

        {/* Card 3: Compact Object Card Skeleton */}
        <div className="bg-card/60 dark:bg-card/40 border-border overflow-hidden rounded-lg border shadow-2xs">
          <div className="border-border bg-muted/40 dark:border-border dark:bg-muted/20 flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-6 rounded" />
              <Skeleton className="h-3.5 w-8 rounded" />
              <Skeleton className="h-3.5 w-40 rounded" />
              <Skeleton className="h-4 w-14 rounded-full" />
            </div>
            <div className="flex items-center gap-1.5">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="size-5 rounded" />
              <Skeleton className="size-5 rounded" />
            </div>
          </div>
          <div className="space-y-2.5 p-3 font-mono text-xs">
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-12 rounded" />
              <Skeleton className="h-3 w-40 rounded" />
              <Skeleton className="ml-auto h-3.5 w-14 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-16 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
              <Skeleton className="ml-auto h-3.5 w-12 rounded-full" />
            </div>
            <div className="flex items-center gap-2 pl-2">
              <Skeleton className="h-3 w-14 rounded" />
              <Skeleton className="h-3 w-18 rounded" />
              <Skeleton className="ml-auto h-3.5 w-10 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const DocumentView = React.memo(function DocumentView({
  rows,
  table,
  page,
  pageSize,
  isReadOnly,
  isTabActive = true,
  isLoading = false,
  onEditRow,
  onDeleteRow,
  onSaveCell,
  onCloneRow,
  t,
}: DocumentViewProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [subView, setSubView] = useState<DocumentSubViewMode>("tree");
  const [expandedPathsByDoc, setExpandedPathsByDoc] = useState<
    Record<number, Set<string>>
  >({});
  const [copiedDocIdx, setCopiedDocIdx] = useState<number | null>(null);

  // Virtualizer for smooth 60fps rendering of visible document cards
  // eslint-disable-next-line react-hooks/incompatible-library, react/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => (subView === "json" ? 220 : 160),
    overscan: 4,
    initialRect: { width: 1000, height: 800 },
  });

  // Active inline cell editing: { docIdx, path }
  const [editingCell, setEditingCell] = useState<{
    docIdx: number;
    path: string;
    type: BsonType;
  } | null>(null);

  // Raw JSON edit mode per document card
  const [rawJsonDocs, setRawJsonDocs] = useState<Record<number, string>>({});
  const [jsonErrors, setJsonErrors] = useState<Record<number, string | null>>(
    {},
  );

  const pkCol = table.columns.find((c) => c.is_primary_key);
  const pkKey = pkCol?.name ?? "_id";

  // Initialize or get expanded paths for a document
  const getDocExpandedPaths = useCallback(
    (docIdx: number, row: Record<string, any>): Set<string> => {
      if (expandedPathsByDoc[docIdx]) {
        return expandedPathsByDoc[docIdx];
      }
      // By default, expand first-level objects and arrays
      const initial = new Set<string>();
      Object.entries(row).forEach(([k, v]) => {
        if (v !== null && typeof v === "object") {
          initial.add(k);
        }
      });
      return initial;
    },
    [expandedPathsByDoc],
  );

  const togglePathExpand = (docIdx: number, path: string) => {
    setExpandedPathsByDoc((prev) => {
      const current = prev[docIdx]
        ? new Set(prev[docIdx])
        : getDocExpandedPaths(docIdx, rows[docIdx] ?? {});
      if (current.has(path)) {
        current.delete(path);
      } else {
        current.add(path);
      }
      return { ...prev, [docIdx]: current };
    });
  };

  const handleExpandAll = () => {
    const next: Record<number, Set<string>> = {};
    rows.forEach((row, idx) => {
      const allPaths = new Set<string>();
      const collect = (val: any, prefix: string) => {
        if (val !== null && typeof val === "object") {
          allPaths.add(prefix);
          if (Array.isArray(val)) {
            val.forEach((item, i) => collect(item, `${prefix}.${i}`));
          } else {
            Object.entries(val).forEach(([k, v]) =>
              collect(v, prefix ? `${prefix}.${k}` : k),
            );
          }
        }
      };
      Object.entries(row).forEach(([k, v]) => collect(v, k));
      next[idx] = allPaths;
    });
    setExpandedPathsByDoc(next);
  };

  const handleCollapseAll = () => {
    const next: Record<number, Set<string>> = {};
    rows.forEach((_, idx) => {
      next[idx] = new Set<string>();
    });
    setExpandedPathsByDoc(next);
  };

  const handleCopyDocJson = (row: Record<string, any>, idx: number) => {
    const cleanDoc = Object.fromEntries(
      Object.entries(row).filter(([k]) => !k.startsWith("_pb_")),
    );
    navigator.clipboard.writeText(JSON.stringify(cleanDoc, null, 2));
    setCopiedDocIdx(idx);
    setTimeout(() => setCopiedDocIdx(null), COPY_FEEDBACK_MS);
  };

  const handleStartCellEdit = (
    docIdx: number,
    path: string,
    _val: unknown,
    type: BsonType,
  ) => {
    if (isReadOnly) return;
    setEditingCell({ docIdx, path, type });
  };

  const handleSaveCellEdit = async (
    _docIdx: number,
    row: Record<string, any>,
    path: string,
    newVal: unknown,
  ) => {
    if (!onSaveCell) return;
    await onSaveCell(row, path, newVal);
    setEditingCell(null);
  };

  // JSON View Raw Edit Handler
  const handleSaveJsonDoc = async (
    row: Record<string, any>,
    docIdx: number,
  ) => {
    const raw = rawJsonDocs[docIdx];
    if (!raw || !onSaveCell) return;

    try {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error("Document must be a JSON object");
      }

      // Update changed root fields
      for (const [key, val] of Object.entries(parsed)) {
        if (key === pkKey) continue;
        if (JSON.stringify(row[key]) !== JSON.stringify(val)) {
          await onSaveCell(row, key, val);
        }
      }

      setJsonErrors((prev) => ({ ...prev, [docIdx]: null }));
    } catch (err) {
      setJsonErrors((prev) => ({
        ...prev,
        [docIdx]: err instanceof Error ? err.message : "Invalid JSON syntax",
      }));
    }
  };

  // Flattened Table View calculations
  const flattenedRows = useMemo(() => {
    if (subView !== "table") return [];
    return rows.map((r) => flattenDoc(r));
  }, [rows, subView]);

  const flattenedColumns = useMemo(() => {
    if (subView !== "table") return [];
    const colSet = new Set<string>();
    flattenedRows.forEach((r) => {
      Object.keys(r).forEach((k) => colSet.add(k));
    });
    // Ensure primary key is first
    const list = Array.from(colSet).filter((k) => k !== pkKey);
    return [pkKey, ...list];
  }, [flattenedRows, pkKey, subView]);

  if (isTabActive === false) {
    return <div className="flex-1" aria-hidden="true" />;
  }

  if (isLoading) {
    return <DocumentViewSkeleton />;
  }

  return (
    <div className="bg-background dark:bg-background flex flex-1 flex-col overflow-hidden">
      {/* Sub-Header Toolbar: Tri-Mode View Switcher + Expansion Controls */}
      <div className="border-border bg-card/60 dark:border-border dark:bg-card/40 flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="border-border/80 bg-background/80 flex items-center gap-1 rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setSubView("tree")}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
              subView === "tree"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Recursive Tree View"
          >
            <ListTree className="size-3.5" />
            <span>Tree</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView("json")}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
              subView === "json"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Raw JSON Document Editor"
          >
            <Code2 className="size-3.5" />
            <span>JSON</span>
          </button>

          <button
            type="button"
            onClick={() => setSubView("table")}
            className={cn(
              "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-1 font-mono text-xs font-medium transition-colors",
              subView === "table"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
            title="Flattened Dot-Notation Table View"
          >
            <TableIcon className="size-3.5" />
            <span>Table</span>
          </button>
        </div>

        {subView === "tree" && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleExpandAll}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex cursor-pointer items-center gap-1 rounded px-2 py-1 font-mono text-[11px]"
              title="Expand all nested branches"
            >
              <Maximize2 className="size-3.5" />
              <span>Expand All</span>
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="text-muted-foreground hover:text-foreground hover:bg-muted flex cursor-pointer items-center gap-1 rounded px-2 py-1 font-mono text-[11px]"
              title="Collapse all nested branches"
            >
              <Minimize2 className="size-3.5" />
              <span>Collapse All</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div ref={scrollContainerRef} className="flex-1 overflow-auto p-3">
        {rows.length === 0 && (
          <div className="text-muted-foreground flex h-36 items-center justify-center font-mono text-xs">
            0 documents
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBVIEW 1: RECURSIVE TREE VIEW (Compass Core View - Virtualized)           */}
        {/* ========================================================================= */}
        {subView === "tree" && rows.length > 0 && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const globalIdx = virtualItem.index;
              const row = rows[globalIdx];
              if (!row) return null;
              const rowNumber = page * pageSize + globalIdx + 1;
              const pkVal = row[pkKey];
              const pkType = detectBsonType(pkVal, pkKey);
              const formattedPk = formatBsonValue(pkVal, pkType, pkKey);
              const expandedPaths = getDocExpandedPaths(globalIdx, row);

              const rootKeys = Object.keys(row).filter(
                (k) => !k.startsWith("_pb_"),
              );

              return (
                <div
                  key={`${table.name}-${String(pkVal ?? globalIdx)}`}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: "12px",
                  }}
                >
                  <div className="group bg-card/60 dark:bg-card/40 border-border hover:border-border/80 overflow-hidden rounded-lg border shadow-2xs transition-colors">
                    {/* Document Card Header */}
                    <div className="border-border bg-muted/40 dark:border-border dark:bg-muted/20 flex items-center justify-between border-b px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-muted-foreground w-6 shrink-0 text-right font-mono text-[11px] select-none">
                          #{rowNumber}
                        </span>
                        <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
                          {pkKey}:
                        </span>
                        <span className="text-warning dark:text-warning truncate font-mono text-[11px] font-semibold">
                          {formattedPk.display}
                        </span>
                        <BsonBadge type={pkType} />
                      </div>

                      {/* Actions Toolbar */}
                      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => handleCopyDocJson(row, globalIdx)}
                          title={t(
                            "datagrid.documentView.copyJson",
                            "Copy JSON",
                          )}
                          className="text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer rounded p-1"
                        >
                          {copiedDocIdx === globalIdx ? (
                            <Check className="text-success size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>

                        {onCloneRow && !isReadOnly && (
                          <button
                            type="button"
                            onClick={() => onCloneRow(row)}
                            title="Clone Document (Generate New _id)"
                            className="text-muted-foreground hover:text-primary hover:bg-muted cursor-pointer rounded p-1"
                          >
                            <CopyPlus className="size-3.5" />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onEditRow(row)}
                          disabled={isReadOnly}
                          title={t("datagrid.editRecordTooltip", "Edit Record")}
                          className={cn(
                            "text-muted-foreground hover:text-success hover:bg-muted cursor-pointer rounded p-1",
                            isReadOnly && "pointer-events-none opacity-40",
                          )}
                        >
                          <Edit2 className="size-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteRow(row)}
                          disabled={isReadOnly}
                          title={t(
                            "datagrid.deleteRecordTooltip",
                            "Delete Record",
                          )}
                          className={cn(
                            "text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded p-1",
                            isReadOnly && "pointer-events-none opacity-40",
                          )}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Recursive Document Tree Fields */}
                    <div className="py-1">
                      {rootKeys.map((key) => {
                        return (
                          <DocumentTreeNode
                            key={key}
                            keyName={key}
                            value={row[key]}
                            path={key}
                            depth={0}
                            isReadOnly={isReadOnly}
                            expandedPaths={expandedPaths}
                            onToggleExpand={(p) =>
                              togglePathExpand(globalIdx, p)
                            }
                            activeEditingPath={
                              editingCell?.docIdx === globalIdx
                                ? editingCell.path
                                : null
                            }
                            onStartEdit={(p, val, typ) =>
                              handleStartCellEdit(globalIdx, p, val, typ)
                            }
                            onSaveEdit={(p, val) =>
                              handleSaveCellEdit(globalIdx, row, p, val)
                            }
                            onCancelEdit={() => setEditingCell(null)}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBVIEW 2: RAW JSON VIEW & EDITOR (Virtualized)                            */}
        {/* ========================================================================= */}
        {subView === "json" && rows.length > 0 && (
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const globalIdx = virtualItem.index;
              const row = rows[globalIdx];
              if (!row) return null;
              const rowNumber = page * pageSize + globalIdx + 1;
              const pkVal = row[pkKey];
              const cleanDoc = Object.fromEntries(
                Object.entries(row).filter(([k]) => !k.startsWith("_pb_")),
              );
              const initialJson = JSON.stringify(cleanDoc, null, 2);
              const currentJson = rawJsonDocs[globalIdx] ?? initialJson;
              const isModified = currentJson !== initialJson;
              const error = jsonErrors[globalIdx];

              return (
                <div
                  key={`${table.name}-json-${String(pkVal ?? globalIdx)}`}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                    paddingBottom: "12px",
                  }}
                >
                  <div className="group bg-card/60 dark:bg-card/40 border-border overflow-hidden rounded-lg border shadow-2xs">
                    {/* JSON Card Header */}
                    <div className="border-border bg-muted/40 dark:border-border dark:bg-muted/20 flex items-center justify-between border-b px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-mono text-[11px] select-none">
                          #{rowNumber}
                        </span>
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {pkKey}:
                        </span>
                        <span className="text-warning font-mono text-[11px] font-semibold">
                          {String(pkVal)}
                        </span>
                        {isModified && (
                          <span className="border-warning/40 bg-warning/10 text-warning rounded border px-1.5 py-px font-mono text-[10px]">
                            modified
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        {isModified && (
                          <button
                            type="button"
                            onClick={() => handleSaveJsonDoc(row, globalIdx)}
                            className="bg-primary text-primary-foreground hover:bg-primary/90 flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 font-mono text-xs font-semibold"
                          >
                            <Save className="size-3" />
                            <span>Save</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopyDocJson(row, globalIdx)}
                          title="Copy JSON"
                          className="text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer rounded p-1"
                        >
                          {copiedDocIdx === globalIdx ? (
                            <Check className="text-success size-3.5" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* CodeMirror JSON Editor */}
                    <div className="border-border/40 border-t font-mono text-xs">
                      <CodeMirror
                        value={currentJson}
                        height="auto"
                        extensions={[json()]}
                        theme="dark"
                        editable={!isReadOnly}
                        onChange={(val) => {
                          setRawJsonDocs((prev) => ({
                            ...prev,
                            [globalIdx]: val,
                          }));
                          if (jsonErrors[globalIdx]) {
                            setJsonErrors((prev) => ({
                              ...prev,
                              [globalIdx]: null,
                            }));
                          }
                        }}
                        className="overflow-hidden"
                      />
                    </div>

                    {error && (
                      <div className="border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-1.5 border-t px-3 py-1.5 font-mono text-xs">
                        <AlertCircle className="size-3.5 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SUBVIEW 3: FLATTENED TABLE VIEW                                           */}
        {/* ========================================================================= */}
        {subView === "table" && (
          <div className="border-border bg-card/60 overflow-x-auto rounded-lg border shadow-2xs">
            <table className="w-full caption-bottom border-collapse text-left text-xs">
              <thead className="border-border bg-muted/50 text-muted-foreground border-b font-mono text-[11px]">
                <tr>
                  <th className="w-10 px-3 py-2 text-center select-none">#</th>
                  {flattenedColumns.map((col) => (
                    <th key={col} className="px-3 py-2 font-semibold">
                      <div className="flex items-center gap-1">
                        <span>{col}</span>
                        {col === pkKey && (
                          <span className="text-warning text-[10px] font-bold">
                            (PK)
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="w-20 px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-border/40 divide-y font-mono text-[11px]">
                {flattenedRows.map((fRow, idx) => {
                  const origRow = rows[idx];
                  const rowNumber = page * pageSize + idx + 1;

                  return (
                    <tr
                      key={idx}
                      className="group hover:bg-muted/30 transition-colors"
                    >
                      <td className="text-muted-foreground px-3 py-1.5 text-center select-none">
                        {rowNumber}
                      </td>
                      {flattenedColumns.map((col) => {
                        const cellVal = fRow[col];
                        const cellType = detectBsonType(cellVal, col);
                        const fmt = formatBsonValue(cellVal, cellType, col);
                        const isEditingThis =
                          editingCell?.docIdx === idx &&
                          editingCell?.path === col;

                        return (
                          <td
                            key={col}
                            className="max-w-64 truncate px-3 py-1.5"
                            onDoubleClick={() => {
                              if (
                                !isReadOnly &&
                                col !== pkKey &&
                                cellType !== "Object" &&
                                cellType !== "Array"
                              ) {
                                handleStartCellEdit(
                                  idx,
                                  col,
                                  cellVal,
                                  cellType,
                                );
                              }
                            }}
                          >
                            {isEditingThis ? (
                              <BsonCellEditor
                                path={col}
                                initialValue={cellVal}
                                type={cellType}
                                onSave={(p, val) =>
                                  handleSaveCellEdit(idx, origRow, p, val)
                                }
                                onCancel={() => setEditingCell(null)}
                              />
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={cn(
                                    col === pkKey &&
                                      "text-warning font-semibold",
                                    cellType === "String" &&
                                      "text-emerald-600 dark:text-emerald-400",
                                    (cellType === "Int32" ||
                                      cellType === "Int64") &&
                                      "text-orange-600 dark:text-orange-400",
                                    (cellType === "Double" ||
                                      cellType === "Decimal128") &&
                                      "text-orange-700 dark:text-orange-300",
                                    cellType === "Date" &&
                                      "text-blue-600 dark:text-blue-400",
                                    cellType === "Boolean" &&
                                      "font-semibold text-purple-600 dark:text-purple-400",
                                    (cellType === "Null" ||
                                      cellType === "Undefined") &&
                                      "text-zinc-500 italic",
                                  )}
                                >
                                  {fmt.display}
                                </span>
                                <BsonBadge
                                  type={cellType}
                                  className="origin-left scale-85"
                                />
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => handleCopyDocJson(origRow, idx)}
                            title="Copy JSON"
                            className="text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer rounded p-1"
                          >
                            <Copy className="size-3" />
                          </button>
                          {onCloneRow && !isReadOnly && (
                            <button
                              type="button"
                              onClick={() => onCloneRow(origRow)}
                              title="Clone"
                              className="text-muted-foreground hover:text-primary hover:bg-muted cursor-pointer rounded p-1"
                            >
                              <CopyPlus className="size-3" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteRow(origRow)}
                            disabled={isReadOnly}
                            title="Delete"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer rounded p-1"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
});

DocumentView.displayName = "DocumentView";
