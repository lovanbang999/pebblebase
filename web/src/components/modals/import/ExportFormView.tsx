import { useTranslation } from "react-i18next";
import { CheckCircle2, Copy } from "lucide-react";
import type { ExportFormat } from "@/lib/api";
import type { TableStats, FilterOption } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/common/FormField";
import { cn } from "@/lib/utils";
import { EXPORT_FORMAT_OPTIONS, getEstimatedSize } from "./import-utils";

interface ExportFormViewProps {
  exportFormat: ExportFormat;
  onFormatChange: (format: ExportFormat) => void;
  exportSuccess: boolean;
  exportScope: "page" | "filtered";
  onScopeChange: (scope: "page" | "filtered") => void;
  includeHeaders: boolean;
  onIncludeHeadersChange: (include: boolean) => void;
  exportDestination: "file" | "copy";
  onDestinationChange: (dest: "file" | "copy") => void;
  copySupported: boolean;
  tableStats?: TableStats | null;
  filters?: FilterOption[];
}

export function ExportFormView({
  exportFormat,
  onFormatChange,
  exportSuccess,
  exportScope,
  onScopeChange,
  includeHeaders,
  onIncludeHeadersChange,
  exportDestination,
  onDestinationChange,
  copySupported,
  tableStats,
  filters,
}: ExportFormViewProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {exportSuccess && (
        <Alert className="border-primary/50 bg-success/50 text-success dark:bg-success/20 px-4 py-3">
          <CheckCircle2 className="text-success h-4 w-4" />
          <AlertDescription className="ml-2 font-mono text-xs">
            {exportDestination === "copy"
              ? t("export.copied", {
                  defaultValue: "Export copied to clipboard.",
                })
              : t("export.success", {
                  defaultValue:
                    "Export completed successfully! File download started.",
                })}
          </AlertDescription>
        </Alert>
      )}

      {/* Format Selection with FormField */}
      <FormField
        label={t("export.formatLabel", { defaultValue: "Export Format" })}
        labelClassName="text-foreground dark:text-muted-foreground font-mono text-xs font-medium"
        className="space-y-2"
      >
        {({ id }) => (
          <Select
            value={exportFormat}
            onValueChange={(val) => onFormatChange(val as ExportFormat)}
          >
            <SelectTrigger
              id={id}
              className="border-border bg-card dark:border-border dark:bg-card/50 h-11 w-full font-mono text-xs"
            >
              <SelectValue
                placeholder={t("export.selectFormat", {
                  defaultValue: "Select format",
                })}
              />
            </SelectTrigger>
            <SelectContent className="font-mono text-xs">
              {EXPORT_FORMAT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                return (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", opt.iconClass)} />
                      <span>
                        {t(opt.labelKey, {
                          defaultValue: opt.defaultLabel,
                        })}
                      </span>
                      {opt.descKey ? (
                        <span className="text-muted-foreground ml-2 text-[10px] font-normal">
                          {t(opt.descKey, { defaultValue: opt.desc })}
                        </span>
                      ) : opt.desc ? (
                        <span className="text-muted-foreground ml-2 text-[10px] font-normal">
                          {opt.desc}
                        </span>
                      ) : null}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        )}
      </FormField>

      {/* Scope, Destination & Options */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground mr-1">
          {t("export.rowsLabel", { defaultValue: "Rows:" })}
        </span>
        <Button
          type="button"
          size="sm"
          variant={exportScope === "page" ? "secondary" : "outline"}
          onClick={() => onScopeChange("page")}
        >
          {t("export.currentPage", { defaultValue: "Current page" })}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={exportScope === "filtered" ? "secondary" : "outline"}
          onClick={() => onScopeChange("filtered")}
        >
          {t("export.allFiltered", { defaultValue: "All filtered" })}
        </Button>

        <span className="text-muted-foreground mr-1 ml-3">
          {t("export.outputLabel", { defaultValue: "Output:" })}
        </span>
        <Button
          type="button"
          size="sm"
          variant={exportDestination === "file" ? "secondary" : "outline"}
          onClick={() => onDestinationChange("file")}
        >
          {t("export.destinationFile", { defaultValue: "File" })}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={exportDestination === "copy" ? "secondary" : "outline"}
          disabled={exportScope !== "page" || !copySupported}
          title={
            !copySupported
              ? t("export.copySupportedHint", {
                  defaultValue: "Copy supports CSV, JSON, and SQL",
                })
              : exportScope !== "page"
                ? t("export.copyCurrentPageOnlyHint", {
                    defaultValue: "Copy is limited to the current page",
                  })
                : undefined
          }
          onClick={() => onDestinationChange("copy")}
        >
          <Copy className="mr-1 h-3 w-3" />
          {t("export.destinationCopy", { defaultValue: "Copy" })}
        </Button>

        {exportFormat === "csv" && (
          <label className="text-muted-foreground ml-3 inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeHeaders}
              onChange={(event) => onIncludeHeadersChange(event.target.checked)}
            />
            {t("export.includeHeaderRow", {
              defaultValue: "Include header row",
            })}
          </label>
        )}
      </div>

      {/* Table Metrics & Estimated Size */}
      <div className="border-border bg-card/50 dark:bg-card/30 space-y-3 rounded-xl border p-4">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-mono">
            {t("export.totalRows", { defaultValue: "Total Records" })}:
          </span>
          <span className="text-foreground font-mono font-medium">
            {new Intl.NumberFormat().format(tableStats?.total_rows ?? 0)}
          </span>
        </div>

        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground font-mono">
            {t("export.estimatedSize", {
              defaultValue: "Estimated File Size",
            })}
            :
          </span>
          <span className="text-success font-mono font-medium">
            {getEstimatedSize(exportFormat, tableStats)}
          </span>
        </div>

        {filters && filters.length > 0 && (
          <div className="border-border flex items-center justify-between border-t pt-2 text-xs">
            <span className="text-muted-foreground font-mono">
              {t("export.activeFilters", { defaultValue: "Active Filters:" })}
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {t("export.activeFilterCount", {
                count: filters.length,
                defaultValue: `${filters.length} active filter${filters.length > 1 ? "s" : ""}`,
              })}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
