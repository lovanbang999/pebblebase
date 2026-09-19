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
import type { TableSchema, TableStats, FilterOption } from "../lib/types";
import { importTableCSV, exportTableData, type ExportFormat } from "../lib/api";
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function getEstimatedSize(
  format: ExportFormat,
  stats?: TableStats | null,
): string {
  const rawBytes = stats?.size_bytes ?? 0;
  const totalRows = stats?.total_rows ?? 0;

  let baseBytes = rawBytes;
  if (baseBytes <= 0 && totalRows > 0) {
    baseBytes = totalRows * 120;
  }
  if (baseBytes <= 0) return "—";

  const multipliers: Record<ExportFormat, number> = {
    parquet: 0.25,
    xlsx: 0.4,
    csv: 0.9,
    jsonl: 1.1,
    json: 1.3,
  };

  const estimated = baseBytes * (multipliers[format] || 1.0);
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
      <DialogContent className="sm:max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden font-sans border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-2xl rounded-2xl">
        <DialogHeader className="px-6 py-5 border-b border-zinc-200 dark:border-zinc-800 shrink-0 bg-zinc-50/50 dark:bg-zinc-900/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-8">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 shadow-xs",
                  activeTab === "export"
                    ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                )}
              >
                {activeTab === "export" ? (
                  <Download className="w-5 h-5" />
                ) : (
                  <FileSpreadsheet className="w-5 h-5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-base font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight">
                  {activeTab === "export"
                    ? t("export.title", {
                        table: table.name,
                        defaultValue: "Export Table",
                      })
                    : t("datagrid.importModalTitle", { table: table.name })}
                </DialogTitle>
                <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
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
            <div className="flex items-center self-start sm:self-center p-1 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-xs font-mono shrink-0">
              <button
                type="button"
                onClick={() => {
                  setActiveTab("import");
                  setError(null);
                }}
                className={cn(
                  "px-3 py-1 rounded-md transition-colors",
                  activeTab === "import"
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-medium"
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
                  "px-3 py-1 rounded-md transition-colors",
                  activeTab === "export"
                    ? "bg-white dark:bg-zinc-800 text-zinc-950 dark:text-white shadow-xs font-medium"
                    : "text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200",
                )}
              >
                {t("export.tabExport", { defaultValue: "Export Data" })}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {error && (
            <Alert variant="destructive" className="py-3 px-4">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-xs font-mono ml-2">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {activeTab === "export" ? (
            <div className="space-y-6">
              {exportSuccess && (
                <Alert className="border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 py-3 px-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <AlertDescription className="text-xs font-mono ml-2">
                    {t("export.success", {
                      defaultValue:
                        "Export completed successfully! File download started.",
                    })}
                  </AlertDescription>
                </Alert>
              )}

              {/* Format selection */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 font-mono">
                  {t("export.formatLabel", { defaultValue: "Export Format" })}
                </label>
                <Select
                  value={exportFormat}
                  onValueChange={(val) => setExportFormat(val as ExportFormat)}
                >
                  <SelectTrigger className="w-full h-11 text-xs font-mono bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800">
                    <SelectValue
                      placeholder={t("export.selectFormat", {
                        defaultValue: "Select format",
                      })}
                    />
                  </SelectTrigger>
                  <SelectContent className="text-xs font-mono">
                    <SelectItem value="csv">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        <span>
                          {t("export.format.csv", {
                            defaultValue: "CSV (.csv)",
                          })}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-normal ml-2">
                          Standard comma-separated
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="json">
                      <div className="flex items-center gap-2">
                        <FileJson className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        <span>
                          {t("export.format.json", {
                            defaultValue: "JSON (.json)",
                          })}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-normal ml-2">
                          Full JSON array
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="jsonl">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <span>
                          {t("export.format.jsonl", {
                            defaultValue: "JSONL (.jsonl)",
                          })}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-normal ml-2">
                          Newline-delimited JSON stream
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="xlsx">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4 text-green-600 dark:text-green-400" />
                        <span>
                          {t("export.format.xlsx", {
                            defaultValue: "Excel (.xlsx)",
                          })}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-normal ml-2">
                          Microsoft Excel spreadsheet
                        </span>
                      </div>
                    </SelectItem>
                    <SelectItem value="parquet">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        <span>
                          {t("export.format.parquet", {
                            defaultValue: "Parquet (.parquet)",
                          })}
                        </span>
                        <span className="text-[10px] text-zinc-400 font-normal ml-2">
                          High-efficiency columnar binary
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table Metrics & Estimated Size */}
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                    {t("export.totalRows", { defaultValue: "Total Records" })}:
                  </span>
                  <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200">
                    {new Intl.NumberFormat().format(
                      tableStats?.total_rows ?? 0,
                    )}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400 font-mono">
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
                  <div className="pt-2 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400 font-mono">
                      Active Filters:
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {filters.length} active filter
                      {filters.length > 1 ? "s" : ""}
                    </Badge>
                  </div>
                )}
              </div>
            </div>
          ) : successResult ? (
            <div className="py-10 flex flex-col items-center justify-center text-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-7 h-7" />
              </div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                {t("datagrid.importSuccessTitle")}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md leading-relaxed">
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
                    "border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200",
                    isDragOver
                      ? "border-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/10"
                      : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/30",
                  )}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={onFileInputChange}
                  />
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-zinc-500 dark:text-zinc-400 mb-3">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {t("datagrid.selectOrDropCsv")}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
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
                <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                        {file.name}
                      </p>
                      <p className="text-[11px] text-zinc-400 font-mono">
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
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              )}

              {/* Column Mapping Section */}
              {file && csvHeaders.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                      {t("datagrid.columnMapping")}
                    </h4>
                    <span className="text-[11px] text-zinc-400">
                      {
                        Object.values(columnMappings).filter(
                          (v) => v && v !== "__skip__",
                        ).length
                      }{" "}
                      of {csvHeaders.length} mapped
                    </span>
                  </div>

                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900/50">
                    {csvHeaders.map((header) => {
                      const currentMapped = columnMappings[header] || "";
                      const targetCol = table.columns.find(
                        (c) => c.name === currentMapped,
                      );

                      return (
                        <div
                          key={header}
                          className="p-3 flex items-center justify-between gap-4 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="font-mono font-medium text-zinc-800 dark:text-zinc-200 truncate">
                              {header}
                            </span>
                            <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          </div>

                          <div className="flex items-center gap-3 w-64 shrink-0">
                            <Select
                              value={currentMapped || "__skip__"}
                              onValueChange={(val) =>
                                handleMappingChange(header, val ?? "")
                              }
                            >
                              <SelectTrigger className="w-full h-8 text-xs font-mono">
                                <SelectValue
                                  placeholder={t("datagrid.selectColumn")}
                                />
                              </SelectTrigger>
                              <SelectContent className="max-h-56 text-xs font-mono">
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
                                        <Key className="w-3 h-3 text-amber-500" />
                                      )}
                                      <span className="text-[10px] text-zinc-400 font-mono">
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
                                className="text-[10px] text-amber-600 dark:text-amber-400 border-amber-500/30 px-1.5 py-0 shrink-0 font-mono"
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
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-mono">
                    {t("datagrid.previewData")}
                  </h4>
                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-x-auto bg-zinc-50/50 dark:bg-zinc-900/30">
                    <table className="w-full text-left text-xs font-mono border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/80">
                          {csvHeaders.map((h, i) => (
                            <th
                              key={i}
                              className="py-2 px-3 text-zinc-600 dark:text-zinc-400 font-medium whitespace-nowrap"
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
                                className="py-1.5 px-3 text-zinc-800 dark:text-zinc-200 whitespace-nowrap max-w-40 truncate"
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

        <div className="px-6 py-5 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex items-center justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/30">
          {activeTab === "export" ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClose}
                disabled={isExporting}
                className="text-xs h-9 px-4 font-medium"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleDoExport}
                disabled={isExporting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs gap-1.5 px-5 h-9 shadow-xs"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {t("export.exporting", { defaultValue: "Exporting..." })}
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
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
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-5 h-9"
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
                className="text-xs h-9 px-4 font-medium"
              >
                {t("common.cancel", { defaultValue: "Cancel" })}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleImport}
                disabled={!file || isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs gap-1.5 px-5 h-9 shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{t("datagrid.importing")}</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-3.5 h-3.5" />
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
