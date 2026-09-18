import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Star,
  StarOff,
  Search,
  Trash2,
  Download,
  Copy,
  Check,
  Edit2,
  BookOpen,
  ChevronRight,
  ChevronDown,
  Loader2,
  Hash,
  Clock,
  MoreHorizontal,
  Library,
  History,
  Terminal,
} from "lucide-react";
import type {
  SavedQuery,
  SavedQueryUpdateInput,
  QueryHistoryEntry,
} from "../lib/types";
import {
  fetchSavedQueries,
  updateSavedQuery,
  deleteSavedQuery,
  downloadSavedQuery,
  fetchQueryHistory,
} from "../lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "cn";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------
interface QueryLibraryPanelProps {
  connectionId: string;
  onLoadQuery: (query: string) => void;
  refreshTrigger?: number;
}

type ActiveTab = "library" | "history";

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Extract the first meaningful line of a SQL/Mongo query for preview */
function queryPreview(q: string): string {
  const line = q.trim().split("\n")[0] ?? "";
  return line.length > 48 ? line.slice(0, 48) + "…" : line;
}

// Tag color palette — cycles through indigo, violet, sky, emerald, amber
const TAG_COLORS = [
  "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
  "bg-violet-500/20 text-violet-300 border-violet-500/30",
  "bg-sky-500/20 text-sky-300 border-sky-500/30",
  "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "bg-rose-500/20 text-rose-300 border-rose-500/30",
];
const tagColorMap = new Map<string, string>();
let tagColorIdx = 0;
function getTagColor(tag: string): string {
  if (!tagColorMap.has(tag)) {
    tagColorMap.set(tag, TAG_COLORS[tagColorIdx % TAG_COLORS.length]);
    tagColorIdx++;
  }
  return tagColorMap.get(tag)!;
}

// --------------------------------------------------------------------------
// QueryHistoryTab — standalone inner component
// --------------------------------------------------------------------------
function QueryHistoryTab({
  connectionId,
  onLoadQuery,
}: {
  connectionId: string;
  onLoadQuery: (query: string) => void;
}) {
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
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2.5 py-2 border-b border-white/5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("savedQuery.history.searchPlaceholder")}
            className={cn(
              "h-7 pl-8 text-xs bg-white/6 border-white/10 text-white/80",
              "placeholder:text-white/25 rounded-md",
              "focus-visible:ring-1 focus-visible:ring-violet-500/60 focus-visible:border-violet-500/40",
              "transition-all",
            )}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
            >
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Count badge */}
      {!loading && entries.length > 0 && (
        <div className="px-3 py-1.5 border-b border-white/5">
          <span className="text-[9px] text-white/25 font-mono">
            {total} {total === 1 ? "entry" : "entries"}
            {search && ` matching "${search}"`}
          </span>
        </div>
      )}

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-white/30">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs">Loading…</span>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 h-full px-4 py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-violet-500/10 to-purple-500/10 border border-white/[0.07] flex items-center justify-center">
              <History className="w-6 h-6 text-violet-400/40" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-white/40">
                {search ? "No matching history" : t("savedQuery.history.empty")}
              </p>
              {search && (
                <p className="text-[10px] text-white/20 leading-relaxed max-w-40">
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
                "group relative flex flex-col gap-1.5 px-3 py-2.5 cursor-pointer",
                "border-l-2 border-transparent hover:border-violet-500/60",
                "hover:bg-linear-to-r hover:from-violet-500/8 hover:to-transparent",
                "transition-all duration-150 rounded-r-md",
              )}
              onClick={() => onLoadQuery(entry.detail)}
            >
              {/* SQL preview row */}
              <div className="flex items-start gap-1.5 min-w-0">
                <Terminal className="w-3 h-3 mt-0.5 shrink-0 text-violet-400/50" />
                <div className="flex-1 min-w-0">
                  <span className="block truncate text-[11px] font-mono text-white/70 leading-tight">
                    {queryPreview(entry.detail)}
                  </span>
                </div>

                {/* Inline actions — hover */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyEntry(entry);
                    }}
                    className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-white/70 transition-colors"
                    title={t("savedQuery.copyQuery")}
                  >
                    {copiedId === entry.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoadQuery(entry.detail);
                    }}
                    className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-violet-400 transition-colors"
                    title={t("savedQuery.history.load")}
                  >
                    <BookOpen className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Footer: user + timestamp */}
              <div className="flex items-center gap-1.5 pl-4 min-w-0">
                {entry.username && entry.username !== "anonymous" && (
                  <span className="text-[9px] text-white/25 font-mono truncate">
                    {t("savedQuery.history.by")} {entry.username}
                  </span>
                )}
                <span className="ml-auto text-[9px] text-white/20 flex items-center gap-0.5 shrink-0">
                  <Clock className="w-2.5 h-2.5" />
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

// --------------------------------------------------------------------------
// QueryLibraryPanel
// --------------------------------------------------------------------------
export default function QueryLibraryPanel({
  connectionId,
  onLoadQuery,
  refreshTrigger,
}: QueryLibraryPanelProps) {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<ActiveTab>("library");
  const [queries, setQueries] = useState<SavedQuery[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTagFilter, setActiveTagFilter] = useState<string>("__all__");
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedQuery | null>(null);
  const [editTarget, setEditTarget] = useState<SavedQuery | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState("");
  const [contextMenu, setContextMenu] = useState<{
    query: SavedQuery;
    x: number;
    y: number;
  } | null>(null);
  const contextRef = useRef<HTMLDivElement>(null);

  // Load saved queries
  const load = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const data = await fetchSavedQueries(connectionId, {
        search: searchTerm || undefined,
        tag: activeTagFilter !== "__all__" ? activeTagFilter : undefined,
      });
      setQueries(data);
    } catch {
      setQueries([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, searchTerm, activeTagFilter]);

  useEffect(() => {
    load();
  }, [load, refreshTrigger]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        contextRef.current &&
        !contextRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    };
    if (contextMenu) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [contextMenu]);

  // Derive unique tags from ALL queries (unfiltered)
  const [allQueries, setAllQueries] = useState<SavedQuery[]>([]);
  useEffect(() => {
    fetchSavedQueries(connectionId)
      .then(setAllQueries)
      .catch(() => {});
  }, [connectionId, refreshTrigger]);
  const allTags = Array.from(new Set(allQueries.flatMap((q) => q.tags))).sort();

  const favorites = queries.filter((q) => q.is_favorite);
  const nonFavorites = queries.filter((q) => !q.is_favorite);

  // Actions
  const toggleFavorite = async (q: SavedQuery) => {
    try {
      await updateSavedQuery(connectionId, q.id, {
        is_favorite: !q.is_favorite,
      });
      load();
    } catch {
      /* ignore */
    }
  };

  const copyQuery = async (q: SavedQuery) => {
    await navigator.clipboard.writeText(q.query);
    setCopiedId(q.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSavedQuery(connectionId, deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch {
      /* ignore */
    }
  };

  const openEdit = (q: SavedQuery) => {
    setEditTarget(q);
    setEditTitle(q.title);
    setEditTags(q.tags.join(", "));
    setContextMenu(null);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    const tags = editTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      await updateSavedQuery(connectionId, editTarget.id, {
        title: editTitle,
        tags,
      } as SavedQueryUpdateInput);
      setEditTarget(null);
      load();
    } catch {
      /* ignore */
    }
  };

  const exportQuery = async (q: SavedQuery) => {
    try {
      await downloadSavedQuery(connectionId, q.id, q.title);
    } catch {
      /* ignore */
    }
    setContextMenu(null);
  };

  const handleContextMenu = (e: React.MouseEvent, q: SavedQuery) => {
    e.preventDefault();
    setContextMenu({ query: q, x: e.clientX, y: e.clientY });
  };

  // Query card
  const renderQueryItem = (q: SavedQuery) => (
    <div
      key={q.id}
      className={cn(
        "group relative flex flex-col gap-1.5 px-3 py-2.5 cursor-pointer",
        "border-l-2 border-transparent hover:border-indigo-500/60",
        "hover:bg-linear-to-r hover:from-indigo-500/8 hover:to-transparent",
        "transition-all duration-150 rounded-r-md",
        q.is_favorite && "border-l-yellow-400/40 bg-yellow-400/3",
      )}
      onClick={() => onLoadQuery(q.query)}
      onContextMenu={(e) => handleContextMenu(e, q)}
    >
      <div className="flex items-start gap-1.5 min-w-0">
        {q.is_favorite && (
          <Star className="w-3 h-3 mt-0.5 shrink-0 fill-yellow-400 text-yellow-400" />
        )}
        <div className="flex-1 min-w-0">
          <span className="block truncate text-[12.5px] font-semibold text-white/85 leading-tight">
            {q.title}
          </span>
          <span className="block truncate text-[10px] text-white/30 font-mono mt-0.5 leading-tight">
            {queryPreview(q.query)}
          </span>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(q);
            }}
            className={cn(
              "p-1 rounded hover:bg-white/10 transition-colors",
              q.is_favorite
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-white/25 hover:text-yellow-400",
            )}
            title={t("savedQuery.favorite")}
          >
            {q.is_favorite ? (
              <Star className="w-3 h-3 fill-current" />
            ) : (
              <StarOff className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              copyQuery(q);
            }}
            className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-white/70 transition-colors"
            title={t("savedQuery.copyQuery")}
          >
            {copiedId === q.id ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, q);
            }}
            className="p-1 rounded hover:bg-white/10 text-white/25 hover:text-white/70 transition-colors"
            title="More options"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        {q.tags.map((tag) => (
          <button
            key={tag}
            onClick={(e) => {
              e.stopPropagation();
              setActiveTagFilter(tag === activeTagFilter ? "__all__" : tag);
            }}
            className={cn(
              "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold",
              "border transition-all hover:opacity-80",
              activeTagFilter === tag ? "ring-1 ring-indigo-400/40" : "",
              getTagColor(tag),
            )}
          >
            <Hash className="w-2 h-2" />
            {tag}
          </button>
        ))}
        <span className="ml-auto text-[9px] text-white/20 flex items-center gap-0.5 shrink-0">
          <Clock className="w-2.5 h-2.5" />
          {formatRelativeTime(q.updated_at)}
        </span>
      </div>
    </div>
  );

  const SectionHeader = ({
    open,
    onToggle,
    label,
    count,
    accent,
  }: {
    open: boolean;
    onToggle: () => void;
    label: string;
    count: number;
    accent?: "yellow" | "default";
  }) => (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1.5 w-full px-3 py-1.5 transition-colors",
        accent === "yellow"
          ? "text-yellow-400/60 hover:text-yellow-400"
          : "text-white/25 hover:text-white/50",
      )}
    >
      {open ? (
        <ChevronDown className="w-3 h-3" />
      ) : (
        <ChevronRight className="w-3 h-3" />
      )}
      {accent === "yellow" && <Star className="w-3 h-3 fill-current" />}
      <span className="text-[10px] font-bold uppercase tracking-widest">
        {label}
      </span>
      <span
        className={cn(
          "ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full",
          accent === "yellow"
            ? "bg-yellow-400/15 text-yellow-400/70"
            : "bg-white/8 text-white/30",
        )}
      >
        {count}
      </span>
    </button>
  );

  // --------------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-[#13141f] border-r border-white/[0.07]">
      {/* Header */}
      <div className="relative px-3 pt-3 pb-2.5 border-b border-white/[0.07] bg-linear-to-b from-indigo-500/5 to-transparent">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-500/20 border border-indigo-500/30 shrink-0">
            <Library className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-[11px] font-bold text-white/80 tracking-wide">
              {t("savedQuery.library")}
            </span>
            <span className="block text-[9px] text-white/30 leading-none mt-0.5">
              {activeTab === "library"
                ? loading
                  ? "Loading…"
                  : `${queries.length} ${queries.length === 1 ? "query" : "queries"}`
                : t("savedQuery.tabs.history")}
            </span>
          </div>
          {loading && activeTab === "library" && (
            <Loader2 className="w-3.5 h-3.5 text-indigo-400/60 animate-spin shrink-0" />
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex mt-2.5 rounded-md overflow-hidden border border-white/8 bg-white/3">
          <button
            onClick={() => setActiveTab("library")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-semibold transition-all",
              activeTab === "library"
                ? "bg-indigo-500/20 text-indigo-300 border-r border-white/8"
                : "text-white/30 hover:text-white/60 hover:bg-white/5 border-r border-white/8",
            )}
          >
            <Library className="w-3 h-3" />
            {t("savedQuery.tabs.library")}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] font-semibold transition-all",
              activeTab === "history"
                ? "bg-violet-500/20 text-violet-300"
                : "text-white/30 hover:text-white/60 hover:bg-white/5",
            )}
          >
            <History className="w-3 h-3" />
            {t("savedQuery.tabs.history")}
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === "history" ? (
        <QueryHistoryTab
          connectionId={connectionId}
          onLoadQuery={onLoadQuery}
        />
      ) : (
        <>
          {/* Search */}
          <div className="px-2.5 py-2 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("savedQuery.search")}
                className={cn(
                  "h-7 pl-8 text-xs bg-white/6 border-white/10 text-white/80",
                  "placeholder:text-white/25 rounded-md",
                  "focus-visible:ring-1 focus-visible:ring-indigo-500/60 focus-visible:border-indigo-500/40",
                  "transition-all",
                )}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  <span className="text-[10px]">✕</span>
                </button>
              )}
            </div>
          </div>

          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1 px-2.5 py-1.5 border-b border-white/5">
              <button
                onClick={() => setActiveTagFilter("__all__")}
                className={cn(
                  "px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all",
                  activeTagFilter === "__all__"
                    ? "bg-indigo-500/25 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/10"
                    : "bg-white/5 text-white/35 border-white/10 hover:bg-white/10 hover:text-white/50",
                )}
              >
                All
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() =>
                    setActiveTagFilter(
                      activeTagFilter === tag ? "__all__" : tag,
                    )
                  }
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all",
                    activeTagFilter === tag
                      ? cn(getTagColor(tag), "ring-1 ring-current/30")
                      : "bg-white/5 text-white/35 border-white/10 hover:bg-white/10 hover:text-white/50",
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          {/* Query list */}
          <div className="flex-1 overflow-y-auto">
            {queries.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center gap-3 h-full px-4 py-10 text-center">
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-indigo-500/10 to-purple-500/10 border border-white/[0.07] flex items-center justify-center">
                    <Library className="w-6 h-6 text-indigo-400/40" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-indigo-500/20 border border-white/10 flex items-center justify-center">
                    <Star className="w-2 h-2 text-yellow-400/60" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white/40">
                    {searchTerm || activeTagFilter !== "__all__"
                      ? "No matching queries"
                      : t("savedQuery.noSaved")}
                  </p>
                  <p className="text-[10px] text-white/20 leading-relaxed max-w-40">
                    {searchTerm || activeTagFilter !== "__all__"
                      ? "Try adjusting your search or tag filter."
                      : t("savedQuery.noSavedDesc")}
                  </p>
                </div>
              </div>
            )}

            {favorites.length > 0 && (
              <div className="mt-1">
                <SectionHeader
                  open={favoritesOpen}
                  onToggle={() => setFavoritesOpen((v) => !v)}
                  label={t("savedQuery.favorites")}
                  count={favorites.length}
                  accent="yellow"
                />
                {favoritesOpen && <div>{favorites.map(renderQueryItem)}</div>}
              </div>
            )}

            {favorites.length > 0 && nonFavorites.length > 0 && (
              <div className="h-px bg-white/5 mx-3 my-1" />
            )}

            {nonFavorites.length > 0 && (
              <div className={favorites.length === 0 ? "mt-1" : ""}>
                <SectionHeader
                  open={allOpen}
                  onToggle={() => setAllOpen((v) => !v)}
                  label={t("savedQuery.all")}
                  count={nonFavorites.length}
                />
                {allOpen && <div>{nonFavorites.map(renderQueryItem)}</div>}
              </div>
            )}

            <div className="h-4" />
          </div>
        </>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          className={cn(
            "fixed z-100 min-w-44 py-1 overflow-hidden",
            "bg-[#1c1d2e] border border-white/10 rounded-xl shadow-2xl",
            "shadow-black/40 backdrop-blur-sm",
          )}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 mb-1 border-b border-white/8">
            <p className="text-[10px] font-semibold text-white/40 truncate">
              {contextMenu.query.title}
            </p>
          </div>

          {[
            {
              icon: <BookOpen className="w-3.5 h-3.5 text-indigo-400" />,
              label: t("savedQuery.loadQuery"),
              onClick: () => {
                onLoadQuery(contextMenu.query.query);
                setContextMenu(null);
              },
            },
            {
              icon:
                copiedId === contextMenu.query.id ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-white/40" />
                ),
              label:
                copiedId === contextMenu.query.id
                  ? t("savedQuery.copied")
                  : t("savedQuery.copyQuery"),
              onClick: () => copyQuery(contextMenu.query),
            },
            {
              icon: <Edit2 className="w-3.5 h-3.5 text-white/40" />,
              label: t("savedQuery.editQuery"),
              onClick: () => openEdit(contextMenu.query),
            },
            {
              icon: <Download className="w-3.5 h-3.5 text-white/40" />,
              label: t("savedQuery.export"),
              onClick: () => exportQuery(contextMenu.query),
            },
          ].map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-white/75 hover:bg-indigo-500/10 hover:text-white transition-colors"
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <div className="h-px bg-white/8 my-1" />

          <button
            onClick={() => {
              setDeleteTarget(contextMenu.query);
              setContextMenu(null);
            }}
            className="flex items-center gap-2.5 w-full px-3 py-2 text-[12px] text-red-400/80 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("savedQuery.deleteQuery")}
          </button>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-[#1c1d2e] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-full bg-red-500/15 border border-red-500/25 flex items-center justify-center">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <DialogTitle className="text-white text-sm">
                {t("savedQuery.confirmDelete", {
                  title: deleteTarget?.title ?? "",
                })}
              </DialogTitle>
            </div>
            <DialogDescription className="text-white/45 text-xs ml-10">
              {t("savedQuery.confirmDeleteDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              className="text-white/60 hover:text-white hover:bg-white/10 text-xs"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-500 text-white text-xs gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t("savedQuery.deleteQuery")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="bg-[#1c1d2e] border-white/10 text-white max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-full bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                <Edit2 className="w-4 h-4 text-indigo-400" />
              </div>
              <DialogTitle className="text-white text-sm">
                {t("savedQuery.editQuery")}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                {t("savedQuery.title")}
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="bg-white/5 border-white/10 text-white text-sm focus-visible:ring-1 focus-visible:ring-indigo-500/50"
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                {t("savedQuery.tags")}
              </label>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={t("savedQuery.tagsPlaceholder")}
                className="bg-white/5 border-white/10 text-white text-sm placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-indigo-500/50"
              />
              <p className="text-[9px] text-white/25">
                Separate tags with commas
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditTarget(null)}
              className="text-white/60 hover:text-white hover:bg-white/10 text-xs"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={saveEdit}
              disabled={!editTitle.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              {t("savedQuery.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
