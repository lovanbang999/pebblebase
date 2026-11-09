import { useState, useCallback, type ChangeEvent, type DragEvent } from "react";
import type { TableSchema } from "@/lib/types";
import { importTableCSV } from "@/lib/api";
import { parseCSVPreview } from "@/lib/dataImportExport";
import { emitOperationEvent } from "@/lib/operationEvents";
import { invalidateReferenceCache } from "@/lib/referenceCache";
import { matchColumns, validateColumnMappings } from "./import-utils";

interface UseTableImportParams {
  connId: string;
  table: TableSchema;
  isReadOnly?: boolean;
  onSuccess?: (result: { inserted_count: number; duration_ms: number }) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

export function useTableImport({
  connId,
  table,
  isReadOnly = false,
  onSuccess,
  t,
}: UseTableImportParams) {
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [csvRowCount, setCsvRowCount] = useState(0);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>(
    {},
  );
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    inserted_count: number;
    duration_ms: number;
  } | null>(null);

  const resetImportState = useCallback(() => {
    setFile(null);
    setCsvHeaders([]);
    setPreviewRows([]);
    setValidationErrors([]);
    setCsvRowCount(0);
    setColumnMappings({});
    setIsDragOver(false);
    setIsSubmitting(false);
    setError(null);
    setSuccessResult(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleFile = useCallback(
    async (selectedFile: File) => {
      if (isReadOnly) return;
      setError(null);
      setSuccessResult(null);
      setValidationErrors([]);
      setCsvHeaders([]);
      setPreviewRows([]);
      setColumnMappings({});

      if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
        setError(t("datagrid.supportedFileFormat"));
        return;
      }

      setFile(selectedFile);

      try {
        const text = await selectedFile.text();
        const { headers, rows, errors, rowCount } = parseCSVPreview(text, 5);

        if (headers.length === 0) {
          setError(t("datagrid.noFileSelected"));
          return;
        }

        setCsvHeaders(headers);
        setPreviewRows(rows);
        setValidationErrors(errors);
        setCsvRowCount(rowCount);

        const initialMappings = matchColumns(headers, table.columns);
        setColumnMappings(initialMappings);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to read CSV file";
        setError(message);
      }
    },
    [isReadOnly, t, table.columns],
  );

  const onFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    },
    [handleFile],
  );

  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile],
  );

  const handleMappingChange = useCallback(
    (csvCol: string, targetCol: string) => {
      setColumnMappings((prev) => ({
        ...prev,
        [csvCol]: targetCol === "__skip__" ? "" : targetCol,
      }));
    },
    [],
  );

  const handleImport = useCallback(async () => {
    if (isReadOnly) return;
    if (validationErrors.length > 0) {
      setError(
        t("datagrid.fixCsvErrors", {
          defaultValue: "Fix the CSV validation errors before importing.",
        }),
      );
      return;
    }
    if (!file) {
      setError(t("datagrid.noFileSelected"));
      return;
    }

    const { activeMappings, error: validationError } =
      validateColumnMappings(columnMappings);

    if (validationError) {
      setError(
        validationError.startsWith("datagrid.")
          ? t(validationError, {
              defaultValue:
                validationError === "datagrid.eachDbColOneCsvCol"
                  ? "Each database column can only be mapped from one CSV column."
                  : undefined,
            })
          : validationError,
      );
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await importTableCSV(
        connId,
        table.name,
        file,
        activeMappings,
      );
      invalidateReferenceCache(connId);
      setSuccessResult(res);
      onSuccess?.(res);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Import failed";
      setError(message);
      emitOperationEvent({
        kind: "import",
        severity: "error",
        title: t("operations.importFailed", { defaultValue: "Import failed" }),
        message: t("operations.genericFailure", {
          defaultValue: "The operation could not be completed.",
        }),
        connectionId: connId,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isReadOnly,
    validationErrors.length,
    file,
    columnMappings,
    t,
    connId,
    table.name,
    onSuccess,
  ]);

  return {
    file,
    csvHeaders,
    previewRows,
    validationErrors,
    csvRowCount,
    columnMappings,
    isDragOver,
    isSubmitting,
    error,
    setError,
    clearError,
    successResult,
    handleFile,
    onFileInputChange,
    onDragOver,
    onDragLeave,
    onDrop,
    handleMappingChange,
    handleImport,
    resetImportState,
  };
}
