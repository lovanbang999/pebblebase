import {
  useState,
  useRef,
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
} from "lucide-react";
import type { TableSchema } from "../lib/types";
import { importTableCSV } from "../lib/api";
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
  onSuccess: (result: { inserted_count: number; duration_ms: number }) => void;
}

export const ImportModal: FC<ImportModalProps> = ({
  isOpen,
  onClose,
  connId,
  table,
  onSuccess,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setError(null);
    setSuccessResult(null);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetState();
    onClose();
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
      onSuccess(res);
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
          <div className="flex items-center gap-3 pr-8">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-950 dark:text-zinc-50 tracking-tight">
                {t("datagrid.importModalTitle", { table: table.name })}
              </DialogTitle>
              <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                {t("datagrid.importModalDesc")}
              </DialogDescription>
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

          {successResult ? (
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
                    title="Remove file"
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}

              {/* Column Mapping Section */}
              {file && csvHeaders.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      {t("datagrid.columnMappingTitle")}
                    </h4>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      {t("datagrid.columnMappingDesc")}
                    </p>
                  </div>

                  <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
                    <div className="grid grid-cols-12 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      <div className="col-span-4">
                        {t("datagrid.csvColumn")}
                      </div>
                      <div className="col-span-3">
                        {t("datagrid.sampleValue")}
                      </div>
                      <div className="col-span-5">
                        {t("datagrid.targetColumn")}
                      </div>
                    </div>

                    <div className="divide-y divide-zinc-200 dark:divide-zinc-800 max-h-60 overflow-y-auto">
                      {csvHeaders.map((header, idx) => {
                        const sampleVal = previewRows[0]?.[idx] ?? "";
                        const currentTarget = columnMappings[header] ?? "";

                        return (
                          <div
                            key={header}
                            className="grid grid-cols-12 px-4 py-2.5 items-center text-xs hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition-colors"
                          >
                            <div className="col-span-4 flex items-center gap-1.5 pr-3 truncate">
                              <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                {header}
                              </span>
                            </div>

                            <div className="col-span-3 pr-3 truncate">
                              <span className="text-zinc-500 dark:text-zinc-400 font-mono text-[11px] truncate block">
                                {sampleVal !== "" ? (
                                  sampleVal
                                ) : (
                                  <span className="italic text-zinc-300 dark:text-zinc-600">
                                    null
                                  </span>
                                )}
                              </span>
                            </div>

                            <div className="col-span-5 flex items-center gap-2">
                              <ArrowRight className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <Select
                                  value={currentTarget || "__skip__"}
                                  onValueChange={(val) =>
                                    handleMappingChange(header, val ?? "")
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs font-mono">
                                    <SelectValue
                                      placeholder={t("datagrid.skipColumn")}
                                    />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-48">
                                    <SelectItem
                                      value="__skip__"
                                      className="text-zinc-400 italic"
                                    >
                                      {t("datagrid.skipColumn")}
                                    </SelectItem>
                                    {table.columns.map((col) => (
                                      <SelectItem
                                        key={col.name}
                                        value={col.name}
                                      >
                                        <div className="flex items-center gap-1.5">
                                          <span>{col.name}</span>
                                          <Badge
                                            variant="secondary"
                                            className="text-[9px] px-1 py-0 h-3.5 uppercase font-mono"
                                          >
                                            {col.type}
                                          </Badge>
                                          {col.is_primary_key && (
                                            <Key className="w-2.5 h-2.5 text-amber-500 shrink-0" />
                                          )}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Preview Section */}
                  {previewRows.length > 0 && (
                    <div className="space-y-2 pt-1">
                      <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        {t("datagrid.previewRows", {
                          count: previewRows.length,
                        })}
                      </p>
                      <div className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-xs">
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px] font-mono">
                            <thead>
                              <tr className="bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800">
                                {csvHeaders.map((h) => (
                                  <th
                                    key={h}
                                    className="px-3.5 py-2 text-left font-medium text-zinc-600 dark:text-zinc-400 truncate"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                              {previewRows.map((row, rIdx) => (
                                <tr
                                  key={rIdx}
                                  className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30"
                                >
                                  {csvHeaders.map((_, cIdx) => (
                                    <td
                                      key={cIdx}
                                      className="px-3.5 py-1.5 text-zinc-700 dark:text-zinc-300 truncate max-w-37.5"
                                    >
                                      {row[cIdx] ?? ""}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-6 py-5 border-t border-zinc-200 dark:border-zinc-800 shrink-0 flex items-center justify-end gap-3 bg-zinc-50/50 dark:bg-zinc-900/30">
          {successResult ? (
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
