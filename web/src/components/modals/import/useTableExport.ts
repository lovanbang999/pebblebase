import { useState, useCallback, useRef, useEffect } from "react";
import type { TableSchema, FilterOption } from "@/lib/types";
import { exportTableData, type ExportFormat } from "@/lib/api";
import { cleanExportRow, serializeExportRows } from "@/lib/dataImportExport";
import { isCopySupported } from "./import-utils";

interface UseTableExportParams {
  connId: string;
  table: TableSchema;
  rows?: Record<string, unknown>[];
  filters?: FilterOption[];
  sortBy?: string;
  sortDesc?: boolean;
  page?: number;
  pageSize?: number;
}

export function useTableExport({
  connId,
  table,
  rows = [],
  filters,
  sortBy,
  sortDesc,
  page = 0,
  pageSize = 100,
}: UseTableExportParams) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportScope, setExportScope] = useState<"page" | "filtered">("page");
  const [includeHeaders, setIncludeHeaders] = useState(true);
  const [exportDestination, setExportDestination] = useState<"file" | "copy">(
    "file",
  );
  const [error, setError] = useState<string | null>(null);

  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, []);

  const copySupported = isCopySupported(exportFormat);

  const handleFormatChange = useCallback((nextFormat: ExportFormat) => {
    setExportFormat(nextFormat);
    if (!isCopySupported(nextFormat)) {
      setExportDestination("file");
    }
  }, []);

  const resetExportState = useCallback(() => {
    setIsExporting(false);
    setExportSuccess(false);
    setExportScope("page");
    setIncludeHeaders(true);
    setExportDestination("file");
    setError(null);
    if (successTimeoutRef.current) {
      clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = null;
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleDoExport = useCallback(async () => {
    if (!connId || isExporting) return;

    try {
      setIsExporting(true);
      setError(null);

      if (exportDestination === "copy") {
        await navigator.clipboard.writeText(
          serializeExportRows(
            table.name,
            rows.map(cleanExportRow),
            exportFormat,
            includeHeaders,
          ),
        );
        setExportSuccess(true);
        return;
      }

      const blob = await exportTableData(connId, table.name, exportFormat, {
        limit: exportScope === "page" ? pageSize : undefined,
        offset: exportScope === "page" ? page * pageSize : undefined,
        sort_by: sortBy,
        sort_desc: sortDesc,
        filters,
        include_header: includeHeaders,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${table.name}.${exportFormat === "xlsx" ? "xlsx" : exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      successTimeoutRef.current = setTimeout(() => {
        setExportSuccess(false);
      }, 4000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to export table";
      setError(message);
    } finally {
      setIsExporting(false);
    }
  }, [
    connId,
    isExporting,
    exportDestination,
    table.name,
    rows,
    exportFormat,
    includeHeaders,
    exportScope,
    pageSize,
    page,
    sortBy,
    sortDesc,
    filters,
  ]);

  return {
    exportFormat,
    setExportFormat: handleFormatChange,
    isExporting,
    exportSuccess,
    exportScope,
    setExportScope,
    includeHeaders,
    setIncludeHeaders,
    exportDestination,
    setExportDestination,
    error,
    setError,
    clearError,
    copySupported,
    handleDoExport,
    resetExportState,
  };
}
