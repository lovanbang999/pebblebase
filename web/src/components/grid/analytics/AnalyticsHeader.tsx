import { useTranslation } from "react-i18next";
import {
  BarChart3,
  ChevronDown,
  Check,
  Key,
  Layers,
  Filter,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import type { ColumnSchema, FilterOption } from "@/lib/types";

interface AnalyticsHeaderProps {
  column: ColumnSchema;
  columns?: ColumnSchema[];
  tableName: string;
  totalRows: number;
  activeFilters: FilterOption[];
  useFilters: boolean;
  onToggleFilters: () => void;
  onSelectColumn?: (column: ColumnSchema) => void;
  onClose: () => void;
}

export function AnalyticsHeader({
  column,
  columns = [],
  tableName,
  totalRows,
  activeFilters,
  useFilters,
  onToggleFilters,
  onSelectColumn,
  onClose,
}: AnalyticsHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="border-border bg-card dark:border-border/80 dark:bg-card/50 flex shrink-0 items-start justify-between border-b px-5 py-4">
      <div className="flex items-start gap-3">
        <div className="border-primary/20 bg-primary/10 text-primary mt-0.5 rounded-lg border p-2">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {columns.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      title={t("analytics.switchColumn", "Switch Column")}
                      className="group border-border bg-muted text-foreground dark:border-border/80 dark:bg-card flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm font-semibold transition-all"
                    >
                      <span>{column.name}</span>
                      <ChevronDown className="text-muted-foreground group-hover:text-foreground h-3.5 w-3.5 transition-transform" />
                    </button>
                  }
                />
                <DropdownMenuContent
                  align="start"
                  className="border-border bg-card text-foreground z-50 max-h-72 w-56 overflow-y-auto border p-1 shadow-xl"
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-muted-foreground px-2 py-1 font-mono text-[10px] uppercase">
                      {t("analytics.switchColumn", "Switch Column")}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-muted my-1" />
                    {columns.map((c) => {
                      const isSelected = c.name === column.name;
                      return (
                        <DropdownMenuItem
                          key={c.name}
                          onClick={() => onSelectColumn?.(c)}
                          className={`flex cursor-pointer items-center justify-between rounded px-2 py-1.5 font-mono text-xs ${
                            isSelected
                              ? "bg-primary/20 text-primary font-semibold"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {c.is_primary_key && (
                              <Key className="text-warning h-3 w-3 shrink-0" />
                            )}
                            {c.is_foreign_key && (
                              <Layers className="h-3 w-3 shrink-0 text-sky-400" />
                            )}
                            <span className="truncate">{c.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className="bg-muted/80 text-muted-foreground border-transparent px-1 py-0 text-[10px]"
                            >
                              {c.type}
                            </Badge>
                            {isSelected && (
                              <Check className="text-primary h-3 w-3 shrink-0" />
                            )}
                          </div>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="text-foreground font-mono text-base font-bold">
                {column.name}
              </span>
            )}
            <Badge
              variant="outline"
              className="bg-muted/80 text-muted-foreground border-transparent px-1.5 py-0 font-mono text-xs"
            >
              {column.type}
            </Badge>
            {column.is_primary_key && (
              <Badge
                variant="outline"
                className="border-warning/40 bg-warning/10 text-warning flex items-center gap-1 px-1.5 py-0 text-[10px]"
              >
                <Key className="h-3 w-3" />
                PK
              </Badge>
            )}
            {column.is_foreign_key && (
              <Badge
                variant="outline"
                className="flex items-center gap-1 border-sky-500/40 bg-sky-500/10 px-1.5 py-0 text-[10px] text-sky-400"
              >
                <Layers className="h-3 w-3" />
                FK
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
            <span>{tableName}</span>
            <span className="text-muted-foreground">•</span>
            <span>
              {totalRows.toLocaleString()}{" "}
              {t("analytics.totalRows").toLowerCase()}
            </span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {activeFilters.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleFilters}
            className={`h-7 gap-1 px-2.5 text-xs ${
              useFilters
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground"
            }`}
            title={
              useFilters
                ? t("analytics.analyzingFiltered", {
                    count: activeFilters.length,
                  })
                : t("analytics.analyzingAll")
            }
          >
            <Filter className="h-3 w-3" />
            {useFilters
              ? t("analytics.analyzingFiltered", {
                  count: activeFilters.length,
                })
              : t("analytics.analyzingAll")}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-muted-foreground hover:bg-muted hover:text-foreground h-8 w-8 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
