import { useTranslation } from "react-i18next";
import { ArrowRight, Key } from "lucide-react";
import type { ColumnSchema } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ImportColumnMappingProps {
  csvHeaders: string[];
  tableColumns: ColumnSchema[];
  columnMappings: Record<string, string>;
  onMappingChange: (csvCol: string, targetCol: string) => void;
}

export function ImportColumnMapping({
  csvHeaders,
  tableColumns,
  columnMappings,
  onMappingChange,
}: ImportColumnMappingProps) {
  const { t } = useTranslation();

  const mappedCount = Object.values(columnMappings).filter(
    (v) => v && v !== "__skip__",
  ).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-muted-foreground font-mono text-xs font-semibold tracking-wider uppercase">
          {t("datagrid.columnMapping")}
        </h4>
        <span className="text-muted-foreground text-[11px]">
          {t("datagrid.columnsMapped", {
            mapped: mappedCount,
            total: csvHeaders.length,
          })}
        </span>
      </div>

      <div className="divide-border border-border bg-background dark:bg-card/50 divide-y overflow-hidden rounded-xl border">
        {csvHeaders.map((header) => {
          const currentMapped = columnMappings[header] || "";
          const targetCol = tableColumns.find((c) => c.name === currentMapped);

          return (
            <div
              key={header}
              className="flex items-center justify-between gap-4 p-3 text-xs"
            >
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="text-foreground truncate font-mono font-medium">
                  {header}
                </span>
                <ArrowRight className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
              </div>

              <div className="flex w-64 shrink-0 items-center gap-3">
                <Select
                  value={currentMapped || "__skip__"}
                  onValueChange={(val) => onMappingChange(header, val ?? "")}
                >
                  <SelectTrigger className="h-8 w-full font-mono text-xs">
                    <SelectValue placeholder={t("datagrid.selectColumn")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-56 font-mono text-xs">
                    <SelectItem
                      value="__skip__"
                      className="text-muted-foreground italic"
                    >
                      {t("datagrid.skipColumn")}
                    </SelectItem>
                    {tableColumns.map((col) => (
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
  );
}
