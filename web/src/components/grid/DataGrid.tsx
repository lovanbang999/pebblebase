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
  type ColumnSizingState,
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
  Search,
  Inbox,
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
import { ReferenceCell } from "./ReferenceCell";
import { invalidateReferenceCache } from "@/lib/referenceCache";

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
  onDuplicateRow?: (row: Record<string, any>) => void;
  onCommitRow?: (
    original: Record<string, any> | null,
    values: Record<string, any>,
  ) => Promise<void>;
  onCommitDeleteRow?: (row: Record<string, any>) => Promise<void>;
  onNavigateRelation?: (
    targetTable: string,
    targetColumn: string,
    value: any,
  ) => void;
  workspaceId?: string;
  onNavigateReference?: (
    connectionId: string,
    table: string,
    column: string,
    value: unknown,
    rowIdentity?: string,
  ) => void;
  isReadOnly?: boolean;
  onOpenQueryConsole?: (query?: string, title?: string) => void;
  onFindEverywhere?: (value?: string) => void;
  onFocusedCellValueChange?: (value?: string) => void;
  onFocusedCellLocationChange?: (
    cell: { column: string; rowIdentity?: string } | undefined,
  ) => void;
  onScrollPositionChange?: (left: number, top: number) => void;
  initialScrollPosition?: { left: number; top: number };
  connId?: string;
  workspaceTabId?: string;
  initialSelectedCell?: { column: string; rowIdentity?: string };
  dbType?: DatabaseType;
  connectionName?: string;
  queryTimeMs?: number;
}

import { DocumentView } from "./DocumentView";
import {
  GridContextMenu,
  type ContextMenuState,
  type ExtraGridContextMenuItem,
} from "./GridContextMenu";
import { GridRowItem } from "./GridRowItem";
import { TableActionToolbar } from "./TableActionToolbar";
import { TableSubviewTabs, type TableSubview } from "./TableSubviewTabs";
import { TableFilterBar } from "./TableFilterBar";
import { TableExecutionFooter } from "./TableExecutionFooter";
import { ValueEditorPanel } from "./ValueEditorPanel";
import { emitOperationEvent } from "@/lib/operationEvents";
import {
  createRowDraftId,
  stageCellDraft,
  type RowDraft,
} from "@/lib/rowDrafts";

function searchCellValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value ?? "");
}

function isReferenceId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ) ||
      /^[0-9a-f]{24}$/i.test(value))
  );
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
  onDuplicateRow,
  onCommitRow,
  onCommitDeleteRow,
  onNavigateRelation,
  workspaceId,
  onNavigateReference,
  isReadOnly = false,
  onOpenQueryConsole,
  onFindEverywhere,
  onFocusedCellValueChange,
  onFocusedCellLocationChange,
  onScrollPositionChange,
  initialScrollPosition,
  connId,
  workspaceTabId,
  initialSelectedCell,
  dbType,
  connectionName,
  queryTimeMs,
}) => {
  const { t } = useTranslation();
  const [activeSubView, setActiveSubView] = useState<TableSubview>("data");
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
  const [showStats, setShowStats] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>({});
  const [copiedCol, setCopiedCol] = useState<string | null>(null);
  const scrollPositionTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    const element = tableContainerRef.current;
    if (!element) return;
    element.scrollLeft = initialScrollPosition?.left || 0;
    element.scrollTop = initialScrollPosition?.top || 0;
  }, [table.name, initialScrollPosition?.left, initialScrollPosition?.top]);

  useEffect(
    () => () => {
      if (scrollPositionTimer.current)
        clearTimeout(scrollPositionTimer.current);
    },
    [],
  );

  // Listen for external subview switch requests (e.g. from table context menu)
  useEffect(() => {
    const handleSwitchSubView = (e: Event) => {
      const customEvent = e as CustomEvent<TableSubview | "grid" | "schema">;
      if (customEvent.detail === "grid") setActiveSubView("data");
      else if (customEvent.detail === "schema") setActiveSubView("columns");
      else if (
        ["data", "columns", "indexes", "ddl"].includes(customEvent.detail)
      )
        setActiveSubView(customEvent.detail as TableSubview);
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
  const [rowDrafts, setRowDrafts] = useState<Record<string, RowDraft>>({});
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [isSubmittingDrafts, setIsSubmittingDrafts] = useState(false);
  const [draftSubmitError, setDraftSubmitError] = useState<string | null>(null);
  const [valueEditorOpen, setValueEditorOpen] = useState(false);
  const [valueEditorWidth, setValueEditorWidth] = useState(360);
  const hasPrimaryKey = table.columns.some((column) => column.is_primary_key);
  const draftIdForRow = useCallback(
    (row: Record<string, any>, _index: number) =>
      createRowDraftId(row, table.columns),
    [table.columns],
  );
  const stageCellValue = useCallback(
    (row: Record<string, any>, columnName: string, value: unknown) => {
      if (isReadOnly || !hasPrimaryKey) return;
      const id = row._pb_draft_id || draftIdForRow(row, 0);
      setDraftErrors((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
      setRowDrafts((current) =>
        stageCellDraft(current, row, columnName, value, table.columns),
      );
    },
    [draftIdForRow, hasPrimaryKey, isReadOnly, table.columns],
  );
  const displayedBaseRows = useMemo<Record<string, any>[]>(
    () =>
      rows.map((row) => {
        const id = draftIdForRow(row, 0);
        const draft = rowDrafts[id];
        if (!draft) return row;
        return {
          ...draft.current,
          _pb_draft_id: id,
          _pb_draft_dirty: true,
          _pb_draft_deleted: draft.deleted,
          _pb_draft_inserted: draft.inserted,
          _pb_draft_changed_columns: draft.inserted
            ? Object.keys(draft.current)
            : Object.keys(draft.current).filter(
                (column) =>
                  JSON.stringify(draft.current[column]) !==
                  JSON.stringify(draft.original?.[column]),
              ),
        };
      }),
    [rows, rowDrafts, draftIdForRow],
  );
  const insertedDraftRows = useMemo<Record<string, any>[]>(
    () =>
      Object.values(rowDrafts)
        .filter((draft) => draft.inserted)
        .map((draft) => ({
          ...draft.current,
          _pb_draft_id: draft.id,
          _pb_draft_dirty: true,
          _pb_draft_deleted: draft.deleted,
          _pb_draft_inserted: true,
          _pb_draft_changed_columns: Object.keys(draft.current),
        })),
    [rowDrafts],
  );
  const workspaceRows = useMemo(
    () => [...displayedBaseRows, ...insertedDraftRows],
    [displayedBaseRows, insertedDraftRows],
  );
  const pendingDrafts = useMemo(() => Object.values(rowDrafts), [rowDrafts]);
  const stageDeleteRow = useCallback(
    (row: Record<string, any>) => {
      if (isReadOnly || !hasPrimaryKey) return;
      const id = row._pb_draft_id || draftIdForRow(row, 0);
      setDraftErrors((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
      const cleanRow = Object.fromEntries(
        Object.entries(row).filter(([key]) => !key.startsWith("_pb_")),
      );
      setRowDrafts((current) => {
        const existing = current[id];
        if (existing?.inserted) {
          const next = { ...current };
          delete next[id];
          return next;
        }
        return {
          ...current,
          [id]: {
            id,
            original: existing?.original ?? cleanRow,
            current: existing?.current ?? cleanRow,
            deleted: true,
            inserted: false,
          },
        };
      });
    },
    [draftIdForRow, hasPrimaryKey, isReadOnly],
  );
  const stageWholeRow = useCallback(
    (original: Record<string, any> | null, values: Record<string, any>) => {
      if (isReadOnly || (original !== null && !hasPrimaryKey)) return;
      const isInsert = !original || Boolean(original._isDuplicate);
      const cleanOriginal = original
        ? Object.fromEntries(
            Object.entries(original).filter(
              ([key]) => !key.startsWith("_pb_") && key !== "_isDuplicate",
            ),
          )
        : null;
      const id =
        original?._pb_draft_id ||
        (isInsert
          ? `insert:${crypto.randomUUID()}`
          : draftIdForRow(cleanOriginal!, 0));
      setDraftErrors((current) => {
        if (!current[id]) return current;
        const next = { ...current };
        delete next[id];
        return next;
      });
      setRowDrafts((current) => {
        const previous = current[id];
        return {
          ...current,
          [id]: {
            id,
            original: isInsert ? null : (previous?.original ?? cleanOriginal),
            current: {
              ...(previous?.current ?? cleanOriginal ?? {}),
              ...values,
            },
            deleted: false,
            inserted: isInsert || Boolean(previous?.inserted),
          },
        };
      });
    },
    [draftIdForRow, hasPrimaryKey, isReadOnly],
  );
  useEffect(() => {
    const onStageRow = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          tabId: string;
          connectionId: string;
          tableName: string;
          original: Record<string, any> | null;
          values: Record<string, any>;
        }>
      ).detail;
      if (
        detail?.tabId !== workspaceTabId ||
        detail.connectionId !== connId ||
        detail.tableName !== table.name
      )
        return;
      stageWholeRow(detail.original, detail.values);
    };
    const onStageDelete = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          tabId: string;
          connectionId: string;
          tableName: string;
          row: Record<string, any>;
        }>
      ).detail;
      if (
        detail?.tabId !== workspaceTabId ||
        detail.connectionId !== connId ||
        detail.tableName !== table.name
      )
        return;
      stageDeleteRow(detail.row);
    };
    window.addEventListener("pb:stage-row-draft", onStageRow);
    window.addEventListener("pb:stage-delete-draft", onStageDelete);
    return () => {
      window.removeEventListener("pb:stage-row-draft", onStageRow);
      window.removeEventListener("pb:stage-delete-draft", onStageDelete);
    };
  }, [workspaceTabId, connId, table.name, stageWholeRow, stageDeleteRow]);
  useEffect(() => {
    if (workspaceTabId)
      window.dispatchEvent(
        new CustomEvent("pb:table-draft-dirty", {
          detail: { tabId: workspaceTabId, isDirty: pendingDrafts.length > 0 },
        }),
      );
  }, [workspaceTabId, pendingDrafts.length]);
  useEffect(() => {
    if (!pendingDrafts.length) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [pendingDrafts.length]);
  const submitDrafts = useCallback(async () => {
    if (isReadOnly || isSubmittingDrafts) return;
    if (!onCommitRow || !onCommitDeleteRow) {
      setDraftSubmitError(
        t(
          "datagrid.submitUnavailable",
          "Saving staged changes is unavailable.",
        ),
      );
      return;
    }
    setIsSubmittingDrafts(true);
    setDraftSubmitError(null);
    setDraftErrors({});
    const failures: Record<string, string> = {};
    try {
      for (const draft of pendingDrafts) {
        try {
          if (draft.deleted) {
            await onCommitDeleteRow(draft.original ?? draft.current);
          } else {
            const values = draft.inserted
              ? draft.current
              : Object.fromEntries(
                  Object.entries(draft.current).filter(
                    ([key, value]) =>
                      !key.startsWith("_pb_") &&
                      JSON.stringify(value) !==
                        JSON.stringify(draft.original?.[key]),
                  ),
                );
            if (draft.inserted || Object.keys(values).length)
              await onCommitRow(draft.original, values);
          }
          setRowDrafts((current) => {
            const next = { ...current };
            delete next[draft.id];
            return next;
          });
        } catch (error) {
          failures[draft.id] =
            error instanceof Error ? error.message : String(error);
        }
      }
      setDraftErrors(failures);
      if (Object.keys(failures).length)
        setDraftSubmitError(
          t("datagrid.partialSubmitError", {
            count: Object.keys(failures).length,
            error: Object.values(failures)[0],
            defaultValue:
              "{{count}} change(s) failed. Unresolved drafts remain. {{error}}",
          }),
        );
    } finally {
      setIsSubmittingDrafts(false);
    }
  }, [
    isReadOnly,
    isSubmittingDrafts,
    onCommitRow,
    onCommitDeleteRow,
    pendingDrafts,
    t,
  ]);
  useEffect(() => {
    const handleSubmitShortcut = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const targetWorkspace = target?.closest("[data-table-workspace]");
      if (
        !(event.ctrlKey || event.metaKey) ||
        event.key !== "Enter" ||
        !target ||
        targetWorkspace?.getAttribute("data-table-workspace") !==
          workspaceTabId ||
        target.closest("input, textarea, [contenteditable='true']") ||
        !pendingDrafts.length
      )
        return;
      event.preventDefault();
      void submitDrafts();
    };
    window.addEventListener("keydown", handleSubmitShortcut);
    return () => window.removeEventListener("keydown", handleSubmitShortcut);
  }, [workspaceTabId, pendingDrafts.length, submitDrafts]);
  const revertDrafts = useCallback(() => {
    if (!pendingDrafts.length) return;
    if (
      window.confirm(
        t(
          "datagrid.confirmRevert",
          "Discard all unsaved table changes? This does not roll back database changes.",
        ),
      )
    ) {
      setRowDrafts({});
      setDraftErrors({});
      setDraftSubmitError(null);
    }
  }, [pendingDrafts.length, t]);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const handleImportCommand = (event: Event) => {
      const command = event as CustomEvent<{ tabId: string }>;
      if (isReadOnly || command.detail?.tabId !== workspaceTabId) return;
      if (
        pendingDrafts.length &&
        !window.confirm(
          t(
            "datagrid.confirmImportDrafts",
            "Importing may conflict with staged changes. Discard the staged changes and continue?",
          ),
        )
      )
        return;
      if (pendingDrafts.length) {
        setRowDrafts({});
        setDraftErrors({});
        setDraftSubmitError(null);
      }
      setImportModalMode("import");
      setIsImportModalOpen(true);
    };
    window.addEventListener("pb:import-table", handleImportCommand);
    return () =>
      window.removeEventListener("pb:import-table", handleImportCommand);
  }, [workspaceTabId, pendingDrafts.length, isReadOnly, t]);

  const handleRefresh = async () => {
    if (isRefreshing || isLoading) return;
    if (
      pendingDrafts.length &&
      !window.confirm(
        t(
          "datagrid.confirmRefreshDrafts",
          "Refreshing will discard staged changes for this table. Continue?",
        ),
      )
    )
      return;
    if (pendingDrafts.length) {
      setRowDrafts({});
      setDraftErrors({});
      setDraftSubmitError(null);
    }
    setIsRefreshing(true);
    try {
      await onRefresh();
      invalidateReferenceCache(connId);
      emitOperationEvent({
        kind: "refresh",
        severity: "success",
        title: t("operations.refreshSucceeded", "Table refreshed"),
        message: table.name,
        connectionId: connId,
        connectionName,
        tabId: workspaceTabId,
      });
    } catch {
      emitOperationEvent({
        kind: "refresh",
        severity: "error",
        title: t("operations.refreshFailed", "Refresh failed"),
        message: t(
          "operations.genericFailure",
          "The operation could not be completed.",
        ),
        connectionId: connId,
        connectionName,
        tabId: workspaceTabId,
      });
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
      if (isReadOnly || !hasPrimaryKey) return;
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
    [hasPrimaryKey, isReadOnly, table.columns],
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
      rowIndex: number,
    ) => {
      setContextMenu({
        mouseX: e.clientX,
        mouseY: e.clientY,
        row,
        colName,
        cellValue,
        rowIndex,
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
      emitOperationEvent({
        kind: "export",
        severity: "success",
        title: t("operations.exportSucceeded", "Export completed"),
        message: `${table.name} · ${format.toUpperCase()}`,
        connectionId: connId,
        connectionName,
        tabId: workspaceTabId,
      });
    } catch (err: unknown) {
      console.error("Export failed:", err);
      emitOperationEvent({
        kind: "export",
        severity: "error",
        title: t("operations.exportFailed", "Export failed"),
        message: t(
          "operations.genericFailure",
          "The operation could not be completed.",
        ),
        connectionId: connId,
        connectionName,
        tabId: workspaceTabId,
      });
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

  useEffect(() => {
    const handleFocusSearchCommand = (event: Event) => {
      const command = event as CustomEvent<{ tabId: string }>;
      if (command.detail?.tabId !== workspaceTabId) return;
      const columnName =
        focusedCell?.colName && focusedCell.colName !== "_row_index"
          ? focusedCell.colName
          : table.columns[0]?.name;
      if (columnName) handleOpenColumnSearch(columnName);
    };
    window.addEventListener("pb:focus-grid-search", handleFocusSearchCommand);
    return () =>
      window.removeEventListener(
        "pb:focus-grid-search",
        handleFocusSearchCommand,
      );
  }, [
    workspaceTabId,
    focusedCell?.colName,
    table.columns,
    handleOpenColumnSearch,
  ]);

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
    workspaceRows.forEach((r) => {
      Object.keys(r).forEach((k) => {
        if (!schemaColNames.has(k) && !k.startsWith("_pb_")) {
          extras.add(k);
        }
      });
    });
    return Array.from(extras).sort();
  }, [table.columns, workspaceRows]);

  // Client-side quick search filtering across all properties
  const displayedRows = useMemo(() => {
    if (!debouncedSearch.trim()) return workspaceRows;
    const term = debouncedSearch.toLowerCase();
    return workspaceRows.filter((r) =>
      Object.values(r).some(
        (v) =>
          v !== null &&
          v !== undefined &&
          String(v).toLowerCase().includes(term),
      ),
    );
  }, [workspaceRows, debouncedSearch]);

  useEffect(() => {
    const row = focusedCell ? displayedRows[focusedCell.rowIndex] : undefined;
    onFocusedCellValueChange?.(
      row && focusedCell
        ? searchCellValue(row[focusedCell.colName])
        : undefined,
    );
  }, [focusedCell, displayedRows, onFocusedCellValueChange]);
  useEffect(() => {
    const row = focusedCell ? displayedRows[focusedCell.rowIndex] : undefined;
    const keys = table.columns.filter((column) => column.is_primary_key);
    const rowIdentity =
      row && keys.length
        ? JSON.stringify(keys.map((column) => row[column.name]))
        : undefined;
    onFocusedCellLocationChange?.(
      focusedCell ? { column: focusedCell.colName, rowIdentity } : undefined,
    );
  }, [focusedCell, displayedRows, table.columns, onFocusedCellLocationChange]);
  useEffect(() => {
    if (!initialSelectedCell) return;
    const keys = table.columns.filter((column) => column.is_primary_key);
    const rowIndex = displayedRows.findIndex(
      (row) =>
        keys.length &&
        JSON.stringify(keys.map((column) => row[column.name])) ===
          initialSelectedCell.rowIdentity,
    );
    if (
      rowIndex >= 0 &&
      table.columns.some((column) => column.name === initialSelectedCell.column)
    )
      setFocusedCell({ rowIndex, colName: initialSelectedCell.column });
  }, [initialSelectedCell, displayedRows, table.columns]);
  useEffect(() => {
    const restore = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          tabId: string;
          cell?: { column: string; rowIdentity?: string };
        }>
      ).detail;
      if (!detail || detail.tabId !== workspaceTabId || !detail.cell) return;
      const keys = table.columns.filter((column) => column.is_primary_key);
      const rowIndex = displayedRows.findIndex(
        (row) =>
          keys.length &&
          JSON.stringify(keys.map((column) => row[column.name])) ===
            detail.cell?.rowIdentity,
      );
      const colName = table.columns.some(
        (column) => column.name === detail.cell?.column,
      )
        ? detail.cell.column
        : "_row_index";
      if (rowIndex >= 0) setFocusedCell({ rowIndex, colName });
    };
    window.addEventListener("pb:restore-cell", restore);
    return () => window.removeEventListener("pb:restore-cell", restore);
  }, [displayedRows, table.columns, workspaceTabId]);

  // TanStack Table columns
  const columns = useMemo<ColumnDef<Record<string, any>>[]>(() => {
    const cols: ColumnDef<Record<string, any>>[] = [
      {
        id: "_row_index",
        header: "#",
        size: 50,
        cell: (info) => (
          <span className="text-muted-foreground font-mono text-[11px] select-none">
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
                  <Search className="text-success pointer-events-none absolute left-2 h-3 w-3 shrink-0" />
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
                    className="border-primary/80 focus:ring-primary dark:border-primary/80 bg-background text-foreground placeholder:text-muted-foreground dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground h-6 w-full rounded border py-0.5 pr-6 pl-7 font-mono text-xs shadow-sm focus:ring-1 focus:outline-none"
                  />
                  <button
                    type="button"
                    title={t("grid.column.search.clear")}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearColumnSearch(col.name);
                    }}
                    className="text-muted-foreground hover:bg-muted hover:text-destructive dark:hover:bg-muted dark:hover:text-destructive absolute right-1 cursor-pointer rounded p-0.5 transition-colors"
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
                    <Key className="text-warning h-3 w-3 shrink-0" />
                  </span>
                )}
                {col.is_foreign_key && (
                  <span title={t("datagrid.foreignKey")}>
                    <Layers className="h-3 w-3 shrink-0 text-sky-400" />
                  </span>
                )}
                <span className="text-foreground dark:text-foreground truncate font-mono text-xs font-semibold">
                  {col.name}
                </span>
                <Badge
                  variant="outline"
                  className="border-border/60 bg-muted/60 text-muted-foreground dark:bg-muted/80 dark:text-muted-foreground h-4 px-1 py-0 font-mono text-[10px] font-normal dark:border-transparent"
                >
                  {col.type}
                </Badge>
                {hasActiveFilter && (
                  <Badge
                    variant="outline"
                    className="border-primary/30 bg-success/10 text-success dark:text-success h-3.5 px-1 py-0 font-mono text-[9px] font-medium"
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
                      ? "bg-success/10 text-success dark:text-success opacity-100"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground opacity-0 group-hover:opacity-100",
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
                <div className="text-muted-foreground group-hover:text-foreground dark:group-hover:text-foreground">
                  {isSorted ? (
                    sortDesc ? (
                      <ArrowDown className="text-success dark:text-success h-3 w-3" />
                    ) : (
                      <ArrowUp className="text-success dark:text-success h-3 w-3" />
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
                        className="text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground cursor-pointer rounded p-1 opacity-0 transition-opacity group-hover:opacity-100 focus:outline-none data-popup-open:opacity-100"
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    }
                  />
                  <DropdownMenuContent
                    align="end"
                    className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground z-50 w-48 border p-1 shadow-xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem
                      className="text-primary hover:bg-primary/10 hover:text-primary dark:text-primary dark:hover:bg-primary/15 dark:hover:text-primary flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                      onClick={() => setAnalyticsColumn(col)}
                    >
                      <BarChart3 className="text-primary dark:text-primary h-3.5 w-3.5 shrink-0" />
                      <span>{t("analytics.openAnalytics")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="text-foreground hover:bg-muted hover:text-foreground dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                      onClick={() => handleOpenColumnSearch(col.name)}
                    >
                      <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span>
                        {t("grid.column.search.placeholder", {
                          column: col.name,
                        })}
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="bg-muted dark:bg-muted my-1" />

                    <DropdownMenuItem
                      className="text-foreground hover:bg-muted hover:text-foreground dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                      onClick={() => onSortChange(col.name, false)}
                    >
                      <ArrowUp className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span>{t("analytics.sortAsc")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="text-foreground hover:bg-muted hover:text-foreground dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                      onClick={() => onSortChange(col.name, true)}
                    >
                      <ArrowDown className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span>{t("analytics.sortDesc")}</span>
                    </DropdownMenuItem>

                    {isSorted && (
                      <DropdownMenuItem
                        className="text-warning hover:bg-warning/10 hover:text-warning dark:text-warning/90 dark:hover:bg-warning/10 dark:hover:text-warning flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                        onClick={() => onSortChange("", false)}
                      >
                        <RotateCcw className="text-warning dark:text-warning h-3.5 w-3.5 shrink-0" />
                        <span>{t("analytics.clearSort")}</span>
                      </DropdownMenuItem>
                    )}

                    <DropdownMenuSeparator className="bg-muted dark:bg-muted my-1" />

                    <DropdownMenuItem
                      className="text-foreground hover:bg-muted hover:text-foreground dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                      onClick={() => {
                        setFilterCol(col.name);
                      }}
                    >
                      <FilterIcon className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                      <span>{t("analytics.filterByColumn")}</span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      className="text-foreground hover:bg-muted hover:text-foreground dark:text-foreground dark:hover:bg-muted dark:hover:text-foreground flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(col.name);
                        setCopiedCol(col.name);
                        setTimeout(() => setCopiedCol(null), COPY_FEEDBACK_MS);
                      }}
                    >
                      {copiedCol === col.name ? (
                        <Check className="text-success h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <Copy className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
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
                    className="h-6 font-mono text-xs"
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
                      if (parsed !== row[col.name])
                        stageCellValue(row, col.name, parsed);
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
                  className="h-6 font-mono text-xs"
                />
              </div>
            );
          }

          const renderContent = () => {
            if (val === undefined) {
              return (
                <span
                  className="text-muted-foreground font-mono text-[11px] italic select-none"
                  title={t("datagrid.fieldNotSet")}
                >
                  —
                </span>
              );
            }
            if (val === null) {
              return (
                <span className="text-muted-foreground font-mono text-[11px] italic">
                  NULL
                </span>
              );
            }

            const relation = col.is_foreign_key
              ? table.relations?.find((item) => item.from_column === col.name)
              : undefined;
            if (
              relation ||
              col.is_foreign_key ||
              (typeof val === "string" &&
                (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  val,
                ) ||
                  /^[0-9a-f]{24}$/i.test(val)))
            ) {
              return (
                <ReferenceCell
                  value={val}
                  connectionId={connId}
                  workspaceId={workspaceId}
                  tableName={table.name}
                  declared={
                    relation
                      ? { table: relation.to_table, column: relation.to_column }
                      : undefined
                  }
                  declaredForeignKey={col.is_foreign_key}
                  onOpen={(match, value) =>
                    onNavigateReference?.(
                      match.connectionId,
                      match.table,
                      match.column,
                      value,
                      match.rowIdentity,
                    )
                  }
                  onFind={onFindEverywhere}
                />
              );
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
                      ? "border-success/30 bg-success/10 text-success dark:border-success/60 dark:bg-success/60 dark:text-success border"
                      : "border-border bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground border dark:border-transparent"
                  }`}
                >
                  {String(boolVal)}
                </Badge>
              );
            }

            if (col.type === "binary") {
              return (
                <div className="text-foreground flex items-center gap-1.5 font-mono text-xs">
                  <span className="border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground inline-flex shrink-0 items-center rounded border px-1 py-0 font-mono text-[9px] font-semibold uppercase select-none">
                    BIN
                  </span>
                  <span className="max-w-xs truncate">{String(val)}</span>
                </div>
              );
            }

            if (col.type === "uuid") {
              return (
                <span className="text-foreground dark:text-foreground block truncate font-mono text-xs select-all">
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
                    setValueEditorOpen(true);
                  }}
                />
              );
            }

            if (typeof val === "object") {
              return (
                <span
                  className="text-warning dark:text-warning/90 block max-w-xs cursor-help truncate font-mono text-xs"
                  title={JSON.stringify(val, null, 2)}
                >
                  {JSON.stringify(val)}
                </span>
              );
            }

            if (col.is_primary_key) {
              return (
                <div className="flex items-center gap-1.5">
                  <Key className="text-warning dark:text-warning/80 h-3 w-3 shrink-0" />
                  <span className="text-foreground font-mono text-xs font-semibold">
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
              <span className="text-foreground dark:text-foreground block truncate font-mono text-xs">
                {cleanStr}
              </span>
            );
          };

          const isCellEditable =
            !isReadOnly && (!col.is_primary_key || row._pb_draft_inserted);

          if (!isCellEditable) {
            return renderContent();
          }

          return (
            <div
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEditingCell(row, col.name, rowIndex);
              }}
              className="group/cell hover:bg-muted/80 dark:hover:bg-muted/50 -mx-1.5 -my-1 flex h-full w-full cursor-pointer items-center justify-between rounded px-1.5 py-1 transition-colors"
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
                  <Search className="text-warning pointer-events-none absolute left-2 h-3 w-3 shrink-0" />
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
                    className="border-warning/80 bg-background text-foreground placeholder:text-muted-foreground focus:ring-warning dark:border-warning/80 dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground h-6 w-full rounded border py-0.5 pr-6 pl-7 font-mono text-xs shadow-sm focus:ring-1 focus:outline-none"
                  />
                  <button
                    type="button"
                    title={t("grid.column.search.clear")}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearColumnSearch(extraColName);
                    }}
                    className="text-muted-foreground hover:bg-muted hover:text-destructive dark:hover:bg-muted dark:hover:text-destructive absolute right-1 cursor-pointer rounded p-0.5 transition-colors"
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
                <span className="text-warning/90 truncate font-mono text-xs font-semibold">
                  {extraColName}
                </span>
                <Badge
                  variant="outline"
                  className="border-warning/40 bg-warning/50 text-warning/90 h-4 px-1 py-0 font-mono text-[9px] font-normal"
                >
                  {t("datagrid.dynamicBadge")}
                </Badge>
                {hasActiveFilter && (
                  <Badge
                    variant="outline"
                    className="border-warning/30 bg-warning/10 text-warning h-3.5 px-1 py-0 font-mono text-[9px] font-medium"
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
                      ? "bg-warning/10 text-warning opacity-100"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground opacity-0 group-hover:opacity-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleOpenColumnSearch(extraColName);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <Search className="h-3 w-3" />
                </button>

                <div className="text-muted-foreground group-hover:text-foreground">
                  {isSorted ? (
                    sortDesc ? (
                      <ArrowDown className="text-success h-3 w-3" />
                    ) : (
                      <ArrowUp className="text-success h-3 w-3" />
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
                className="text-muted-foreground font-mono text-[11px] italic select-none"
                title={t("datagrid.fieldNotSet")}
              >
                —
              </span>
            );
          }
          if (val === null) {
            return (
              <span className="text-muted-foreground font-mono text-[11px] italic">
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
                    ? "border-success/30 bg-success/10 text-success dark:border-success/60 dark:bg-success/60 dark:text-success border"
                    : "border-border bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground border dark:border-transparent"
                }`}
              >
                {String(val)}
              </Badge>
            );
          }
          if (typeof val === "object") {
            return (
              <span
                className="text-warning dark:text-warning/90 block max-w-xs cursor-help truncate font-mono text-xs"
                title={JSON.stringify(val, null, 2)}
              >
                {JSON.stringify(val)}
              </span>
            );
          }
          return (
            <span className="text-foreground dark:text-foreground block truncate font-mono text-xs">
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
    onNavigateReference,
    onFindEverywhere,
    connId,
    workspaceId,
    copiedCol,
    startEditingCell,
    stageCellValue,
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
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    state: {
      columnSizing,
      columnVisibility: Object.fromEntries(
        hiddenColumns.map((name) => [name, false]),
      ),
    },
    onColumnSizingChange: setColumnSizing,
  });

  const numericColumnNames = useMemo(
    () =>
      table.columns
        .filter((column) =>
          /int|float|num|dec|serial|money|double|real|bigint|smallint/i.test(
            column.type,
          ),
        )
        .map((column) => column.name),
    [table.columns],
  );

  const querySummary = useMemo(() => {
    const operatorLabels: Record<FilterOption["operator"], string> = {
      eq: "=",
      neq: "≠",
      gt: ">",
      lt: "<",
      contains: "contains",
    };
    const parts = filters.map(
      ({ column, operator, value }) =>
        `${column} ${operatorLabels[operator]} ${JSON.stringify(value)}`,
    );
    if (quickSearch.trim())
      parts.push(`Loaded page contains ${JSON.stringify(quickSearch.trim())}`);
    if (sortBy) parts.push(`ORDER BY ${sortBy} ${sortDesc ? "DESC" : "ASC"}`);
    return (
      parts.join(" · ") || t("datagrid.noActiveFilters", "No filters or sort")
    );
  }, [filters, quickSearch, sortBy, sortDesc, t]);

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
      if (!editingCell) {
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
        stageCellValue(row, colName, parsedVal);
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
      stageCellValue,
      focusedCell,
      displayedRows.length,
      rowVirtualizer,
      table.columns,
      inlineValue,
    ],
  );

  // Keyboard-First DataGrid Navigation Listener
  useEffect(() => {
    if (activeSubView !== "data" || viewMode !== "table") return;

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
          stageDeleteRow(currentRow);
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

      if (e.key === "F2" && !editingCell) {
        e.preventDefault();
        const colSchema = table.columns.find((c) => c.name === currentColName);
        if (
          hasPrimaryKey &&
          !isReadOnly &&
          !colSchema?.is_primary_key &&
          currentColName !== "_row_index"
        )
          startEditingCell(currentRow, currentColName, currentRowIndex);
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
          setValueEditorOpen(true);
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
    hasPrimaryKey,
    onDuplicateRow,
    onAddRow,
    stageDeleteRow,
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
    <div
      data-table-workspace={workspaceTabId}
      className="bg-background relative flex h-full min-w-0 flex-1 flex-col overflow-hidden transition-colors"
    >
      <TableActionToolbar
        table={table}
        dbType={dbType}
        activeView={activeSubView}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isReadOnly={isReadOnly}
        isLoading={isLoading}
        isRefreshing={isRefreshing}
        onRefresh={handleRefresh}
        onExport={handleExport}
        onOpenImport={() => {
          if (
            pendingDrafts.length &&
            !window.confirm(
              t(
                "datagrid.confirmImportDrafts",
                "Importing may conflict with staged changes. Discard the staged changes and continue?",
              ),
            )
          )
            return;
          if (pendingDrafts.length) {
            setRowDrafts({});
            setDraftErrors({});
            setDraftSubmitError(null);
          }
          setImportModalMode("import");
          setIsImportModalOpen(true);
        }}
        onOpenExportOptions={() => {
          setImportModalMode("export");
          setIsImportModalOpen(true);
        }}
        onAddRow={onAddRow}
        onDeleteSelected={() => {
          if (focusedCell) {
            const row = displayedRows[focusedCell.rowIndex];
            if (row) stageDeleteRow(row);
          }
        }}
        hasSelectedRow={Boolean(
          hasPrimaryKey && focusedCell && displayedRows[focusedCell.rowIndex],
        )}
        pendingCount={pendingDrafts.length}
        isSubmittingDrafts={isSubmittingDrafts}
        onSubmitDrafts={() => void submitDrafts()}
        onRevertDrafts={revertDrafts}
        onOpenQuery={
          onOpenQueryConsole ? () => onOpenQueryConsole() : undefined
        }
        onFindEverywhere={
          onFindEverywhere
            ? () => {
                const row = focusedCell
                  ? displayedRows[focusedCell.rowIndex]
                  : undefined;
                onFindEverywhere(
                  row && focusedCell
                    ? searchCellValue(row[focusedCell.colName])
                    : undefined,
                );
              }
            : undefined
        }
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        totalPages={totalPages}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        hiddenColumns={hiddenColumns}
        onToggleColumn={(column) =>
          setHiddenColumns((current) =>
            current.includes(column)
              ? current.filter((name) => name !== column)
              : [...current, column],
          )
        }
        onShowAllColumns={() => setHiddenColumns([])}
        isValueEditorOpen={valueEditorOpen}
        canOpenValueEditor={Boolean(
          focusedCell && displayedRows[focusedCell.rowIndex],
        )}
        onToggleValueEditor={() => {
          if (valueEditorOpen) {
            setValueEditorOpen(false);
            return;
          }
          if (!focusedCell) return;
          const row = displayedRows[focusedCell.rowIndex];
          const column = table.columns.find(
            (item) => item.name === focusedCell.colName,
          );
          if (row && column) {
            setCellDrawerState({
              isOpen: true,
              columnName: column.name,
              columnType: column.type,
              cellValue: row[column.name],
              row,
            });
            setValueEditorOpen(true);
          }
        }}
        showStats={showStats}
        onToggleStats={() => setShowStats((current) => !current)}
        t={t}
      />
      <TableSubviewTabs
        activeView={activeSubView}
        onViewChange={setActiveSubView}
        table={table}
        connectionName={connectionName}
        dbType={dbType}
      />
      {activeSubView === "data" && (
        <TableFilterBar
          table={table}
          dbType={dbType}
          quickSearch={quickSearch}
          onQuickSearchChange={setQuickSearch}
          quickSearchInputRef={quickSearchInputRef}
          filters={filters}
          onFiltersChange={onFiltersChange}
          filterCol={filterCol}
          onFilterColChange={setFilterCol}
          filterOp={filterOp}
          onFilterOpChange={setFilterOp}
          filterVal={filterVal}
          onFilterValChange={setFilterVal}
          onAddFilter={handleAddFilter}
          onRemoveFilter={handleRemoveFilter}
          sortBy={sortBy}
          sortDesc={sortDesc}
          onSortChange={onSortChange}
          t={t}
        />
      )}
      {showStats && activeSubView === "data" && (
        <div className="border-border bg-card/50 dark:border-border shrink-0 border-b">
          <QuickStatsBar
            table={table}
            stats={tableStats}
            totalFilteredRows={totalCount}
            isFiltered={filters.length > 0}
            onOpenAnalytics={(col) =>
              setAnalyticsColumn(col || table.columns[0] || null)
            }
          />
        </div>
      )}

      {activeSubView !== "data" ? (
        <Suspense
          fallback={
            <div className="text-muted-foreground p-8 text-center font-mono text-xs">
              Loading Schema...
            </div>
          }
        >
          <SchemaInspector
            connId={connId}
            table={table}
            view={activeSubView}
            isReadOnly={isReadOnly}
            onNavigateRelation={onNavigateRelation}
            onOpenQueryConsole={onOpenQueryConsole}
          />
        </Suspense>
      ) : (
        <>
          <div className="flex min-h-0 min-w-0 flex-1">
            {/* Grid Container */}
            <div
              ref={tableContainerRef}
              data-tour="datagrid-view"
              className="relative flex min-w-0 flex-1 flex-col overflow-auto"
              onScroll={(event) => {
                if (!onScrollPositionChange) return;
                const element = event.currentTarget;
                if (scrollPositionTimer.current)
                  clearTimeout(scrollPositionTimer.current);
                scrollPositionTimer.current = setTimeout(() => {
                  onScrollPositionChange(element.scrollLeft, element.scrollTop);
                }, 120);
              }}
            >
              {draftSubmitError && (
                <div
                  role="alert"
                  className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/30 dark:text-destructive m-2 shrink-0 rounded border px-3 py-2 text-xs"
                >
                  {draftSubmitError}
                </div>
              )}
              {isLoading || isRefreshing ? (
                /* High-fidelity shadcn UI Table Skeleton */
                <table
                  aria-label={t("datagrid.rowsInTable", {
                    table: table?.name,
                    defaultValue: `Rows in ${table?.name ?? "table"}`,
                  })}
                  className="animate-in fade-in border-border dark:border-border w-full caption-bottom border-collapse border-b text-left text-sm duration-150"
                >
                  <TableHeader className="border-border bg-card dark:border-border dark:bg-card sticky top-0 z-10 border-b">
                    <TableRow>
                      <TableHead className="border-border text-muted-foreground dark:border-border/80 w-12 px-3 py-2 font-mono text-xs font-medium not-last:border-r">
                        #
                      </TableHead>
                      {table?.columns?.map((c) => (
                        <TableHead
                          key={c.name}
                          className="border-border text-muted-foreground dark:border-border/80 dark:text-muted-foreground h-auto px-2.5 py-1 text-xs font-medium whitespace-nowrap not-last:border-r"
                        >
                          <div className="flex items-center gap-1.5 py-1">
                            <Skeleton className="bg-muted/80 dark:bg-muted/80 size-3.5 shrink-0 rounded" />
                            <span className="text-foreground font-mono text-xs font-semibold">
                              {c.name}
                            </span>
                            <span className="text-muted-foreground font-mono text-[10px] font-normal">
                              {c.type}
                            </span>
                          </div>
                        </TableHead>
                      )) ??
                        [1, 2, 3, 4, 5, 6].map((idx) => (
                          <TableHead
                            key={idx}
                            className="border-border dark:border-border/80 px-3 py-2 not-last:border-r"
                          >
                            <Skeleton className="h-4 w-24 rounded" />
                          </TableHead>
                        ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-border dark:divide-border/50 divide-y">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((rowIdx) => (
                      <TableRow
                        key={rowIdx}
                        className="h-9.25 hover:bg-transparent"
                      >
                        <TableCell className="border-border/80 text-muted-foreground dark:border-border/40 w-12 px-3 py-2 font-mono text-xs not-last:border-r">
                          <Skeleton className="bg-muted/70 dark:bg-muted/70 h-3 w-4 rounded" />
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
                              className="border-border/80 dark:border-border/40 px-3 py-2 whitespace-nowrap not-last:border-r"
                            >
                              {isPk ? (
                                <div className="flex items-center gap-1.5">
                                  <Skeleton className="bg-warning/40 dark:bg-warning/30 size-3 shrink-0 rounded-full" />
                                  <Skeleton className="bg-muted dark:bg-muted h-3 w-8 rounded" />
                                </div>
                              ) : isBool ? (
                                <Skeleton className="bg-success/20 dark:bg-success/15 h-4 w-12 rounded-full" />
                              ) : isDate ? (
                                <Skeleton className="bg-muted/80 dark:bg-muted/80 h-3 w-28 rounded" />
                              ) : isNumeric ? (
                                <Skeleton
                                  className="bg-muted/80 dark:bg-muted/80 h-3 rounded"
                                  style={{
                                    width: `${32 + ((rowIdx * 17 + cIdx * 13) % 40)}px`,
                                  }}
                                />
                              ) : (
                                <Skeleton
                                  className="bg-muted/90 dark:bg-muted/90 h-3 rounded"
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
                              className="border-border/80 dark:border-border/40 px-3 py-2 not-last:border-r"
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
                  isReadOnly={isReadOnly || !hasPrimaryKey}
                  onEditRow={onEditRow}
                  onDeleteRow={stageDeleteRow}
                  onSaveCell={async (row, columnName, value) =>
                    stageCellValue(row, columnName, value)
                  }
                  onNavigateRelation={onNavigateRelation}
                  t={t}
                />
              ) : (
                /* Data Table */
                <table
                  aria-label={t("datagrid.rowsInTable", {
                    table: table?.name,
                    defaultValue: `Rows in ${table?.name ?? "table"}`,
                  })}
                  className="studio-data-table border-border dark:border-border w-full caption-bottom border-collapse border-b text-left text-sm"
                >
                  <TableHeader className="border-border bg-card dark:border-border dark:bg-card sticky top-0 z-10 border-b">
                    {reactTable.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead
                            key={header.id}
                            style={{ width: header.getSize() }}
                            className="border-border text-muted-foreground dark:border-border/80 dark:text-muted-foreground relative h-auto px-2.5 py-1 text-xs font-medium whitespace-nowrap not-last:border-r"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {header.column.getCanResize() && (
                              <div
                                onMouseDown={header.getResizeHandler()}
                                onTouchStart={header.getResizeHandler()}
                                onClick={(event) => event.stopPropagation()}
                                className={cn(
                                  "absolute top-0 right-0 h-full w-1.5 cursor-col-resize touch-none select-none",
                                  header.column.getIsResizing()
                                    ? "bg-primary"
                                    : "hover:bg-primary/50",
                                )}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={t("datagrid.resizeColumn", {
                                  column: header.column.id,
                                  defaultValue: `Resize ${header.column.id} column`,
                                })}
                              />
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>

                  <TableBody className="divide-border dark:divide-border/50 divide-y">
                    {rowVirtualizer.getVirtualItems().length > 0 && (
                      <>
                        {rowVirtualizer.getVirtualItems()[0].start > 0 && (
                          <tr>
                            <td
                              colSpan={
                                reactTable.getVisibleLeafColumns().length
                              }
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
                              numericColumnNames={numericColumnNames}
                              draftError={
                                draftErrors[row.original._pb_draft_id]
                              }
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
                              colSpan={
                                reactTable.getVisibleLeafColumns().length
                              }
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
            {valueEditorOpen && cellDrawerState.row && (
              <ValueEditorPanel
                columnName={cellDrawerState.columnName}
                columnType={cellDrawerState.columnType}
                value={
                  rowDrafts[cellDrawerState.row._pb_draft_id] &&
                  Object.prototype.hasOwnProperty.call(
                    rowDrafts[cellDrawerState.row._pb_draft_id].current,
                    cellDrawerState.columnName,
                  )
                    ? rowDrafts[cellDrawerState.row._pb_draft_id].current[
                        cellDrawerState.columnName
                      ]
                    : cellDrawerState.cellValue
                }
                isReadOnly={isReadOnly || !hasPrimaryKey}
                width={valueEditorWidth}
                onWidthChange={setValueEditorWidth}
                onClose={() => setValueEditorOpen(false)}
                onApply={(value) =>
                  stageCellValue(
                    cellDrawerState.row!,
                    cellDrawerState.columnName,
                    value,
                  )
                }
              />
            )}
          </div>

          <TableExecutionFooter
            from={rows.length ? page * pageSize + 1 : 0}
            to={Math.min((page + 1) * pageSize, totalCount)}
            total={totalCount}
            queryTimeMs={queryTimeMs}
            querySummary={querySummary}
            isLoading={isLoading}
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
            rows={rows}
            isReadOnly={isReadOnly}
            page={page}
            pageSize={pageSize}
            initialMode={importModalMode}
            tableStats={tableStats}
            filters={filters}
            sortBy={sortBy}
            sortDesc={sortDesc}
            onSuccess={(result) => {
              emitOperationEvent({
                kind: "import",
                severity: "success",
                title: t("operations.importSucceeded", "Import completed"),
                message: t("operations.importSummary", {
                  count: result.inserted_count,
                  defaultValue: "{{count}} rows inserted",
                }),
                connectionId: connId,
                connectionName,
                tabId: workspaceTabId,
              });
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
      <GridContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        table={table}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onEditRow={onEditRow}
        onEditCell={(row, column, rowIndex) =>
          startEditingCell(row, column, rowIndex)
        }
        onSetNull={(row, column) => stageCellValue(row, column, null)}
        onCloneRow={(row) => {
          const clone = Object.fromEntries(
            Object.entries(row).filter(([key]) => !key.startsWith("_pb_")),
          );
          for (const column of table.columns) {
            if (column.is_primary_key) delete clone[column.name];
          }
          stageWholeRow(null, clone);
        }}
        onDeleteRow={stageDeleteRow}
        onSortChange={onSortChange}
        onNavigateRelation={onNavigateRelation}
        onInspectCell={(colName, cellValue, row, colType) => {
          setCellDrawerState({
            isOpen: true,
            columnName: colName,
            columnType: colType,
            cellValue,
            row,
          });
          setValueEditorOpen(true);
        }}
        onCopyNotify={(msg) => {
          setCopiedNotification(msg);
          setTimeout(() => setCopiedNotification(null), 2000);
        }}
        isReadOnly={isReadOnly || !hasPrimaryKey}
        getExtraMenuItems={(context): ExtraGridContextMenuItem[] => {
          const items: ExtraGridContextMenuItem[] = [];
          if (onFindEverywhere)
            items.push({
              id: "find-everywhere",
              label: `Find “${searchCellValue(context.cellValue).slice(0, 48)}” everywhere`,
              onSelect: () =>
                onFindEverywhere(searchCellValue(context.cellValue)),
              disabled:
                context.cellValue == null || String(context.cellValue) === "",
            });
          if (onNavigateReference)
            items.push({
              id: "go-to-referenced-row",
              label: "Go to referenced row",
              onSelect: async () => {
                const rel = table.relations?.find(
                  (item) => item.from_column === context.colName,
                );
                if (connId && workspaceId) {
                  const { resolveReferences } = await import("@/lib/api");
                  const result = await resolveReferences({
                    workspaceId,
                    currentConnectionId: connId,
                    currentTable: table.name,
                    value: String(context.cellValue ?? ""),
                    ...(rel
                      ? {
                          declaredTable: rel.to_table,
                          declaredColumn: rel.to_column,
                        }
                      : {}),
                  });
                  const match = result.matches[0];
                  if (match)
                    onNavigateReference(
                      match.connectionId,
                      match.table,
                      match.column,
                      context.cellValue,
                      match.rowIdentity,
                    );
                }
              },
              disabled:
                (context.cellValue == null &&
                  !table.relations?.some(
                    (item) => item.from_column === context.colName,
                  )) ||
                (!isReferenceId(context.cellValue) &&
                  !table.relations?.some(
                    (item) => item.from_column === context.colName,
                  )),
            });
          return items;
        }}
        mutationBlockedReason={
          isReadOnly
            ? t("datagrid.readOnlyTooltip")
            : !hasPrimaryKey
              ? t(
                  "datagrid.primaryKeyRequired",
                  "Editing and deleting rows requires a primary key.",
                )
              : undefined
        }
        t={t}
      />

      {/* Copied Toast Notification */}
      {copiedNotification && (
        <div className="animate-in fade-in slide-in-from-bottom-2 bg-primary fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-md px-3.5 py-2 font-mono text-xs text-white shadow-lg duration-150">
          <Check className="h-4 w-4 shrink-0" />
          <span>{copiedNotification}</span>
        </div>
      )}
    </div>
  );
};
