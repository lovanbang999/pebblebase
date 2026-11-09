import { useTranslation } from "react-i18next";
import { Download, Copy, UploadCloud, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImportModalFooterProps {
  activeTab: "import" | "export";
  isSuccess: boolean;
  // Export actions & states
  isExporting: boolean;
  exportDestination: "file" | "copy";
  exportScope: "page" | "filtered";
  copySupported: boolean;
  onExport: () => void;
  // Import actions & states
  isSubmitting: boolean;
  hasFile: boolean;
  isReadOnly: boolean;
  hasValidationErrors: boolean;
  onImport: () => void;
  // Common
  onClose: () => void;
}

export function ImportModalFooter({
  activeTab,
  isSuccess,
  isExporting,
  exportDestination,
  exportScope,
  copySupported,
  onExport,
  isSubmitting,
  hasFile,
  isReadOnly,
  hasValidationErrors,
  onImport,
  onClose,
}: ImportModalFooterProps) {
  const { t } = useTranslation();

  if (isSuccess) {
    return (
      <div className="border-border bg-card/50 dark:bg-card/30 flex shrink-0 items-center justify-end gap-3 border-t px-6 py-5">
        <Button
          type="button"
          size="sm"
          onClick={onClose}
          className="bg-primary hover:bg-primary/90 h-9 px-5 text-xs font-medium text-white"
        >
          {t("datagrid.close")}
        </Button>
      </div>
    );
  }

  const isCopyDestination = exportDestination === "copy";
  const isCopyDisabled = !copySupported || exportScope !== "page";
  const isDownloadDisabled =
    isExporting || (isCopyDestination && isCopyDisabled);
  const isImportDisabled =
    !hasFile || isSubmitting || isReadOnly || hasValidationErrors;
  const isBusy = activeTab === "export" ? isExporting : isSubmitting;

  return (
    <div className="border-border bg-card/50 dark:bg-card/30 flex shrink-0 items-center justify-end gap-3 border-t px-6 py-5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onClose}
        disabled={isBusy}
        className="h-9 px-4 text-xs font-medium"
      >
        {t("common.cancel", { defaultValue: "Cancel" })}
      </Button>

      {activeTab === "export" ? (
        <Button
          type="button"
          size="sm"
          onClick={onExport}
          disabled={isDownloadDisabled}
          className="bg-primary hover:bg-primary h-9 gap-1.5 px-5 text-xs font-semibold text-white shadow-xs"
        >
          {isExporting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>
                {t("export.exporting", { defaultValue: "Exporting..." })}
              </span>
            </>
          ) : isCopyDestination ? (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>
                {t("export.copyButton", { defaultValue: "Copy Export" })}
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
      ) : (
        <Button
          type="button"
          size="sm"
          onClick={onImport}
          disabled={isImportDisabled}
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
      )}
    </div>
  );
}
