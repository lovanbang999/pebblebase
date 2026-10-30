import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface GridPaginationFooterProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: readonly number[] | number[];
  t: (key: string, opts?: any) => string;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

export const GridPaginationFooter: React.FC<GridPaginationFooterProps> =
  React.memo(
    ({
      page,
      pageSize,
      totalCount,
      totalPages,
      onPageChange,
      onPageSizeChange,
      pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
      t,
    }) => {
      return (
        <div className="flex h-8 min-w-0 shrink-0 items-center justify-between gap-2 border-t border-zinc-200 bg-zinc-50/80 px-3 font-sans text-xs text-zinc-500 sm:px-4 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-400">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="truncate">
              {totalCount === 0
                ? `0 ${t("datagrid.records")}`
                : `${t("datagrid.showing")} ${page * pageSize + 1} - ${Math.min((page + 1) * pageSize, totalCount)} ${t("datagrid.of")} ${totalCount}`}
            </span>
            <div className="ml-1 hidden shrink-0 items-center gap-1.5 sm:ml-2 sm:flex">
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {t("datagrid.perPage")}
              </span>
              <Select
                value={String(pageSize)}
                onValueChange={(val) => val && onPageSizeChange(Number(val))}
              >
                <SelectTrigger
                  aria-label={t("datagrid.perPage")}
                  className="h-6 w-16 px-2 py-0 font-mono text-xs"
                >
                  <SelectValue placeholder={String(pageSize)} />
                </SelectTrigger>
                <SelectContent side="top" align="start" className="min-w-16">
                  {pageSizeOptions.map((sizeOpt) => (
                    <SelectItem key={sizeOpt} value={String(sizeOpt)}>
                      {sizeOpt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] whitespace-nowrap text-zinc-500 dark:text-zinc-400">
              {t("datagrid.page")} {page + 1} {t("datagrid.of")} {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={page <= 0}
                onClick={() => onPageChange(page - 1)}
                aria-label={t("datagrid.previousPage")}
                title={t("datagrid.previousPage")}
                className="text-zinc-700 dark:text-zinc-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                disabled={page + 1 >= totalPages}
                onClick={() => onPageChange(page + 1)}
                aria-label={t("datagrid.nextPage")}
                title={t("datagrid.nextPage")}
                className="text-zinc-700 dark:text-zinc-300"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      );
    },
  );
GridPaginationFooter.displayName = "GridPaginationFooter";
