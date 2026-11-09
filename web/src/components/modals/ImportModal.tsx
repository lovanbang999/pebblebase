import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Download, FileSpreadsheet, AlertCircle } from "lucide-react";
import type { TableSchema, TableStats, FilterOption } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  useTableExport,
  useTableImport,
  ExportFormView,
  ImportDropZone,
  ImportFileBanner,
  ImportColumnMapping,
  ImportPreviewTable,
  ImportSuccessView,
  ImportModalFooter,
} from "./import";

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
  rows?: Record<string, unknown>[];
  isReadOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export function ImportModal({
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
  rows = [],
  isReadOnly = false,
  page = 0,
  pageSize = 100,
}: ImportModalProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"import" | "export">(initialMode);

  const exportControls = useTableExport({
    connId,
    table,
    rows,
    filters,
    sortBy,
    sortDesc,
    page,
    pageSize,
  });

  const importControls = useTableImport({
    connId,
    table,
    isReadOnly,
    onSuccess,
    t,
  });

  const { resetExportState } = exportControls;

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialMode);
      resetExportState();
    }
  }, [isOpen, initialMode, resetExportState]);

  const handleClose = () => {
    if (exportControls.isExporting || importControls.isSubmitting) return;
    exportControls.resetExportState();
    importControls.resetImportState();
    onClose();
  };

  const handleTabSwitch = (mode: "import" | "export") => {
    if (mode === "import" && isReadOnly) return;
    setActiveTab(mode);
    exportControls.clearError();
    importControls.clearError();
  };

  const isExportTab = activeTab === "export";
  const activeError = isExportTab ? exportControls.error : importControls.error;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="border-border bg-background dark:bg-card flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border p-0 font-sans shadow-2xl sm:max-w-2xl">
        <DialogHeader className="border-border bg-card/50 dark:bg-card/30 shrink-0 border-b px-6 py-5">
          <div className="flex flex-col justify-between gap-4 pr-8 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg shadow-xs",
                  isExportTab
                    ? "bg-primary/10 text-primary"
                    : "bg-success/10 text-success",
                )}
              >
                {isExportTab ? (
                  <Download className="h-5 w-5" />
                ) : (
                  <FileSpreadsheet className="h-5 w-5" />
                )}
              </div>
              <div>
                <DialogTitle className="text-foreground text-base font-semibold tracking-tight">
                  {isExportTab
                    ? t("export.title", {
                        table: table.name,
                        defaultValue: "Export Table",
                      })
                    : t("datagrid.importModalTitle", { table: table.name })}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-1 text-xs leading-relaxed">
                  {isExportTab
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
            <div className="border-border bg-muted dark:bg-card flex shrink-0 items-center self-start rounded-lg border p-1 font-mono text-xs sm:self-center">
              <button
                type="button"
                disabled={isReadOnly}
                title={
                  isReadOnly
                    ? t("datagrid.readOnlyTabTooltip", {
                        defaultValue: "Read-only connections cannot import",
                      })
                    : undefined
                }
                onClick={() => handleTabSwitch("import")}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  !isExportTab
                    ? "bg-background text-foreground dark:bg-muted font-medium shadow-xs dark:text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("export.tabImport", { defaultValue: "Import CSV" })}
              </button>
              <button
                type="button"
                onClick={() => handleTabSwitch("export")}
                className={cn(
                  "rounded-md px-3 py-1 transition-colors",
                  isExportTab
                    ? "bg-background text-foreground dark:bg-muted font-medium shadow-xs dark:text-white"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("export.tabExport", { defaultValue: "Export Data" })}
              </button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {activeError && (
            <Alert variant="destructive" className="px-4 py-3">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2 font-mono text-xs">
                {activeError}
              </AlertDescription>
            </Alert>
          )}

          {isExportTab ? (
            <ExportFormView
              exportFormat={exportControls.exportFormat}
              onFormatChange={exportControls.setExportFormat}
              exportSuccess={exportControls.exportSuccess}
              exportScope={exportControls.exportScope}
              onScopeChange={exportControls.setExportScope}
              includeHeaders={exportControls.includeHeaders}
              onIncludeHeadersChange={exportControls.setIncludeHeaders}
              exportDestination={exportControls.exportDestination}
              onDestinationChange={exportControls.setExportDestination}
              copySupported={exportControls.copySupported}
              tableStats={tableStats}
              filters={filters}
            />
          ) : importControls.successResult ? (
            <ImportSuccessView
              insertedCount={importControls.successResult.inserted_count}
              durationMs={importControls.successResult.duration_ms}
            />
          ) : (
            <>
              {!importControls.file ? (
                <ImportDropZone
                  isDragOver={importControls.isDragOver}
                  onDragOver={importControls.onDragOver}
                  onDragLeave={importControls.onDragLeave}
                  onDrop={importControls.onDrop}
                  onFileInputChange={importControls.onFileInputChange}
                  isReadOnly={isReadOnly}
                />
              ) : (
                <>
                  <ImportFileBanner
                    fileName={importControls.file.name}
                    fileSize={importControls.file.size}
                    columnCount={importControls.csvHeaders.length}
                    onClear={importControls.resetImportState}
                  />

                  {importControls.csvHeaders.length > 0 && (
                    <ImportColumnMapping
                      csvHeaders={importControls.csvHeaders}
                      tableColumns={table.columns}
                      columnMappings={importControls.columnMappings}
                      onMappingChange={importControls.handleMappingChange}
                    />
                  )}

                  <ImportPreviewTable
                    csvHeaders={importControls.csvHeaders}
                    previewRows={importControls.previewRows}
                    validationErrors={importControls.validationErrors}
                    csvRowCount={importControls.csvRowCount}
                  />
                </>
              )}
            </>
          )}
        </div>

        <ImportModalFooter
          activeTab={activeTab}
          isSuccess={Boolean(importControls.successResult)}
          isExporting={exportControls.isExporting}
          exportDestination={exportControls.exportDestination}
          exportScope={exportControls.exportScope}
          copySupported={exportControls.copySupported}
          onExport={exportControls.handleDoExport}
          isSubmitting={importControls.isSubmitting}
          hasFile={Boolean(importControls.file)}
          isReadOnly={isReadOnly}
          hasValidationErrors={importControls.validationErrors.length > 0}
          onImport={importControls.handleImport}
          onClose={handleClose}
        />
      </DialogContent>
    </Dialog>
  );
}
