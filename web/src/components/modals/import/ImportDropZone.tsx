import { useRef, type ChangeEvent, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ImportDropZoneProps {
  isDragOver: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onFileInputChange: (e: ChangeEvent<HTMLInputElement>) => void;
  isReadOnly?: boolean;
}

export function ImportDropZone({
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onFileInputChange,
  isReadOnly = false,
}: ImportDropZoneProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!isReadOnly) {
      fileInputRef.current?.click();
    }
  };

  return (
    <>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={handleClick}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200",
          isDragOver
            ? "border-primary bg-success/5 dark:bg-success/10"
            : "border-border bg-card/50 hover:border-border dark:bg-card/30",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={isReadOnly}
          className="hidden"
          onChange={onFileInputChange}
        />
        <div className="bg-muted text-muted-foreground mb-3 flex h-12 w-12 items-center justify-center rounded-full">
          <UploadCloud className="h-6 w-6" />
        </div>
        <p className="text-foreground text-sm font-medium">
          {t("datagrid.selectOrDropCsv")}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
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

      {isReadOnly && (
        <Alert>
          <AlertDescription>
            {t("datagrid.readOnlyImportDisabled", {
              defaultValue:
                "Imports are disabled for this read-only connection.",
            })}
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
