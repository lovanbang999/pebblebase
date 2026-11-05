import { useState, useEffect, useRef, type KeyboardEvent } from "react";
import {
  Search,
  RotateCcw,
  SlidersHorizontal,
  Clock,
  Code2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  Trash2,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getMongoQueryHistory,
  saveMongoQueryHistory,
  clearMongoQueryHistory,
  type MongoQueryHistoryItem,
} from "@/lib/mongoQueryHistory";
import { ExportQueryCodeModal } from "@/components/modals/ExportQueryCodeModal";

export interface MongoQueryBarProps {
  connId: string;
  tableName: string;
  filter: string;
  onFilterChange: (filter: string) => void;
  project?: string;
  onProjectChange?: (project: string) => void;
  sort?: string;
  onSortChange?: (sort: string) => void;
  collation?: string;
  onCollationChange?: (collation: string) => void;
  maxTimeMS?: number;
  onMaxTimeMSChange?: (ms: number) => void;
  onExecute: () => void;
  onReset: () => void;
}

/**
 * Normalizes relaxed JSON by auto-wrapping in braces and quoting unquoted keys.
 */
export function normalizeRelaxedJson(input: string): {
  normalized: string;
  isValid: boolean;
  error?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) {
    return { normalized: "{}", isValid: true };
  }

  let prepared = trimmed;
  if (!prepared.startsWith("{")) {
    prepared = `{${prepared}}`;
  }

  // Attempt strict JSON parse first
  try {
    JSON.parse(prepared);
    return { normalized: prepared, isValid: true };
  } catch {
    // Attempt relaxed key-quoting: replace unquoted identifier keys with quoted keys
    try {
      const quoted = prepared.replace(
        /([{,]\s*)([a-zA-Z0-9_$-]+)\s*:/g,
        '$1"$2":',
      );
      JSON.parse(quoted);
      return { normalized: quoted, isValid: true };
    } catch (err) {
      return {
        normalized: prepared,
        isValid: false,
        error: err instanceof Error ? err.message : "Invalid JSON syntax",
      };
    }
  }
}

export function MongoQueryBar({
  connId,
  tableName,
  filter,
  onFilterChange,
  project = "",
  onProjectChange,
  sort = "",
  onSortChange,
  collation = "",
  onCollationChange,
  maxTimeMS = 0,
  onMaxTimeMSChange,
  onExecute,
  onReset,
}: MongoQueryBarProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [history, setHistory] = useState<MongoQueryHistoryItem[]>([]);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [localSort, setLocalSort] = useState(sort || "");

  useEffect(() => {
    setLocalSort(sort || "");
  }, [sort]);

  const inputRef = useRef<HTMLInputElement>(null);

  // Load query history on mount and when connection/table changes
  useEffect(() => {
    if (connId && tableName) {
      setHistory(getMongoQueryHistory(connId, tableName));
    }
  }, [connId, tableName]);

  // Validate filter whenever it changes
  useEffect(() => {
    if (!filter.trim()) {
      setValidationError(null);
      return;
    }
    const check = normalizeRelaxedJson(filter);
    if (!check.isValid) {
      setValidationError(check.error ?? "Invalid JSON syntax");
    } else {
      setValidationError(null);
    }
  }, [filter]);

  const handleFilterInputChange = (val: string) => {
    onFilterChange(val);
  };

  const handleRunFind = () => {
    const check = normalizeRelaxedJson(filter);
    if (!check.isValid) {
      setValidationError(check.error ?? "Invalid JSON syntax");
      return;
    }

    if (onSortChange && localSort !== sort) {
      onSortChange(localSort);
    }

    // Save to localStorage history
    saveMongoQueryHistory(connId, tableName, {
      filter,
      project,
      sort: localSort,
      collation,
      maxTimeMS,
    });
    setHistory(getMongoQueryHistory(connId, tableName));

    onExecute();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRunFind();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onReset();
    }
  };

  const handleApplyHistory = (item: MongoQueryHistoryItem) => {
    onFilterChange(item.filter);
    if (onProjectChange) onProjectChange(item.project ?? "");
    setLocalSort(item.sort ?? "");
    if (onSortChange) onSortChange(item.sort ?? "");
    if (onCollationChange) onCollationChange(item.collation ?? "");
    if (onMaxTimeMSChange) onMaxTimeMSChange(item.maxTimeMS ?? 0);
    setValidationError(null);
    if (item.project || item.sort || item.collation || item.maxTimeMS) {
      setShowOptions(true);
    }
  };

  const handleClearHistory = () => {
    clearMongoQueryHistory(connId, tableName);
    setHistory([]);
  };

  return (
    <div className="border-border bg-card/70 dark:border-border dark:bg-card/40 flex flex-col border-b text-xs">
      {/* Primary Query Bar Line */}
      <div className="flex min-h-11 flex-wrap items-center gap-2 px-3 py-1.5">
        {/* Mongo Filter Input */}
        <div className="relative min-w-[280px] flex-1">
          <span className="text-muted-foreground text-primary absolute top-1/2 left-2.5 -translate-y-1/2 font-mono text-[11px] font-semibold">
            Filter:
          </span>
          <input
            ref={inputRef}
            type="text"
            value={filter}
            onChange={(e) => handleFilterInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='{ status: "active", age: { $gte: 18 } }'
            className={cn(
              "bg-background text-foreground placeholder:text-muted-foreground/60 h-7.5 w-full rounded-md border pr-7 pl-15 font-mono text-xs transition-colors focus:ring-1 focus:outline-none",
              validationError
                ? "border-destructive focus:border-destructive focus:ring-destructive"
                : "border-border focus:border-primary/60 focus:ring-primary/30",
            )}
          />
          {filter && (
            <button
              type="button"
              onClick={() => {
                onFilterChange("");
                setValidationError(null);
              }}
              title="Clear Filter"
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer p-0.5"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Options Drawer Toggle Button */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowOptions((prev) => !prev)}
          className={cn(
            "h-7.5 cursor-pointer gap-1.5 px-2.5 font-mono text-xs",
            showOptions && "border-primary/60 bg-muted/60 text-primary",
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          <span>Options</span>
          {showOptions ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </Button>

        {/* Recent Queries History Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7.5 cursor-pointer px-2 font-mono text-xs"
                title="Recent Mongo Queries"
              >
                <Clock className="size-3.5" />
              </Button>
            }
          />
          <DropdownMenuContent
            align="end"
            className="max-h-72 w-80 overflow-y-auto p-1 font-mono text-xs"
          >
            <div className="text-muted-foreground flex items-center justify-between px-2 py-1 text-[11px] font-semibold">
              <span>Recent Queries ({history.length})</span>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearHistory}
                  className="text-destructive flex cursor-pointer items-center gap-1 hover:underline"
                >
                  <Trash2 className="size-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>
            <DropdownMenuSeparator />

            {history.length === 0 ? (
              <div className="text-muted-foreground px-2 py-3 text-center text-[11px] italic">
                No recent queries saved
              </div>
            ) : (
              history.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onClick={() => handleApplyHistory(item)}
                  className="flex cursor-pointer flex-col items-start gap-0.5 py-1.5"
                >
                  <span className="text-foreground w-full truncate font-mono text-xs">
                    {item.filter || "{}"}
                  </span>
                  {(item.project || item.sort) && (
                    <span className="text-muted-foreground w-full truncate font-mono text-[10px]">
                      {item.project ? `Proj: ${item.project} ` : ""}
                      {item.sort ? `Sort: ${item.sort}` : ""}
                    </span>
                  )}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Export to Code Button */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setIsExportOpen(true)}
          className="h-7.5 cursor-pointer gap-1.5 px-2.5 font-mono text-xs"
          title="Export Query to Code (Go, Node.js, Python)"
        >
          <Code2 className="size-3.5" />
          <span>Export</span>
        </Button>

        {/* Find & Reset Execution Buttons */}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReset}
            className="text-muted-foreground hover:text-foreground h-7.5 cursor-pointer px-2.5 font-mono text-xs"
            title="Reset Filters (Esc)"
          >
            <RotateCcw className="mr-1 size-3" />
            <span>Reset</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleRunFind}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-7.5 cursor-pointer gap-1.5 px-3 font-mono text-xs font-semibold shadow-2xs"
            title="Execute Query (Enter)"
          >
            <Search className="size-3.5" />
            <span>Find</span>
          </Button>
        </div>
      </div>

      {/* Syntax Error Warning Line */}
      {validationError && (
        <div className="border-destructive/20 bg-destructive/10 text-destructive flex items-center gap-1.5 border-t px-3 py-1 font-mono text-[11px]">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>Syntax Error: {validationError}</span>
        </div>
      )}

      {/* Collapsible Options Drawer */}
      {showOptions && (
        <div className="border-border/70 bg-card/40 dark:bg-card/20 grid grid-cols-1 gap-2 border-t px-3 py-2 sm:grid-cols-2 md:grid-cols-4">
          {/* Project */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-semibold uppercase">
              Project
            </span>
            <input
              type="text"
              value={project}
              onChange={(e) =>
                onProjectChange && onProjectChange(e.target.value)
              }
              placeholder="{ name: 1, email: 1, _id: 0 }"
              className="border-border bg-background focus:border-primary h-6.5 rounded border px-2 font-mono text-xs focus:outline-none"
            />
          </div>

          {/* Sort */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-semibold uppercase">
              Sort
            </span>
            <input
              type="text"
              value={localSort}
              onChange={(e) => setLocalSort(e.target.value)}
              onBlur={() => onSortChange && onSortChange(localSort)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleRunFind();
                }
              }}
              placeholder="{ createdAt: -1 }"
              className="border-border bg-background focus:border-primary h-6.5 rounded border px-2 font-mono text-xs focus:outline-none"
            />
          </div>

          {/* Collation */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-semibold uppercase">
              Collation
            </span>
            <input
              type="text"
              value={collation}
              onChange={(e) =>
                onCollationChange && onCollationChange(e.target.value)
              }
              placeholder='{ locale: "en", strength: 2 }'
              className="border-border bg-background focus:border-primary h-6.5 rounded border px-2 font-mono text-xs focus:outline-none"
            />
          </div>

          {/* MaxTimeMS */}
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground font-mono text-[10px] font-semibold uppercase">
              MaxTimeMS
            </span>
            <input
              type="number"
              value={maxTimeMS || ""}
              onChange={(e) =>
                onMaxTimeMSChange &&
                onMaxTimeMSChange(e.target.value ? Number(e.target.value) : 0)
              }
              placeholder="5000"
              className="border-border bg-background focus:border-primary h-6.5 rounded border px-2 font-mono text-xs focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Export to Code Modal */}
      <ExportQueryCodeModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        table={tableName}
        filter={filter}
        project={project}
        sort={localSort}
      />
    </div>
  );
}
