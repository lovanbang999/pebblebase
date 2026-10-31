import type { FC, FormEvent, RefObject } from "react";
import { Search, X, Filter } from "lucide-react";
import type { FilterOption, TableSchema } from "@/lib/types";
import type { DatabaseType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TableFilterBarProps {
  table: TableSchema;
  dbType?: DatabaseType;
  quickSearch: string;
  onQuickSearchChange: (value: string) => void;
  quickSearchInputRef: RefObject<HTMLInputElement | null>;
  filters: FilterOption[];
  onFiltersChange: (filters: FilterOption[]) => void;
  filterCol: string;
  onFilterColChange: (column: string) => void;
  filterOp: "eq" | "neq" | "gt" | "lt" | "contains";
  onFilterOpChange: (operator: "eq" | "neq" | "gt" | "lt" | "contains") => void;
  filterVal: string;
  onFilterValChange: (value: string) => void;
  onAddFilter: (event: FormEvent) => void;
  onRemoveFilter: (index: number) => void;
  sortBy: string;
  sortDesc: boolean;
  onSortChange: (column: string, desc: boolean) => void;
  t: (key: string, options?: any) => string;
}

export const TableFilterBar: FC<TableFilterBarProps> = ({
  table,
  dbType,
  quickSearch,
  onQuickSearchChange,
  quickSearchInputRef,
  filters,
  onFiltersChange,
  filterCol,
  onFilterColChange,
  filterOp,
  onFilterOpChange,
  filterVal,
  onFilterValChange,
  onAddFilter,
  onRemoveFilter,
  sortBy,
  sortDesc,
  onSortChange,
  t,
}) => (
  <div className="border-border bg-card/80 dark:border-border dark:bg-card/30 flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-1.5">
    <div className="relative w-44 shrink-0">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2" />
      <Input
        ref={quickSearchInputRef}
        value={quickSearch}
        onChange={(event) => onQuickSearchChange(event.target.value)}
        placeholder={t("datagrid.searchPlaceholder")}
        aria-label={t("datagrid.searchPlaceholder")}
        title={t("datagrid.searchScopeHelp")}
        className="h-7 pr-7 pl-7 font-mono text-xs"
      />
      {quickSearch && (
        <button
          type="button"
          onClick={() => onQuickSearchChange("")}
          aria-label={t("datagrid.clearSearchTooltip")}
          className="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
    <span className="text-muted-foreground hidden text-[10px] lg:inline">
      {t("datagrid.searchScopeHelp", "Loaded page only")}
    </span>
    <form
      onSubmit={onAddFilter}
      className="border-border bg-background dark:bg-background flex items-center gap-1 rounded-md border px-1.5 py-1"
    >
      <Filter className="text-primary ml-1 size-3.5" />
      <span className="text-muted-foreground px-1 font-mono text-[10px] font-semibold tracking-wide uppercase">
        WHERE
      </span>
      <Select
        value={filterCol}
        onValueChange={(value) => value && onFilterColChange(value)}
      >
        <SelectTrigger
          aria-label={t("datagrid.column")}
          className="h-7 w-32 border-transparent bg-transparent text-xs shadow-none"
        >
          <SelectValue placeholder={t("datagrid.column")} />
        </SelectTrigger>
        <SelectContent>
          {table.columns.map((column) => (
            <SelectItem key={column.name} value={column.name}>
              {column.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filterOp}
        onValueChange={(value) => {
          if (
            value === "eq" ||
            value === "neq" ||
            value === "gt" ||
            value === "lt" ||
            value === "contains"
          )
            onFilterOpChange(value);
        }}
      >
        <SelectTrigger
          aria-label={t("datagrid.operator")}
          className="h-7 w-20 border-transparent bg-transparent text-xs shadow-none"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="eq">=</SelectItem>
          {dbType !== "redis" && (
            <>
              <SelectItem value="neq">≠</SelectItem>
              <SelectItem value="gt">&gt;</SelectItem>
              <SelectItem value="lt">&lt;</SelectItem>
            </>
          )}
          <SelectItem value="contains">{t("datagrid.contains")}</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={filterVal}
        onChange={(event) => onFilterValChange(event.target.value)}
        placeholder={t("datagrid.valuePlaceholder")}
        className="h-7 w-32 border-transparent bg-transparent font-mono text-xs shadow-none"
      />
      <Button
        type="submit"
        size="sm"
        className="h-7 px-2.5 text-xs"
        disabled={!filterVal}
      >
        {t("datagrid.apply")}
      </Button>
    </form>
    {filters.map((filter, index) => (
      <Badge
        key={`${filter.column}-${filter.operator}-${index}`}
        variant="secondary"
        className="h-6 gap-1 px-1.5 text-[10px]"
      >
        <span className="font-medium">{filter.column}</span>
        <span>{filter.operator}</span>
        <span>{filter.value}</span>
        <button
          type="button"
          aria-label={`Remove ${filter.column} filter`}
          onClick={() => onRemoveFilter(index)}
        >
          <X className="size-3" />
        </button>
      </Badge>
    ))}
    {filters.length > 0 && (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-[10px]"
        onClick={() => onFiltersChange([])}
      >
        {t("datagrid.clearAll")}
      </Button>
    )}
    <div className="border-border bg-background dark:bg-background flex items-center gap-1 rounded-md border px-1.5 py-1">
      <span className="text-muted-foreground px-1 font-mono text-[10px] font-semibold tracking-wide uppercase">
        ORDER BY
      </span>
      <Select
        value={sortBy || "none"}
        onValueChange={(value) =>
          onSortChange(value === "none" ? "" : value || "", sortDesc)
        }
      >
        <SelectTrigger
          aria-label={t("datagrid.sort", "Sort")}
          className="h-7 w-32 border-transparent bg-transparent text-xs shadow-none"
        >
          <SelectValue placeholder={t("datagrid.sort", "Sort")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            {t("datagrid.noSort", "No sort")}
          </SelectItem>
          {table.columns.map((column) => (
            <SelectItem key={column.name} value={column.name}>
              {column.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!sortBy}
        className="h-7 px-2 text-xs"
        onClick={() => onSortChange(sortBy, !sortDesc)}
      >
        {sortDesc ? "↓ DESC" : "↑ ASC"}
      </Button>
    </div>
  </div>
);
