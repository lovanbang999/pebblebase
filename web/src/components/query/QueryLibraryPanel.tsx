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
  "bg-success/10 dark:bg-success/20 text-success border-success/30",
  "bg-teal-500/10 dark:bg-teal-500/20 text-teal-700 dark:text-teal-300 border-teal-500/30",
  "bg-sky-500/10 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/30",
  "bg-amber-500/10 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
  "bg-rose-500/10 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
  "bg-muted/50 dark:bg-muted text-muted-foreground border-border",
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
      <div className="border-border/80 dark:border-border/80 border-b px-2.5 py-2">
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
              className="text-muted-foreground hover:text-foreground dark:hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
            >
              <span className="text-[10px]">✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Count badge */}
      {!loading && entries.length > 0 && (
        <div className="border-border/80 dark:border-border/80 border-b px-3 py-1.5">
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
            <div className="border-border bg-muted text-muted-foreground dark:border-border dark:bg-card/70 dark:text-muted-foreground flex h-12 w-12 items-center justify-center rounded-2xl border">
              <History className="text-success/70 dark:text-success/70 h-6 w-6" />
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
                <Terminal className="text-success/70 dark:text-success/70 mt-0.5 h-3.5 w-3.5 shrink-0" />
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
                    className="text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground rounded p-1 transition-colors"
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
                    className="text-muted-foreground hover:bg-muted/60 hover:text-success dark:hover:bg-muted dark:hover:text-success rounded p-1 transition-colors"
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
        "hover:border-primary border-l-2 border-transparent",
        "hover:bg-muted/90 dark:hover:bg-muted/60 rounded-r-md",
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
            <span className="text-foreground block truncate text-xs leading-tight font-semibold">
              {q.title}
            </span>
            {q.folder && (
              <span className="py-0.2 border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted/80 dark:text-foreground inline-flex shrink-0 items-center gap-1 rounded border px-1 font-mono text-[9px]">
                <Folder className="text-muted-foreground h-2.5 w-2.5" />
                {q.folder}
              </span>
            )}
          </div>
          <span className="text-muted-foreground mt-0.5 block truncate font-mono text-[10px] leading-tight">
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
              "hover:bg-muted/60 dark:hover:bg-muted rounded p-1 transition-colors",
              q.is_favorite
                ? "text-amber-500 hover:text-amber-600"
                : "text-muted-foreground hover:text-amber-500",
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
            className="text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground rounded p-1 transition-colors"
            title={t("savedQuery.copyQuery")}
          >
            {copiedId === q.id ? (
              <Check className="text-success h-3 w-3" />
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
            className="text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground rounded p-1 transition-colors"
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
              activeTagFilter === tag ? "ring-primary/40 ring-1" : "",
              getTagColor(tag),
            )}
          >
            <Hash className="h-2 w-2" />
            {tag}
          </button>
        ))}
        <span className="text-muted-foreground ml-auto flex shrink-0 items-center gap-0.5 font-mono text-[9px]">
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
            ? "text-success hover:text-success dark:text-success dark:hover:text-success"
            : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
      )}
    >
      {open ? (
        <ChevronDown className="text-muted-foreground h-3 w-3" />
      ) : (
        <ChevronRight className="text-muted-foreground h-3 w-3" />
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
              ? "bg-success/15 text-success dark:text-success"
              : "bg-muted/70 text-muted-foreground dark:bg-muted dark:text-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );

  // --------------------------------------------------------------------------
  return (
    <div className="bg-card/50 text-foreground dark:bg-background/70 dark:text-foreground flex h-full flex-col">
      {/* Header */}
      <div className="border-border bg-background/80 dark:border-border dark:bg-card/60 relative border-b px-3 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="border-primary/25 bg-success/10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border">
            <Library className="text-success dark:text-success h-3.5 w-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-foreground block text-xs font-semibold tracking-tight">
              {t("savedQuery.library")}
            </span>
            <span className="text-muted-foreground mt-0.5 block font-mono text-[10px] leading-none">
              {activeTab === "library"
                ? loading
                  ? "Loading…"
                  : `${queries.length} ${queries.length === 1 ? "query" : "queries"}`
                : t("savedQuery.tabs.history")}
            </span>
          </div>
          {loading && activeTab === "library" && (
            <Loader2 className="text-success dark:text-success h-3.5 w-3.5 shrink-0 animate-spin" />
          )}
        </div>

        {/* Tab Switcher - Segmented Control */}
        <div className="border-border bg-muted/90 dark:border-border dark:bg-card mt-2.5 flex rounded-lg border p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("library")}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-all",
              activeTab === "library"
                ? "bg-background text-foreground dark:bg-muted dark:text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted/50 dark:hover:text-foreground",
            )}
          >
            <Library className="text-success dark:text-success h-3.5 w-3.5" />
            <span>{t("savedQuery.tabs.library")}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={cn(
              "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-md py-1.5 text-[11px] font-medium transition-all",
              activeTab === "history"
                ? "bg-background text-foreground dark:bg-muted dark:text-foreground font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted/50 dark:hover:text-foreground",
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
          <div className="border-border/80 dark:border-border/80 border-b px-2.5 py-2">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t("savedQuery.search")}
                className="focus-visible:border-primary focus-visible:ring-primary/30 border-border bg-background text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-card/90 dark:text-foreground dark:placeholder:text-muted-foreground h-7.5 rounded-md pl-8 text-xs shadow-2xs transition-all focus-visible:ring-1"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="text-muted-foreground hover:text-foreground dark:hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
                >
                  <span className="text-[10px]">✕</span>
                </button>
              )}
            </div>
          </div>

          {/* Folder & Tag filter chips */}
          {(allFolders.length > 0 || allTags.length > 0) && (
            <div className="border-border/80 dark:border-border/80 flex flex-col gap-1.5 border-b px-2.5 py-2">
              {/* Folder filter dropdown / chips */}
              {allFolders.length > 0 && (
                <div className="no-scrollbar flex items-center gap-1 overflow-x-auto py-0.5">
                  <span className="text-muted-foreground shrink-0 font-mono text-[9px] tracking-wider uppercase">
                    Folder:
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveFolderFilter("__all__")}
                    className={cn(
                      "shrink-0 cursor-pointer rounded border px-2 py-0.5 font-mono text-[9px] transition-all",
                      activeFolderFilter === "__all__"
                        ? "border-primary/40 bg-success/15 text-success dark:text-success font-semibold shadow-2xs"
                        : "border-border bg-background text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted/60",
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
                          ? "border-primary/40 bg-success/15 text-success dark:text-success font-semibold shadow-2xs"
                          : "border-border bg-background text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted/60",
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
                  <span className="text-muted-foreground shrink-0 font-mono text-[9px] tracking-wider uppercase">
                    Tag:
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTagFilter("__all__")}
                    className={cn(
                      "shrink-0 cursor-pointer rounded-full border px-2 py-0.5 text-[9px] font-medium transition-all",
                      activeTagFilter === "__all__"
                        ? "border-primary/40 bg-success/15 text-success dark:text-success font-semibold shadow-2xs"
                        : "border-border bg-background text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted/60",
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
                          : "border-border bg-background text-muted-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted/60",
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
                  <div className="border-primary/25 bg-success/10 dark:bg-success/15 flex h-12 w-12 items-center justify-center rounded-2xl border">
                    <Library className="text-success dark:text-success h-6 w-6" />
                  </div>
                  <div className="border-border bg-background dark:border-border dark:bg-card absolute -top-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border shadow-2xs">
                    <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-500" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-foreground text-xs font-semibold">
                    {searchTerm ||
                    activeTagFilter !== "__all__" ||
                    activeFolderFilter !== "__all__"
                      ? "No matching queries"
                      : t("savedQuery.noSaved")}
                  </p>
                  <p className="text-muted-foreground max-w-44 text-[11px] leading-relaxed">
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
              <div className="bg-muted/80 dark:bg-muted/80 mx-3 my-1 h-px" />
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
                                : "border-border dark:border-border ml-3 border-l pl-2"
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
          className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground fixed z-100 min-w-44 overflow-hidden rounded-xl border py-1 shadow-xl"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="border-border dark:border-border mb-1 border-b px-3 py-1.5">
            <p className="text-muted-foreground truncate text-[10px] font-semibold">
              {contextMenu.query.title}
            </p>
          </div>

          {[
            {
              icon: (
                <BookOpen className="text-success dark:text-success h-3.5 w-3.5" />
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
                  <Check className="text-success h-3.5 w-3.5" />
                ) : (
                  <Copy className="text-muted-foreground h-3.5 w-3.5" />
                ),
              label:
                copiedId === contextMenu.query.id
                  ? t("savedQuery.copied")
                  : t("savedQuery.copyQuery"),
              onClick: () => copyQuery(contextMenu.query),
            },
            {
              icon: <Edit2 className="text-muted-foreground h-3.5 w-3.5" />,
              label: t("savedQuery.editQuery"),
              onClick: () => openEdit(contextMenu.query),
            },
            {
              icon: <Download className="text-muted-foreground h-3.5 w-3.5" />,
              label: t("savedQuery.export"),
              onClick: () => exportQuery(contextMenu.query),
            },
          ].map((item, i) => (
            <button
              key={i}
              type="button"
              onClick={item.onClick}
              className="text-foreground hover:bg-muted hover:text-foreground dark:text-foreground dark:hover:bg-muted/80 dark:hover:text-foreground flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] transition-colors"
            >
              {item.icon}
              {item.label}
            </button>
          ))}

          <div className="bg-muted my-1 h-px" />

          <button
            type="button"
            onClick={() => {
              setDeleteTarget(contextMenu.query);
              setContextMenu(null);
            }}
            className="text-destructive hover:bg-destructive/10 dark:text-destructive dark:hover:bg-destructive/40 flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-[12px] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("savedQuery.deleteQuery")}
          </button>
        </div>
      )}

      {/* Delete Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground max-w-sm">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2.5">
              <div className="border-destructive/25 bg-destructive/15 flex h-8 w-8 items-center justify-center rounded-full border">
                <Trash2 className="text-destructive h-4 w-4" />
              </div>
              <DialogTitle className="text-foreground text-sm">
                {t("savedQuery.confirmDelete", {
                  title: deleteTarget?.title ?? "",
                })}
              </DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground ml-10 text-xs">
              {t("savedQuery.confirmDeleteDesc")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-3 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted text-xs"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={confirmDelete}
              className="bg-destructive hover:bg-destructive gap-1.5 text-xs text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("savedQuery.deleteQuery")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground max-w-sm">
          <DialogHeader>
            <div className="mb-1 flex items-center gap-2.5">
              <div className="border-primary/25 bg-success/15 flex h-8 w-8 items-center justify-center rounded-full border">
                <Edit2 className="text-success dark:text-success h-4 w-4" />
              </div>
              <DialogTitle className="text-foreground text-sm">
                {t("savedQuery.editQuery")}
              </DialogTitle>
            </div>
          </DialogHeader>
          <div className="mt-1 space-y-4">
            <div className="space-y-1.5">
              <label className="text-muted-foreground dark:text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                {t("savedQuery.title")}
              </label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="focus-visible:ring-primary/50 border-border bg-card text-foreground dark:border-border dark:bg-background/60 dark:text-foreground text-sm focus-visible:ring-1"
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
            </div>

            {/* Folder Input */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground dark:text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                {t("savedQuery.folder", "Folder")}
              </label>
              <Input
                value={editFolder}
                onChange={(e) => setEditFolder(e.target.value)}
                placeholder={t("savedQuery.folderPlaceholder")}
                className="focus-visible:ring-primary/50 border-border bg-card text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-background/60 dark:text-foreground dark:placeholder:text-muted-foreground font-mono text-sm focus-visible:ring-1"
              />
            </div>

            {/* Tags Input with Autocomplete Chips */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground dark:text-muted-foreground text-[10px] font-semibold tracking-wider uppercase">
                {t("savedQuery.tags")}
              </label>
              <Input
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder={t("savedQuery.tagsPlaceholder")}
                className="focus-visible:ring-primary/50 border-border bg-card text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-background/60 dark:text-foreground dark:placeholder:text-muted-foreground font-mono text-sm focus-visible:ring-1"
              />
              <p className="text-muted-foreground text-[9px]">
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
                            ? "border-primary/40 bg-success/15 text-success dark:text-success font-semibold"
                            : "border-border bg-muted text-muted-foreground hover:bg-muted/60 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:bg-muted",
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
              className="text-muted-foreground hover:bg-muted dark:text-muted-foreground dark:hover:bg-muted text-xs"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveEdit}
              disabled={!editTitle.trim()}
              className="bg-primary hover:bg-primary/90 gap-1.5 text-xs text-white shadow-xs"
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
