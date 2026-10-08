import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Folder,
  FolderOpen,
  type LucideIcon,
} from "lucide-react";
import type {
  SavedQuery,
  SavedQueryUpdateInput,
  QueryHistoryEntry,
} from "@/lib/types";
import {
  fetchSavedQueries,
  updateSavedQuery,
  deleteSavedQuery,
  downloadSavedQuery,
  fetchQueryHistory,
} from "@/lib/api";
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

// Tag color palette — theme-adaptive emerald, teal, sky, amber, rose, zinc
const TAG_COLORS = [
  "bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  "bg-teal-500/10 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30",
  "bg-sky-500/10 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30",
  "bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-rose-500/10 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "bg-zinc-500/10 dark:bg-zinc-500/20 text-zinc-700 dark:text-zinc-300 border-zinc-500/30",
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
    <div className="flex h-full flex-col">
      {/* Search */}
      <div className="border-b border-zinc-200/80 px-2.5 py-2 dark:border-zinc-800/80">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("savedQuery.history.searchPlaceholder")}
            className="h-7.5 rounded-md border-zinc-200 bg-white pl-8 text-xs text-zinc-900 shadow-2xs transition-all placeholder:text-zinc-400 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500/30 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Count badge */}
      {!loading && entries.length > 0 && (
        <div className="border-b border-zinc-200/80 px-3 py-1.5 dark:border-zinc-800/80">
          <span className="font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
            {total} {total === 1 ? "entry" : "entries"}
            {search && ` matching "${search}"`}
          </span>
        </div>
      )}

      {/* Entry list */}
      <div className="custom-scrollbar flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-zinc-400 dark:text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
            <span className="text-xs">Loading…</span>
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center select-none">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-500">
              <History className="h-6 w-6 text-emerald-600/70 dark:text-emerald-400/70" />
            </div>
            <div className="space-y-1">
              <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {search ? "No matching history" : t("savedQuery.history.empty")}
              </p>
              {search && (
                <p className="max-w-40 text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
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
                "border-l-2 border-transparent hover:border-emerald-500",
                "hover:bg-zinc-100/90 dark:hover:bg-zinc-900/60",
                "rounded-r-md transition-all duration-150",
              )}
              onClick={() => onLoadQuery(entry.detail)}
            >
              {/* SQL preview row */}
              <div className="flex min-w-0 items-start gap-1.5">
                <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600/70 dark:text-emerald-400/70" />
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[11px] leading-tight text-zinc-800 dark:text-zinc-200">
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
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    title={t("savedQuery.copyQuery")}
                  >
                    {copiedId === entry.id ? (
                      <Check className="h-3 w-3 text-emerald-500" />
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
                    className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-emerald-600 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
                    title={t("savedQuery.history.load")}
                  >
                    <BookOpen className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Footer: user + timestamp */}
              <div className="flex min-w-0 items-center gap-1.5 pl-4">
                {entry.username && entry.username !== "anonymous" && (
                  <span className="truncate font-mono text-[9px] text-zinc-500 dark:text-zinc-400">
                    {t("savedQuery.history.by")} {entry.username}
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-0.5 font-mono text-[9px] text-zinc-400 dark:text-zinc-500">
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
  const [activeFolderFilter, setActiveFolderFilter] =
    useState<string>("__all__");
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SavedQuery | null>(null);
  const [editTarget, setEditTarget] = useState<SavedQuery | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editFolder, setEditFolder] = useState("");
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
        folder:
          activeFolderFilter !== "__all__" ? activeFolderFilter : undefined,
      });
      setQueries(data);
    } catch {
      setQueries([]);
    } finally {
      setLoading(false);
    }
  }, [connectionId, searchTerm, activeTagFilter, activeFolderFilter]);

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

  // Derive unique tags and folders from ALL queries (unfiltered)
  const [allQueries, setAllQueries] = useState<SavedQuery[]>([]);
  useEffect(() => {
    fetchSavedQueries(connectionId)
      .then(setAllQueries)
      .catch(() => {});
  }, [connectionId, refreshTrigger]);

  const allTags = useMemo(
    () => Array.from(new Set(allQueries.flatMap((q) => q.tags))).sort(),
    [allQueries],
  );

  const allFolders = useMemo(
    () =>
      Array.from(
        new Set(
          allQueries
            .map((q) => q.folder?.trim())
            .filter((f): f is string => Boolean(f)),
        ),
      ).sort(),
    [allQueries],
  );

  const favorites = queries.filter((q) => q.is_favorite);
  const nonFavorites = queries.filter((q) => !q.is_favorite);

  // Group non-favorite queries by folder path
  const folderMap = useMemo(() => {
    const map = new Map<string, SavedQuery[]>();
    nonFavorites.forEach((q) => {
      const folderName = q.folder?.trim() || "";
      if (!map.has(folderName)) {
        map.set(folderName, []);
      }
      map.get(folderName)!.push(q);
    });
    return map;
  }, [nonFavorites]);

  const toggleFolder = (folderName: string) => {
    setOpenFolders((prev) => ({
      ...prev,
      [folderName]: prev[folderName] === undefined ? false : !prev[folderName],
    }));
  };

  const isFolderOpen = (folderName: string) =>
    openFolders[folderName] !== false;

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
    setEditFolder(q.folder || "");
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
        folder: editFolder.trim(),
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

  // Query card item
  const renderQueryItem = (q: SavedQuery) => (
    <div
      key={q.id}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-1.5 px-3 py-2.5 transition-all duration-150",
        "border-l-2 border-transparent hover:border-emerald-500",
        "rounded-r-md hover:bg-zinc-100/90 dark:hover:bg-zinc-900/60",
        q.is_favorite &&
          "border-l-amber-500/80 bg-amber-500/5 dark:bg-amber-500/10",
      )}
      onClick={() => onLoadQuery(q.query)}
      onContextMenu={(e) => handleContextMenu(e, q)}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {q.is_favorite && (
          <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="block truncate text-xs leading-tight font-semibold text-zinc-900 dark:text-zinc-100">
              {q.title}
            </span>
            {q.folder && (
              <span className="py-0.2 inline-flex shrink-0 items-center gap-1 rounded border border-zinc-200 bg-zinc-100 px-1 font-mono text-[9px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/80 dark:text-zinc-300">
                <Folder className="h-2.5 w-2.5 text-zinc-500" />
                {q.folder}
              </span>
            )}
          </div>
          <span className="mt-0.5 block truncate font-mono text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
            {queryPreview(q.query)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleFavorite(q);
            }}
            className={cn(
              "rounded p-1 transition-colors hover:bg-zinc-200/60 dark:hover:bg-zinc-800",
              q.is_favorite
                ? "text-amber-500 hover:text-amber-600"
                : "text-zinc-400 hover:text-amber-500",
            )}
            title={t("savedQuery.favorite")}
          >
            {q.is_favorite ? (
              <Star className="h-3 w-3 fill-current" />
            ) : (
              <StarOff className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              copyQuery(q);
            }}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title={t("savedQuery.copyQuery")}
          >
            {copiedId === q.id ? (
              <Check className="h-3 w-3 text-emerald-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleContextMenu(e, q);
            }}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            title="More options"
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        {q.tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveTagFilter(tag === activeTagFilter ? "__all__" : tag);
            }}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
              "cursor-pointer border transition-all hover:opacity-80",
              activeTagFilter === tag ? "ring-1 ring-emerald-500/40" : "",
              getTagColor(tag),
            )}
          >
            <Hash className="h-2 w-2" />
            {tag}
          </button>
        ))}
        <span className="ml-auto flex shrink-0 items-center gap-0.5 font-mono text-[9px] text-zinc-400 dark:text-zinc-500">
          <Clock className="h-2.5 w-2.5" />
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
    accent = "default",
    icon: IconComponent,
  }: {
    open: boolean;
    onToggle: () => void;
    label: string;
    count: number;
    accent?: "yellow" | "emerald" | "default";
    icon?: LucideIcon;
  }) => (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "flex w-full cursor-pointer items-center gap-1.5 px-3 py-1.5 transition-colors select-none",
        accent === "yellow"
          ? "text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300"
          : accent === "emerald"
            ? "text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100",
      )}
    >
      {open ? (
        <ChevronDown className="h-3 w-3 text-zinc-400" />
      ) : (
        <ChevronRight className="h-3 w-3 text-zinc-400" />
      )}
      {IconComponent && (
        <IconComponent className="h-3 w-3 shrink-0 fill-current" />
      )}
      <span className="truncate text-[10px] font-semibold tracking-wider uppercase">
        {label}
      </span>
      <span
        className={cn(
          "py-0.2 ml-auto shrink-0 rounded-full px-1.5 font-mono text-[9px] font-medium",
          accent === "yellow"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : accent === "emerald"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
        )}
      >
        {count}
      </span>
    </button>
  );

  // --------------------------------------------------------------------------
  return (
    <div className="flex h-full flex-col bg-zinc-50/50 text-zinc-900 dark:bg-zinc-950/70 dark:text-zinc-100">
      {/* Header */}
      <div className="relative border-b border-zinc-200 bg-white/80 px-3 pt-3 pb-2.5 dark:border-zinc-800 dark:bg-zinc-900/60">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10">
            <Library className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block text-xs font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t("savedQuery.library")}
            </span>
            <span className="mt-0.5 block font-mono text-[10px] leading-none text-zinc-500 dark:text-zinc-400">
              {activeTab === "library"
                ? loading
                  ? "Loading…"
                  : `${queries.length} ${queries.length === 1 ? "query" : "queries"}`
                : t("savedQuery.tabs.history")}
            </span>
          </div>
          {loading && activeTab === "library" && (
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" />
          )}
        </div>

        {/* Tab Switcher - Segmented Control */}
        <div className="mt-2.5 flex rounded-lg border border-zinc-200 bg-zinc-100/90 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setActiveTab("library")}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-all",
              activeTab === "library"
                ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100",
            )}
          >
            <Library className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{t("savedQuery.tabs.library")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-all",
              activeTab === "history"
                ? "bg-white font-semibold text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/50 dark:hover:text-zinc-100",
            )}
          >
            <History className="h-3.5 w-3.5" />
            <span>{t("savedQuery.tabs.history")}</span>
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
          <div className="border-b border-zinc-200/80 px-2.5 py-2 dark:border-zinc-800/80">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("savedQuery.search")}
                className="h-7.5 rounded-md border-zinc-200 bg-white pl-8 text-xs text-zinc-900 shadow-2xs transition-all placeholder:text-zinc-400 focus-visible:border-emerald-500 focus-visible:ring-1 focus-visible:ring-emerald-500/30 dark:border-zinc-800 dark:bg-zinc-900/90 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  <span className="text-[10px]">✕</span>
                </button>
              )}
            </div>
          </div>

          {/* Folder & Tag filter chips */}
          {(allFolders.length > 0 || allTags.length > 0) && (
            <div className="flex flex-col gap-1.5 border-b border-zinc-200/80 px-2.5 py-2 dark:border-zinc-800/80">
              {/* Folder filter dropdown / chips */}
              {allFolders.length > 0 && (
                <div className="no-scrollbar flex items-center gap-1 overflow-x-auto py-0.5">
                  <span className="shrink-0 font-mono text-[9px] tracking-wider text-zinc-400 uppercase">
                    Folder:
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveFolderFilter("__all__")}
                    className={cn(
                      "shrink-0 cursor-pointer rounded border px-2 py-0.5 font-mono text-[9px] transition-all",
                      activeFolderFilter === "__all__"
                        ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-700 shadow-2xs dark:text-emerald-400"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                    )}
                  >
                    All
                  </button>
                  {allFolders.map((fName) => (
                    <button
                      key={fName}
                      type="button"
                      onClick={() =>
                        setActiveFolderFilter(
                          activeFolderFilter === fName ? "__all__" : fName,
                        )
                      }
                      className={cn(
                        "shrink-0 cursor-pointer rounded border px-2 py-0.5 font-mono text-[9px] transition-all",
                        activeFolderFilter === fName
                          ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-700 shadow-2xs dark:text-emerald-400"
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                      )}
                    >
                      {fName}
                    </button>
                  ))}
                </div>
              )}

              {/* Tag filter chips */}
              {allTags.length > 0 && (
                <div className="no-scrollbar flex items-center gap-1 overflow-x-auto py-0.5">
                  <span className="shrink-0 font-mono text-[9px] tracking-wider text-zinc-400 uppercase">
                    Tag:
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTagFilter("__all__")}
                    className={cn(
                      "shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-[9px] font-medium transition-all",
                      activeTagFilter === "__all__"
                        ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-700 shadow-2xs dark:text-emerald-400"
                        : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                    )}
                  >
                    All
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() =>
                        setActiveTagFilter(
                          activeTagFilter === tag ? "__all__" : tag,
                        )
                      }
                      className={cn(
                        "shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-[9px] font-medium transition-all",
                        activeTagFilter === tag
                          ? cn(
                              getTagColor(tag),
                              "font-semibold shadow-2xs ring-1 ring-current/30",
                            )
                          : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                      )}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Query list / Folder Tree */}
          <div className="custom-scrollbar flex-1 overflow-y-auto">
            {queries.length === 0 && !loading && (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-4 py-10 text-center select-none">
                <div className="relative">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/25 bg-emerald-500/10 dark:bg-emerald-500/15">
                    <Library className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-zinc-200 bg-white shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-500" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                    {searchTerm ||
                    activeTagFilter !== "__all__" ||
                    activeFolderFilter !== "__all__"
                      ? "No matching queries"
                      : t("savedQuery.noSaved")}
                  </p>
                  <p className="max-w-44 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {searchTerm ||
                    activeTagFilter !== "__all__" ||
                    activeFolderFilter !== "__all__"
                      ? "Try adjusting your search, folder, or tag filter."
                      : t("savedQuery.noSavedDesc")}
                  </p>
                </div>
              </div>
            )}

            {/* Favorites Section */}
            {favorites.length > 0 && (
              <div className="mt-1">
                <SectionHeader
                  open={favoritesOpen}
                  onToggle={() => setFavoritesOpen((v) => !v)}
                  label={t("savedQuery.favorites")}
                  count={favorites.length}
                  accent="yellow"
                  icon={Star}
                />
                {favoritesOpen && <div>{favorites.map(renderQueryItem)}</div>}
              </div>
            )}

            {favorites.length > 0 && nonFavorites.length > 0 && (
              <div className="mx-3 my-1 h-px bg-zinc-200/80 dark:bg-zinc-800/80" />
            )}

            {/* Collapsible Folder Tree */}
            {nonFavorites.length > 0 && (
              <div className={favorites.length === 0 ? "mt-1" : ""}>
                {Array.from(folderMap.entries()).map(
                  ([folderName, folderQueries]) => {
                    const isUncategorized = !folderName;
                    const displayLabel = isUncategorized
                      ? t("savedQuery.uncategorized", "Uncategorized")
                      : folderName;
                    const isOpen = isFolderOpen(folderName);
                    const FolderIconComponent = isOpen ? FolderOpen : Folder;

                    return (
                      <div
                        key={folderName || "__uncategorized__"}
                        className="mb-1"
                      >
                        <SectionHeader
                          open={isOpen}
                          onToggle={() => toggleFolder(folderName)}
                          label={displayLabel}
                          count={folderQueries.length}
                          accent={isUncategorized ? "default" : "emerald"}
                          icon={
                            isUncategorized ? undefined : FolderIconComponent
                          }
                        />
                        {isOpen && (
                          <div
                            className={
                              isUncategorized
                                ? ""
                                : "ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-800"
                            }
                          >
                            {folderQueries.map(renderQueryItem)}
                          </div>
                        )}
                      </div>
                    );
                  },
                )}
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
          className="fixed z-100 min-w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 text-zinc-900 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="mb-1 border-b border-zinc-100 px-3 py-1.5 dark:border-zinc-800">
            <p className="truncate text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
              {contextMenu.query.title}
            </p>
          </div>

          {[
            {
              icon: (
                <BookOpen className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ),
              label: t("savedQuery.loadQuery"),
              onClick: () => {
                onLoadQuery(contextMenu.query.query);
                setContextMenu(null);
              },
            },
            {
              icon:
                copiedId === contextMenu.query.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                ),
              label:
                copiedId === contextMenu.query.id
                  ? t("savedQuery.copied")
                  : t("savedQuery.copyQuery"),
              onClick: () => copyQuery(contextMenu.query),
            },
            {
              icon: <Edit2 className="h-3.5 w-3.5 text-zinc-400" />,
              label: t("savedQuery.editQuery"),
              onClick: () => openEdit(contextMenu.query),
            },
            {
              icon: <Download className="h-3.5 w-3.5 text-zinc-400" />,
              label: t("savedQuery.export"),
              onClick: () => exportQuery(contextMenu.query),
            },
          ].map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={item.onClick}
              className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/80 dark:hover:text-zinc-100"
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />

          <button
            type="button"
            onClick={() => {
              setDeleteTarget(contextMenu.query);
              setContextMenu(null);
            }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("savedQuery.deleteQuery")}
          </button>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-rose-500/25 bg-rose-500/15">
                <Trash2 className="h-4 w-4 text-rose-500" />
              </div>
              <DialogTitle className="text-sm text-zinc-900 dark:text-zinc-100">
                {t("savedQuery.confirmDelete", {
                  title: deleteTarget?.title ?? "",
                })}
              </DialogTitle>
            </div>
            <DialogDescription className="ml-10 text-xs text-zinc-500 dark:text-zinc-400">
              {t("savedQuery.confirmDeleteDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              className="text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={confirmDelete}
              className="gap-1.5 bg-rose-600 text-xs text-white hover:bg-rose-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("savedQuery.deleteQuery")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="max-w-sm border-zinc-200 bg-white text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-500/25 bg-emerald-500/15">
                <Edit2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <DialogTitle className="text-sm text-zinc-900 dark:text-zinc-100">
                {t("savedQuery.editQuery")}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="mt-1 space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                {t("savedQuery.title")}
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="border-zinc-200 bg-zinc-50 text-sm text-zinc-900 focus-visible:ring-1 focus-visible:ring-emerald-500/50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100"
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
            </div>

            {/* Folder Input */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                {t("savedQuery.folder", "Folder")}
              </label>
              <Input
                value={editFolder}
                onChange={(e) => setEditFolder(e.target.value)}
                placeholder={t("savedQuery.folderPlaceholder")}
                className="border-zinc-200 bg-zinc-50 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-emerald-500/50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
            </div>

            {/* Tags Input with Autocomplete Chips */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                {t("savedQuery.tags")}
              </label>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={t("savedQuery.tagsPlaceholder")}
                className="border-zinc-200 bg-zinc-50 font-mono text-sm text-zinc-900 placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-emerald-500/50 dark:border-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-100 dark:placeholder:text-zinc-500"
              />
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500">
                Separate tags with commas
              </p>
              {allTags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {allTags.map((tName) => {
                    const currentTags = editTags
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean);
                    const isSelected = currentTags.includes(tName);
                    return (
                      <button
                        key={tName}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setEditTags(
                              currentTags.filter((t) => t !== tName).join(", "),
                            );
                          } else {
                            setEditTags([...currentTags, tName].join(", "));
                          }
                        }}
                        className={cn(
                          "cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[9px] transition-all",
                          isSelected
                            ? "border-emerald-500/40 bg-emerald-500/15 font-semibold text-emerald-700 dark:text-emerald-400"
                            : "border-zinc-200 bg-zinc-100 text-zinc-600 hover:bg-zinc-200/60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800",
                        )}
                      >
                        +#{tName}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditTarget(null)}
              className="text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveEdit}
              disabled={!editTitle.trim()}
              className="gap-1.5 bg-emerald-600 text-xs text-white shadow-xs hover:bg-emerald-500"
            >
              <Check className="h-3.5 w-3.5" />
              {t("savedQuery.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
