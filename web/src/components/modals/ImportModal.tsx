import {
  useState,
  useRef,
  useEffect,
  type FC,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  UploadCloud,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  X,
  FileText,
  Key,
  Download,
  Database,
  FileJson,
  FileCode2,
} from "lucide-react";
import type { TableSchema, TableStats, FilterOption } from "@/lib/types";
import { importTableCSV, exportTableData, type ExportFormat } from "@/lib/api";
import { emitOperationEvent } from "@/lib/operationEvents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "cn";
import {
  formatBytes,
  EXPORT_SIZE_MULTIPLIERS,
  ESTIMATED_BYTES_PER_ROW,
} from "@/constants";

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  connId: string;
  table: TableSchema;
  onSuccess?: (result: { inserted_count: number; duration_ms: number }) => void;
  initialMode?: "import" | "export";
  tableStats?: TableStats | null;
  filters?: FilterOption[];
  sortBy?: string;
  sortDesc?: boolean;
}

function getEstimatedSize(
  format: ExportFormat,
  stats?: TableStats | null,
): string {
  const rawBytes = stats?.size_bytes ?? 0;
  const totalRows = stats?.total_rows ?? 0;

  let baseBytes = rawBytes;
  if (baseBytes <= 0 && totalRows > 0) {
    baseBytes = totalRows * ESTIMATED_BYTES_PER_ROW;
  }
  if (baseBytes <= 0) return "—";

  const estimated = baseBytes * (EXPORT_SIZE_MULTIPLIERS[format] || 1.0);
  return formatBytes(estimated);
}

export const ImportModal: FC<ImportModalProps> = ({
  isOpen,
  onClose,
  connId,
  table,
  onSuccess,
  initialMode = "import",
  tableStats,
  filters,
  sortBy,
  sortDesc,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"import" | "export">(initialMode);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("csv");
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      setExportSuccess(false);
    }
  }, [isOpen, initialMode]);

  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
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

  const resetState = () => {
    setFile(null);
    setCsvHeaders([]);
    setPreviewRows([]);
    setColumnMappings({});
    setIsDragOver(false);
    setIsSubmitting(false);
    setIsExporting(false);
    setExportSuccess(false);
    setError(null);
    setSuccessResult(null);
  };

  const handleClose = () => {
    if (isSubmitting || isExporting) return;
    resetState();
    onClose();
  };

  const handleDoExport = async () => {
    if (!connId || isExporting) return;
    try {
      setIsExporting(true);
      setError(null);
      const blob = await exportTableData(connId, table.name, exportFormat, {
        sort_by: sortBy,
        sort_desc: sortDesc,
        filters: filters,
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
      setTimeout(() => {
        setExportSuccess(false);
      }, 4000);
    } catch (err: any) {
      setError(err?.message || "Failed to export table");
    } finally {
      setIsExporting(false);
    }
  };

  const handleFile = async (selectedFile: File) => {
    setError(null);
    setSuccessResult(null);

    if (!selectedFile.name.toLowerCase().endsWith(".csv")) {
      setError(t("datagrid.supportedFileFormat"));
      return;
    }

    setFile(selectedFile);

    try {
      // Read first 64KB for fast preview and header detection
      const slice = selectedFile.slice(0, 65536);
      const text = await slice.text();
      const { headers, rows } = parseCSVPreview(text, 5);

      if (headers.length === 0) {
        setError(t("datagrid.noFileSelected"));
        return;
      }

      setCsvHeaders(headers);
      setPreviewRows(rows);

      // Auto-match CSV headers to table columns
      const initialMappings: Record<string, string> = {};
      const lowerColMap = new Map<string, string>();
      table.columns.forEach((c) => {
        lowerColMap.set(c.name.toLowerCase(), c.name);
      });

      headers.forEach((h) => {
        const trimmed = h.trim();
        const matched = lowerColMap.get(trimmed.toLowerCase());
        initialMappings[trimmed] = matched || "";
      });

      setColumnMappings(initialMappings);
    } catch (err: any) {
      setError(err?.message || "Failed to read CSV file");
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleMappingChange = (csvCol: string, targetCol: string) => {
    setColumnMappings((prev) => ({
      ...prev,
      [csvCol]: targetCol === "__skip__" ? "" : targetCol,
    }));
  };

  const handleImport = async () => {
    if (!file) {
      setError(t("datagrid.noFileSelected"));
      return;
    }

    // Check that at least one column is mapped
    const activeMappings: Record<string, string> = {};
    let mappedCount = 0;
    for (const [csvCol, targetCol] of Object.entries(columnMappings)) {
      if (targetCol && targetCol !== "__skip__") {
        activeMappings[csvCol] = targetCol;
        mappedCount++;
      }
    }

    if (mappedCount === 0) {
      setError(t("datagrid.noColumnsMapped"));
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
      setSuccessResult(res);
      onSuccess?.(res);
    } catch (err: any) {
      setError(err?.message || "Import failed");
      emitOperationEvent({
        kind: "import",
        severity: "error",
        title: t("operations.importFailed", "Import failed"),
        message: t(
          "operations.genericFailure",
          "The operation could not be completed.",
        ),
        connectionId: connId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="border-border bg-background dark:border-border dark:bg-card flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border p-0 font-sans shadow-2xl sm:max-w-2xl">
        <DialogHeader className="border-border bg-card/50 dark:border-border dark:bg-card/30 shrink-0 border-b px-6 py-5">
          <div className="flex flex-col justify-between gap-4 pr-8 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs",
                  activeTab === "export"
                    ? "bg-primary/10 text-primary dark:text-primary"
                    : "bg-success/10 text-success dark:text-success",
                )}
              >
                {activeTab === "export" ? (
                  <Download className="h-5 w-5" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-foreground dark:text-foreground text-base font-semibold tracking-tight">
                  {activeTab === "export"
                    ? t("export.title", {
                        table: table.name,
                        defaultValue: "Export Table",
                      })
                    : t("datagrid.importModalTitle", { table: table.name })}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground dark:text-muted-foreground mt-1 text-xs leading-relaxed">
                  {activeTab === "export"
                    ? t("export.desc", {
                        table: table.name,
                        defaultValue:
                          "Export records from this table into various file formats.",
                      })
                    : t("datagrid.importModalDesc")}
                </DialogDescription>
              </div>
            </div>

            {/* Mode Switcher */}
            <div className="border-border bg-muted dark:border-border dark:bg-card flex shrink-0 items-center self-start rounded-lg border p-1 font-mono text-xs sm:self-center">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("import");
                  setError(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  activeTab === "import"
                    ? "bg-background text-foreground dark:bg-muted font-medium shadow-xs dark:text-white"
                    : "text-muted-foreground hover:text-foreground dark:hover:text-foreground",
                )}
              >
                {t("export.tabImport", { defaultValue: "Import CSV" })}
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("export");
                  setError(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  activeTab === "export"
                    ? "bg-background text-foreground dark:bg-muted font-medium shadow-xs dark:text-white"
                    : "text-muted-foreground hover:text-foreground dark:hover:text-foreground",
                )}
              >
                {t("export.tabExport", { defaultValue: "Export Data" })}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {error && (
            <Alert variant="destructive" className="px-4 py-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2 font-mono text-xs">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {activeTab === "export" ? (
            <div className="space-y-6">
              {exportSuccess && (
                <Alert className="border-primary/50 bg-success/50 text-success dark:bg-success/20 dark:text-success px-4 py-3">
                  <CheckCircle2 className="text-success dark:text-success h-4 w-4" />
                  <AlertDescription className="ml-2 font-mono text-xs">
                    {t("export.success", {
                      defaultValue:
                        "Export completed successfully! File download started.",
                    })}
                  </AlertDescription>
                </Alert>
              )}

              {/* Format selection */}
              <div className="space-y-2">
                <label className="text-foreground dark:text-muted-foreground font-mono text-xs font-medium">
                  {t("export.formatLabel", { defaultValue: "Export Format" })}
                </label>
                <Select
                  value={exportFormat}
                  onValueChange={(val) => setExportFormat(val as ExportFormat)}
                >
                  <SelectTrigger className="border-border bg-card dark:border-border dark:bg-card/50 h-11 w-full font-mono text-xs">
                    <SelectValue
                      placeholder={t("export.selectFormat", {
                        defaultValue: "Select format",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent className="font-mono text-xs">
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="text-success dark:text-success h-4 w-4" />
                        <span>
                          {t("export.format.csv", {
                            defaultValue: "CSV (.csv)",
                          })}
                        </span>
                        <span className="text-muted-foreground ml-2 text-[10px] font-normal">
                          Standard comma-separated
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <FileJson className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <span>
                          {t("export.format.json", {
                            defaultValue: "JSON (.json)",
                          })}
                        </span>
                        <span className="text-muted-foreground ml-2 text-[10px] font-normal">
                          Full JSON array
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="jsonl">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                        <span>
                          {t("export.format.jsonl", {
                            defaultValue: "JSONL (.jsonl)",
                          })}
                        </span>
                        <span className="text-muted-foreground ml-2 text-[10px] font-normal">
                          Newline-delimited JSON stream
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="xlsx">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span>
                          {t("export.format.xlsx", {
                            defaultValue: "Excel (.xlsx)",
                          })}
                        </span>
                        <span className="text-muted-foreground ml-2 text-[10px] font-normal">
                          Microsoft Excel spreadsheet
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="parquet">
                      <div className="flex items-center gap-2">
                        <Database className="text-primary dark:text-primary h-4 w-4" />
                        <span>
                          {t("export.format.parquet", {
                            defaultValue: "Parquet (.parquet)",
                          })}
                        </span>
                        <span className="text-muted-foreground ml-2 text-[10px] font-normal">
                          High-efficiency columnar binary
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table Metrics & Estimated Size */}
              <div className="border-border bg-card/50 dark:border-border dark:bg-card/30 space-y-3 rounded-xl border p-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground dark:text-muted-foreground font-mono">
                    {t("export.totalRows", { defaultValue: "Total Records" })}:
                  </span>
                  <span className="text-foreground dark:text-foreground font-mono font-medium">
                    {new Intl.NumberFormat().format(
                      tableStats?.total_rows ?? 0,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground dark:text-muted-foreground font-mono">
                    {t("export.estimatedSize", {
                      defaultValue: "Estimated File Size",
                    })}
                    :
                  </span>
                  <span className="text-success dark:text-success font-mono font-medium">
                    {getEstimatedSize(exportFormat, tableStats)}
                  </span>
                </div>

                {filters && filters.length > 0 && (
                  <div className="border-border dark:border-border flex items-center justify-between border-t pt-2 text-xs">
                    <span className="text-muted-foreground dark:text-muted-foreground font-mono">
                      Active Filters:
                    </span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {filters.length} active filter
                      {filters.length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          ) : successResult ? (
            <div className="flex flex-col items-center justify-center space-y-3 py-10 text-center">
              <div className="bg-success/15 text-success dark:text-success flex h-14 w-14 items-center justify-center rounded-full shadow-xs">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-foreground dark:text-foreground text-base font-semibold">
                {t("datagrid.importSuccessTitle")}
              </h3>
              <p className="text-muted-foreground dark:text-muted-foreground max-w-md text-xs leading-relaxed">
                {t("datagrid.importSuccessDesc", {
                  count: successResult.inserted_count,
                  duration: successResult.duration_ms,
                })}
              </p>
            </div>
          ) : (
            <>
              {/* File Drop Area */}
              {!file ? (
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200",
                    isDragOver
                      ? "border-primary bg-success/5 dark:bg-success/10"
                      : "border-border bg-card/50 hover:border-border dark:border-border dark:bg-card/30 dark:hover:border-border",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={onFileInputChange}
                  />
                  <div className="bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground mb-3 flex h-12 w-12 items-center justify-center rounded-full">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <p className="text-foreground dark:text-foreground text-sm font-medium">
                    {t("datagrid.selectOrDropCsv")}
                  </p>
                  <p className="text-muted-foreground dark:text-muted-foreground mt-1 text-xs">
                    {t("datagrid.supportedFileFormat")}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4 text-xs font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                  >
                    {t("datagrid.browseFiles")}
                  </Button>
                </div>
              ) : (
                /* Selected File Banner */
                <div className="border-border bg-card dark:border-border dark:bg-card/50 flex items-center justify-between rounded-lg border p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-success/10 text-success dark:text-success flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-foreground dark:text-foreground truncate text-xs font-medium">
                        {file.name}
                      </p>
                      <p className="text-muted-foreground font-mono text-[11px]">
                        {formatFileSize(file.size)} &bull; {csvHeaders.length}{" "}
                        columns detected
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={resetState}
                    className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Column Mapping Section */}
              {file && csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-muted-foreground dark:text-muted-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                      {t("datagrid.columnMapping")}
                    </h4>
                    <span className="text-muted-foreground text-[11px]">
                      {t("datagrid.columnsMapped", {
                        mapped: Object.values(columnMappings).filter(
                          (v) => v && v !== "__skip__",
                        ).length,
                        total: csvHeaders.length,
                      })}
                    </span>
                  </div>

                  <div className="divide-border border-border bg-background dark:divide-border dark:border-border dark:bg-card/50 divide-y overflow-hidden rounded-xl border">
                    {csvHeaders.map((header) => {
                      const currentMapped = columnMappings[header] || "";
                      const targetCol = table.columns.find(
                        (c) => c.name === currentMapped,
                      );

                      return (
                        <div
                          key={header}
                          className="flex items-center justify-between gap-4 p-3 text-xs"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span className="text-foreground dark:text-foreground truncate font-mono font-medium">
                              {header}
                            </span>
                            <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                          </div>

                          <div className="flex w-64 shrink-0 items-center gap-3">
                            <Select
                              value={currentMapped || "__skip__"}
                              onValueChange={(val) =>
                                handleMappingChange(header, val ?? "")
                              }
                            >
                              <SelectTrigger className="h-8 w-full font-mono text-xs">
                                <SelectValue
                                  placeholder={t("datagrid.selectColumn")}
                                />
                              </SelectTrigger>
                              <SelectContent className="max-h-56 font-mono text-xs">
                                <SelectItem
                                  value="__skip__"
                                  className="text-muted-foreground italic"
                                >
                                  {t("datagrid.skipColumn")}
                                </SelectItem>
                                {table.columns.map((col) => (
                                  <SelectItem key={col.name} value={col.name}>
                                    <div className="flex items-center gap-2">
                                      <span>{col.name}</span>
                                      {col.is_primary_key && (
                                        <Key className="text-warning h-3 w-3" />
                                      )}
                                      <span className="text-muted-foreground font-mono text-[10px]">
                                        ({col.type})
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {targetCol?.is_primary_key && (
                              <Badge
                                variant="outline"
                                className="border-warning/30 text-warning dark:text-warning shrink-0 px-1.5 py-0 font-mono text-[10px]"
                              >
                                PK
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Data Preview Table */}
              {previewRows.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-muted-foreground dark:text-muted-foreground font-mono text-xs font-semibold tracking-wider uppercase">
                    {t("datagrid.previewData")}
                  </h4>
                  <div className="border-border bg-card/50 dark:border-border dark:bg-card/30 overflow-x-auto rounded-xl border">
                    <table className="w-full border-collapse text-left font-mono text-xs">
                      <thead>
                        <tr className="border-border bg-muted/70 dark:border-border dark:bg-card/80 border-b">
                          {csvHeaders.map((h, i) => (
                            <th
                              key={i}
                              className="text-muted-foreground dark:text-muted-foreground px-3 py-2 font-medium whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-border/60 dark:divide-border/60 divide-y">
                        {previewRows.map((row, rowIdx) => (
                          <tr
                            key={rowIdx}
                            className="hover:bg-muted/50 dark:hover:bg-muted/50"
                          >
                            {row.map((cell, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="text-foreground dark:text-foreground max-w-40 truncate px-3 py-1.5 whitespace-nowrap"
                              >
                                {cell || (
                                  <span className="text-muted-foreground italic">
                                    NULL
                                  </span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-border bg-card/50 dark:border-border dark:bg-card/30 flex shrink-0 items-center justify-end gap-3 border-t px-6 py-5">
          {activeTab === "export" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isExporting}
                className="h-9 px-4 text-xs font-medium"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDoExport}
                disabled={isExporting}
                className="bg-primary hover:bg-primary h-9 gap-1.5 px-5 text-xs font-semibold text-white shadow-xs"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>
                      {t("export.exporting", { defaultValue: "Exporting..." })}
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" />
                    <span>
                      {t("export.downloadButton", {
                        defaultValue: "Download Export",
                      })}
                    </span>
                  </>
                )}
              </Button>
            </>
          ) : successResult ? (
            <Button
              type="button"
              size="sm"
              onClick={handleClose}
              className="bg-primary hover:bg-primary/90 h-9 px-5 text-xs font-medium text-white"
            >
              {t("datagrid.close")}
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isSubmitting}
                className="h-9 px-4 text-xs font-medium"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleImport}
                disabled={!file || isSubmitting}
                className="bg-primary hover:bg-primary/90 h-9 gap-1.5 px-5 text-xs font-semibold text-white shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{t("datagrid.importing")}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-3.5 w-3.5" />
                    <span>{t("datagrid.importButton")}</span>
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

// Simple RFC-compliant CSV preview parser for client-side instant preview
function parseCSVPreview(
  text: string,
  maxRows = 5,
): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let currentLine = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((char === "\r" || char === "\n") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") i++;
      if (currentLine.trim()) {
        lines.push(currentLine);
        if (lines.length > maxRows + 1) break;
      }
      currentLine = "";
    } else {
      currentLine += char;
    }
  }

  if (currentLine.trim() && lines.length <= maxRows + 1) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        fields.push(field.trim());
        field = "";
      } else {
        field += char;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1, maxRows + 1).map(parseLine);
  return { headers, rows };
}
