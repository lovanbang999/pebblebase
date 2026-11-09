import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ImportPreviewTableProps {
  csvHeaders: string[];
  previewRows: string[][];
  validationErrors: string[];
  csvRowCount: number;
}

export function ImportPreviewTable({
  csvHeaders,
  previewRows,
  validationErrors,
  csvRowCount,
}: ImportPreviewTableProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      {validationErrors.length > 0 && previewRows.length === 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="ml-2 text-xs">
            {t("datagrid.csvValidationBlocked", {
              count: validationErrors.length,
              defaultValue: `CSV validation found ${validationErrors.length} issue(s); import is blocked.`,
            })}
            {validationErrors.slice(0, 5).map((validationError) => (
              <div key={validationError}>{validationError}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {previewRows.length > 0 && (
        <>
          <h4 className="text-muted-foreground font-mono text-xs font-semibold tracking-wider uppercase">
            {t("datagrid.previewData")} · {csvRowCount} rows
          </h4>

          {validationErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="ml-2 text-xs">
                <div>
                  {t("datagrid.csvValidationBlocked", {
                    count: validationErrors.length,
                    defaultValue: `CSV validation found ${validationErrors.length} issue(s); import is blocked.`,
                  })}
                </div>
                {validationErrors.slice(0, 5).map((validationError) => (
                  <div key={validationError}>{validationError}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <div className="border-border bg-card/50 dark:bg-card/30 overflow-x-auto rounded-xl border">
            <table className="w-full border-collapse text-left font-mono text-xs">
              <thead>
                <tr className="border-border bg-muted/70 dark:bg-card/80 border-b">
                  {csvHeaders.map((header, i) => (
                    <th
                      key={i}
                      className="text-muted-foreground px-3 py-2 font-medium whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-border/60 divide-y">
                {previewRows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="hover:bg-muted/50">
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className="text-foreground max-w-40 truncate px-3 py-1.5 whitespace-nowrap"
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
        </>
      )}
    </div>
  );
}
