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
      <DialogContent className="flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 font-sans shadow-2xl sm:max-w-2xl dark:border-zinc-800 dark:bg-zinc-950">
        <DialogHeader className="shrink-0 border-b border-zinc-200 bg-zinc-50/50 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/30">
          <div className="flex flex-col justify-between gap-4 pr-8 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs",
                  activeTab === "export"
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                )}
              >
                {activeTab === "export" ? (
                  <Download className="h-5 w-5" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
                  {activeTab === "export"
                    ? t("export.title", {
                        table: table.name,
                        defaultValue: "Export Table",
                      })
                    : t("datagrid.importModalTitle", { table: table.name })}
                </DialogTitle>
                <DialogDescription className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
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
            <div className="flex shrink-0 items-center self-start rounded-lg border border-zinc-200 bg-zinc-100 p-1 font-mono text-xs sm:self-center dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("import");
                  setError(null);
                }}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  activeTab === "import"
                    ? "bg-white font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
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
                    ? "bg-white font-medium text-zinc-950 shadow-xs dark:bg-zinc-800 dark:text-white"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
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
                <Alert className="border-emerald-500/50 bg-emerald-50/50 px-4 py-3 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
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
                <label className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {t("export.formatLabel", { defaultValue: "Export Format" })}
                </label>
                <Select
                  value={exportFormat}
                  onValueChange={(val) => setExportFormat(val as ExportFormat)}
                >
                  <SelectTrigger className="h-11 w-full border-zinc-200 bg-zinc-50 font-mono text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
                    <SelectValue
                      placeholder={t("export.selectFormat", {
                        defaultValue: "Select format",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent className="font-mono text-xs">
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>
                          {t("export.format.csv", {
                            defaultValue: "CSV (.csv)",
                          })}
                        </span>
                        <span className="ml-2 text-[10px] font-normal text-zinc-400">
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
                        <span className="ml-2 text-[10px] font-normal text-zinc-400">
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
                        <span className="ml-2 text-[10px] font-normal text-zinc-400">
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
                        <span className="ml-2 text-[10px] font-normal text-zinc-400">
                          Microsoft Excel spreadsheet
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="parquet">
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {t("export.format.parquet", {
                            defaultValue: "Parquet (.parquet)",
                          })}
                        </span>
                        <span className="ml-2 text-[10px] font-normal text-zinc-400">
                          High-efficiency columnar binary
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table Metrics & Estimated Size */}
              <div className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-900/30">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">
                    {t("export.totalRows", { defaultValue: "Total Records" })}:
                  </span>
                  <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                    {new Intl.NumberFormat().format(
                      tableStats?.total_rows ?? 0,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-zinc-500 dark:text-zinc-400">
                    {t("export.estimatedSize", {
                      defaultValue: "Estimated File Size",
                    })}
                    :
                  </span>
                  <span className="font-mono font-medium text-emerald-600 dark:text-emerald-400">
                    {getEstimatedSize(exportFormat, tableStats)}
                  </span>
                </div>

                {filters && filters.length > 0 && (
                  <div className="flex items-center justify-between border-t border-zinc-200 pt-2 text-xs dark:border-zinc-800">
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">
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
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 shadow-xs dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {t("datagrid.importSuccessTitle")}
              </h3>
              <p className="max-w-md text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
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
                      ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10"
                      : "border-zinc-200 bg-zinc-50/50 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900/30 dark:hover:border-zinc-700",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={onFileInputChange}
                  />
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {t("datagrid.selectOrDropCsv")}
                  </p>
                  <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
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
                <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/50">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                        {file.name}
                      </p>
                      <p className="font-mono text-[11px] text-zinc-400">
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
                    className="shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* Column Mapping Section */}
              {file && csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-mono text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                      {t("datagrid.columnMapping")}
                    </h4>
                    <span className="text-[11px] text-zinc-400">
                      {t("datagrid.columnsMapped", {
                        mapped: Object.values(columnMappings).filter(
                          (v) => v && v !== "__skip__",
                        ).length,
                        total: csvHeaders.length,
                      })}
                    </span>
                  </div>

                  <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/50">
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
                            <span className="truncate font-mono font-medium text-zinc-800 dark:text-zinc-200">
                              {header}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
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
                                  className="text-zinc-400 italic"
                                >
                                  {t("datagrid.skipColumn")}
                                </SelectItem>
                                {table.columns.map((col) => (
                                  <SelectItem key={col.name} value={col.name}>
                                    <div className="flex items-center gap-2">
                                      <span>{col.name}</span>
                                      {col.is_primary_key && (
                                        <Key className="h-3 w-3 text-amber-500" />
                                      )}
                                      <span className="font-mono text-[10px] text-zinc-400">
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
                                className="shrink-0 border-amber-500/30 px-1.5 py-0 font-mono text-[10px] text-amber-600 dark:text-amber-400"
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
                  <h4 className="font-mono text-xs font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                    {t("datagrid.previewData")}
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/30">
                    <table className="w-full border-collapse text-left font-mono text-xs">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-100/70 dark:border-zinc-800 dark:bg-zinc-900/80">
                          {csvHeaders.map((h, i) => (
                            <th
                              key={i}
                              className="px-3 py-2 font-medium whitespace-nowrap text-zinc-600 dark:text-zinc-400"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200/60 dark:divide-zinc-800/60">
                        {previewRows.map((row, rowIdx) => (
                          <tr
                            key={rowIdx}
                            className="hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50"
                          >
                            {row.map((cell, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="max-w-40 truncate px-3 py-1.5 whitespace-nowrap text-zinc-800 dark:text-zinc-200"
                              >
                                {cell || (
                                  <span className="text-zinc-400 italic">
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

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 bg-zinc-50/50 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-900/30">
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
                className="h-9 gap-1.5 bg-indigo-600 px-5 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500"
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
              className="h-9 bg-emerald-600 px-5 text-xs font-medium text-white hover:bg-emerald-500"
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
                className="h-9 gap-1.5 bg-emerald-600 px-5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500"
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
