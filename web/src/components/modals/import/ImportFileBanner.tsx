import { useTranslation } from "react-i18next";
import { FileText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatFileSize } from "./import-utils";

interface ImportFileBannerProps {
  fileName: string;
  fileSize: number;
  columnCount: number;
  onClear: () => void;
}

export function ImportFileBanner({
  fileName,
  fileSize,
  columnCount,
  onClear,
}: ImportFileBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="border-border bg-card dark:bg-card/50 flex items-center justify-between rounded-lg border p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="bg-success/10 text-success flex h-8 w-8 shrink-0 items-center justify-center rounded-md">
          <FileText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-foreground truncate text-xs font-medium">
            {fileName}
          </p>
          <p className="text-muted-foreground font-mono text-[11px]">
            {formatFileSize(fileSize)} &bull;{" "}
            {t("datagrid.columnsDetected", {
              count: columnCount,
              defaultValue: `${columnCount} columns detected`,
            })}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onClear}
        className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
