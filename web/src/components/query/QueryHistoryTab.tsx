import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Copy,
  Check,
  BookOpen,
  Loader2,
  Clock,
  History,
  Terminal,
} from "lucide-react";
import type { QueryHistoryEntry } from "@/lib/types";
import { fetchQueryHistory } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatRelativeTime, queryPreview } from "./queryLibraryUtils";

export interface QueryHistoryTabProps {
  connectionId: string;
  onLoadQuery: (query: string) => void;
}

export function QueryHistoryTab({
  connectionId,
  onLoadQuery,
}: QueryHistoryTabProps) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<QueryHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const searchRef = useRef(search);
  searchRef.current = search;

  const load = useCallback(
    async (term: string) => {
      if (!connectionId) return;
      setLoading(true);
      try {
        const data = await fetchQueryHistory(connectionId, {
          search: term || undefined,
          limit: 50,
        });
        setEntries(data.entries ?? []);
        setTotal(data.total_count ?? 0);
      } catch {
        setEntries([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [connectionId],
  );

  // Initial load
  useEffect(() => {
    load("");
  }, [load]);

  // Debounced search — refetch 400 ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => load(searchRef.current), 400);
    return () => clearTimeout(timer);
  }, [search, load]);

  const copyEntry = async (entry: QueryHistoryEntry) => {
    await navigator.clipboard.writeText(entry.detail);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-border/80 border-b px-2.5 py-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("savedQuery.history.searchPlaceholder")}
            className="focus-visible:border-primary focus-visible:ring-primary/30 border-border bg-background text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-card/90 dark:text-foreground dark:placeholder:text-muted-foreground h-7.5 rounded-md pl-8 text-xs shadow-2xs transition-all focus-visible:ring-1"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            >
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Count badge */}
      {!loading && entries.length > 0 && (
        <div className="border-border/80 border-b px-3 py-1.5">
          <span className="text-muted-foreground font-mono text-[10px]">
            {total} {total === 1 ? "entry" : "entries"}
            {search && ` matching "${search}"`}
          </span>
        </div>
      )}

      {/* Entry list */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {loading && (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-8">
            <Loader2 className="text-success h-4 w-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center select-none">
            <div className="border-border bg-muted text-muted-foreground dark:bg-card/70 flex h-12 w-12 items-center justify-center rounded-2xl border">
              <History className="text-success/70 h-6 w-6" />
            </div>
            <div className="space-y-1">
              <p className="text-foreground text-xs font-semibold">
                {search ? "No matching history" : t("savedQuery.history.empty")}
              </p>
              {search && (
                <p className="text-muted-foreground max-w-40 text-[10px] leading-relaxed">
                  Try a different search term.
                </p>
              )}
            </div>
          </div>
        )}

        {!loading &&
          entries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "group relative flex cursor-pointer flex-col gap-1.5 px-3 py-2.5",
                "hover:border-primary border-l-2 border-transparent",
                "hover:bg-muted/90 dark:hover:bg-muted/60",
                "rounded-r-md transition-all duration-150",
              )}
              onClick={() => onLoadQuery(entry.detail)}
            >
              {/* SQL preview row */}
              <div className="flex min-w-0 items-start gap-1.5">
                <Terminal className="text-success/70 mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <span className="text-foreground block truncate font-mono text-[11px] leading-tight">
                    {queryPreview(entry.detail)}
                  </span>
                </div>

                {/* Inline actions — hover */}
                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyEntry(entry);
                    }}
                    className="text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted rounded p-1 transition-colors"
                    title={t("savedQuery.copyQuery")}
                  >
                    {copiedId === entry.id ? (
                      <Check className="text-success h-3 w-3" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoadQuery(entry.detail);
                    }}
                    className="text-muted-foreground hover:bg-muted/60 hover:text-success dark:hover:bg-muted rounded p-1 transition-colors"
                    title={t("savedQuery.history.load")}
                  >
                    <BookOpen className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Footer: user + timestamp */}
              <div className="flex min-w-0 items-center gap-1.5 pl-4">
                {entry.username && entry.username !== "anonymous" && (
                  <span className="text-muted-foreground truncate font-mono text-[9px]">
                    {t("savedQuery.history.by")} {entry.username}
                  </span>
                )}
                <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-0.5 font-mono text-[9px]">
                  <Clock className="h-2.5 w-2.5" />
                  {formatRelativeTime(entry.created_at)}
                </span>
              </div>
            </div>
          ))}

        <div className="h-4" />
      </div>
    </div>
  );
}
