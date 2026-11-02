import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Download, AlertCircle, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "cn";
import type { PipelineResultsPanelProps } from "./types";
import { exportPipelineCSV } from "./utils";

export function PipelineResultsPanel({
  results,
  isRunning,
  error,
  collection,
}: PipelineResultsPanelProps) {
  const { t } = useTranslation();
  const [resultsFilter, setResultsFilter] = useState("");
  const [activeResultsView, setActiveResultsView] = useState<"table" | "json">(
    "table",
  );

  const displayedRows = useMemo(() => {
    if (!results || !results.rows) return [];
    if (!resultsFilter.trim()) return results.rows;
    const term = resultsFilter.toLowerCase();
    return results.rows.filter((row) =>
      Object.values(row).some((v) =>
        v !== null && v !== undefined
          ? String(typeof v === "object" ? JSON.stringify(v) : v)
              .toLowerCase()
              .includes(term)
          : false,
      ),
    );
  }, [results, resultsFilter]);

  const handleExport = () => {
    if (results) {
      exportPipelineCSV(results, collection);
    }
  };

  return (
    <div className="border-border bg-background dark:border-border dark:bg-background flex w-full flex-col overflow-hidden border-t md:w-1/2 md:border-t-0 md:border-l">
      {/* Results Header */}
      <div className="border-border bg-card/70 dark:border-border dark:bg-card/60 flex h-10 shrink-0 items-center justify-between gap-2 border-b px-3">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-xs font-semibold">
            {t("pipeline.results")}
          </span>
          {results && (
            <div className="text-muted-foreground flex items-center gap-1.5 font-mono text-[11px]">
              <span className="bg-success/10 text-success dark:text-success rounded px-1.5 py-0.5 font-semibold">
                {results.rows.length} docs
              </span>
              <span>•</span>
              <span>{results.execution_time_ms.toFixed(1)}ms</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {results && results.rows.length > 0 && (
            <>
              <input
                type="text"
                value={resultsFilter}
                onChange={(e) => setResultsFilter(e.target.value)}
                placeholder="Filter results..."
                className="border-border bg-muted text-foreground dark:border-border dark:bg-muted dark:text-foreground h-6 w-28 rounded border px-1.5 font-mono text-[11px]"
              />
              <div className="border-border bg-muted dark:border-border dark:bg-muted flex items-center rounded border p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveResultsView("table")}
                  className={cn(
                    "cursor-pointer rounded px-1.5 py-0.5 font-mono text-[10px]",
                    activeResultsView === "table"
                      ? "bg-background text-foreground dark:bg-card dark:text-foreground font-medium shadow-2xs"
                      : "text-muted-foreground",
                  )}
                >
                  Table
                </button>
                <button
                  type="button"
                  onClick={() => setActiveResultsView("json")}
                  className={cn(
                    "cursor-pointer rounded px-1.5 py-0.5 font-mono text-[10px]",
                    activeResultsView === "json"
                      ? "bg-background text-foreground dark:bg-card dark:text-foreground font-medium shadow-2xs"
                      : "text-muted-foreground",
                  )}
                >
                  JSON
                </button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleExport}
                className="text-muted-foreground hover:text-foreground dark:hover:text-foreground h-6 px-1.5 font-mono text-[11px]"
                title="Export to CSV"
              >
                <Download className="size-3" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Results Content */}
      <div className="flex-1 overflow-auto p-3">
        {error && (
          <Alert variant="destructive" className="mb-3">
            <AlertCircle className="size-4" />
            <AlertDescription className="font-mono text-xs">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {isRunning ? (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center space-y-2">
            <Loader2 className="text-success size-6 animate-spin" />
            <p className="font-mono text-xs">{t("pipeline.running")}</p>
          </div>
        ) : results ? (
          results.rows.length === 0 ? (
            <div className="text-muted-foreground flex h-full items-center justify-center font-mono text-xs">
              No documents matched pipeline.
            </div>
          ) : activeResultsView === "json" ? (
            <pre className="bg-code text-code-foreground overflow-x-auto rounded-md p-3 font-mono text-xs leading-relaxed select-all">
              {JSON.stringify(displayedRows, null, 2)}
            </pre>
          ) : (
            <div className="border-border overflow-x-auto rounded-md border">
              <table className="w-full text-left font-mono text-xs">
                <thead className="border-border bg-muted text-muted-foreground dark:border-border dark:bg-card/80 dark:text-muted-foreground border-b select-none">
                  <tr>
                    <th className="text-muted-foreground w-10 px-2.5 py-1.5 text-center text-[10px]">
                      #
                    </th>
                    {results.columns.map((col) => (
                      <th key={col} className="px-2.5 py-1.5 font-semibold">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-border/60 divide-y">
                  {displayedRows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-card dark:hover:bg-muted/40 transition-colors"
                    >
                      <td className="text-muted-foreground px-2.5 py-1.5 text-center text-[10px] tabular-nums">
                        {rIdx + 1}
                      </td>
                      {results.columns.map((col) => {
                        const val = row[col];
                        const isObj =
                          val !== null &&
                          val !== undefined &&
                          typeof val === "object";
                        return (
                          <td
                            key={col}
                            className="text-foreground px-2.5 py-1.5 whitespace-nowrap"
                          >
                            {val === null ? (
                              <span className="text-muted-foreground italic">
                                null
                              </span>
                            ) : isObj ? (
                              <span className="bg-muted text-muted-foreground dark:bg-muted dark:text-foreground rounded px-1.5 py-0.5 text-[11px]">
                                {JSON.stringify(val)}
                              </span>
                            ) : (
                              String(val)
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="text-muted-foreground flex h-full flex-col items-center justify-center p-6 text-center">
            <FileCode className="text-success mb-2 size-8 opacity-30" />
            <p className="font-mono text-xs">{t("pipeline.no_results")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
