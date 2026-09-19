import { useState, useEffect, useRef, useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import {
  Search,
  Table as TableIcon,
  Database,
  Terminal,
  Clock,
  Sun,
  Moon,
  Settings,
  LogOut,
  Workflow,
  FileSpreadsheet,
  FileCode,
  Sparkles,
  GitCompare,
} from "lucide-react";
import type { Connection, TableSchema, SavedQuery } from "@/lib/types";
import type { RecentItem } from "@/lib/recentItems";
import { SHORTCUTS } from "@/lib/platform";
import { cn } from "cn";

export type CommandActionId =
  | "open_query_console"
  | "open_erd"
  | "open_diff"
  | "open_migration"
  | "export_csv"
  | "export_json"
  | "toggle_theme"
  | "open_settings"
  | "product_tour"
  | "sign_out";

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  connections: Connection[];
  activeConnection?: Connection | null;
  onSelectConnection: (conn: Connection) => void;
  tables: TableSchema[];
  onSelectTable: (tableName: string) => void;
  savedQueries: SavedQuery[];
  onSelectSavedQuery: (query: SavedQuery) => void;
  recentItems: RecentItem[];
  onTriggerAction: (actionId: CommandActionId) => void;
  theme: "dark" | "light";
}

interface PaletteItem {
  id: string;
  type: "recent" | "table" | "connection" | "query" | "action";
  title: string;
  subtitle?: string;
  icon: any;
  action: () => void;
}

export const CommandPalette: FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  connections,
  onSelectConnection,
  tables,
  onSelectTable,
  savedQueries,
  onSelectSavedQuery,
  recentItems,
  onTriggerAction,
  theme,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto focus input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch("");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Actions list definition
  const actionItems: PaletteItem[] = useMemo(() => {
    const isDark = theme === "dark";
    return [
      {
        id: "action_open_query_console",
        type: "action",
        title: t("palette.openQueryConsole", "Open Query Console"),
        subtitle: "Alt+Q",
        icon: Terminal,
        action: () => onTriggerAction("open_query_console"),
      },
      {
        id: "action_open_erd",
        type: "action",
        title: t("palette.openERD", "Open ERD Diagram"),
        subtitle: "Alt+E",
        icon: Workflow,
        action: () => onTriggerAction("open_erd"),
      },
      {
        id: "action_open_diff",
        type: "action",
        title: t("diff.title", "Schema Diff"),
        subtitle: t("diff.subtitle", "Compare schemas between two databases"),
        icon: GitCompare,
        action: () => onTriggerAction("open_diff"),
      },
      {
        id: "action_open_migration",
        type: "action",
        title: t("palette.openMigration", "Open Migration Runner"),
        subtitle: "DDL & Schema Updates",
        icon: Sparkles,
        action: () => onTriggerAction("open_migration"),
      },
      {
        id: "action_export_csv",
        type: "action",
        title: t("palette.exportTableCsv", "Export Current Table (CSV)"),
        subtitle: "Data Grid",
        icon: FileSpreadsheet,
        action: () => onTriggerAction("export_csv"),
      },
      {
        id: "action_export_json",
        type: "action",
        title: t("palette.exportTableJson", "Export Current Table (JSON)"),
        subtitle: "Data Grid",
        icon: FileCode,
        action: () => onTriggerAction("export_json"),
      },
      {
        id: "action_toggle_theme",
        type: "action",
        title: t("palette.toggleTheme", "Toggle Dark / Light Mode"),
        subtitle: isDark ? "Current: Dark" : "Current: Light",
        icon: isDark ? Sun : Moon,
        action: () => onTriggerAction("toggle_theme"),
      },
      {
        id: "action_open_settings",
        type: "action",
        title: t("palette.openSettings", "Open Admin & Settings"),
        subtitle: "Users & Passwords",
        icon: Settings,
        action: () => onTriggerAction("open_settings"),
      },
      {
        id: "action_product_tour",
        type: "action",
        title: t("palette.productTour", "Take Product Tour"),
        subtitle: "Quickstart & Guide",
        icon: Sparkles,
        action: () => onTriggerAction("product_tour"),
      },
      {
        id: "action_sign_out",
        type: "action",
        title: t("palette.signOut", "Sign Out"),
        subtitle: "Authentication",
        icon: LogOut,
        action: () => onTriggerAction("sign_out"),
      },
    ];
  }, [t, theme, onTriggerAction]);

  // Build items grouped into categories
  const allItems: {
    groupKey: string;
    groupLabel: string;
    items: PaletteItem[];
  }[] = useMemo(() => {
    const term = search.trim().toLowerCase();

    // Helper fuzzy match
    const matches = (text?: string) => {
      if (!term) return true;
      if (!text) return false;
      return text.toLowerCase().includes(term);
    };

    // 1. Recent Items
    const recentPaletteItems: PaletteItem[] = recentItems
      .filter((r) => matches(r.title) || matches(r.subtitle))
      .map((r) => {
        let icon = Clock;
        let action = () => {};
        if (r.type === "table") {
          icon = TableIcon;
          action = () => onSelectTable(r.title);
        } else if (r.type === "connection") {
          icon = Database;
          const conn = connections.find((c) => c.id === r.id);
          action = () => {
            if (conn) onSelectConnection(conn);
          };
        } else if (r.type === "query") {
          icon = Terminal;
          const sq = savedQueries.find((q) => q.id === r.id);
          action = () => {
            if (sq) onSelectSavedQuery(sq);
          };
        }
        return {
          id: `recent_${r.type}_${r.id}`,
          type: "recent",
          title: r.title,
          subtitle: r.subtitle || r.type,
          icon,
          action,
        };
      });

    // 2. Tables
    const tablePaletteItems: PaletteItem[] = tables
      .filter((tbl) => matches(tbl.name))
      .map((tbl) => ({
        id: `table_${tbl.name}`,
        type: "table",
        title: tbl.name,
        subtitle: `${tbl.columns.length} columns`,
        icon: TableIcon,
        action: () => onSelectTable(tbl.name),
      }));

    // 3. Connections
    const connPaletteItems: PaletteItem[] = connections
      .filter((c) => matches(c.name) || matches(c.type) || matches(c.db_name))
      .map((c) => ({
        id: `conn_${c.id}`,
        type: "connection",
        title: c.name,
        subtitle: `${c.type.toUpperCase()} • ${c.db_name || c.host || "local"}`,
        icon: Database,
        action: () => onSelectConnection(c),
      }));

    // 4. Saved Queries
    const queryPaletteItems: PaletteItem[] = savedQueries
      .filter((q) => matches(q.title) || matches(q.query))
      .map((q) => ({
        id: `query_${q.id}`,
        type: "query",
        title: q.title,
        subtitle: q.query.slice(0, 40) + (q.query.length > 40 ? "..." : ""),
        icon: Terminal,
        action: () => onSelectSavedQuery(q),
      }));

    // 5. Actions
    const filteredActionItems = actionItems.filter(
      (a) => matches(a.title) || matches(a.subtitle),
    );

    const groups = [];

    if (!term && recentPaletteItems.length > 0) {
      groups.push({
        groupKey: "recent",
        groupLabel: t("palette.recent", "Recent Items"),
        items: recentPaletteItems,
      });
    }

    if (tablePaletteItems.length > 0) {
      groups.push({
        groupKey: "tables",
        groupLabel: t("palette.tables", "Tables"),
        items: tablePaletteItems,
      });
    }

    if (connPaletteItems.length > 0) {
      groups.push({
        groupKey: "connections",
        groupLabel: t("palette.connections", "Connections"),
        items: connPaletteItems,
      });
    }

    if (queryPaletteItems.length > 0) {
      groups.push({
        groupKey: "queries",
        groupLabel: t("palette.queries", "Saved Queries"),
        items: queryPaletteItems,
      });
    }

    if (filteredActionItems.length > 0) {
      groups.push({
        groupKey: "actions",
        groupLabel: t("palette.actions", "Actions"),
        items: filteredActionItems,
      });
    }

    return groups;
  }, [
    search,
    recentItems,
    tables,
    connections,
    savedQueries,
    actionItems,
    t,
    onSelectTable,
    onSelectConnection,
    onSelectSavedQuery,
  ]);

  // Flattened list for keyboard indexing
  const flatItems = useMemo(() => {
    return allItems.flatMap((g) => g.items);
  }, [allItems]);

  // Reset selectedIndex if flatItems shrinks
  useEffect(() => {
    if (selectedIndex >= flatItems.length) {
      setSelectedIndex(Math.max(0, flatItems.length - 1));
    }
  }, [flatItems.length, selectedIndex]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const selectedEl = listRef.current.querySelector('[data-selected="true"]');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, flatItems.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(
        (prev) => (prev - 1 + flatItems.length) % Math.max(1, flatItems.length),
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const currentItem = flatItems[selectedIndex];
      if (currentItem) {
        currentItem.action();
        onClose();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  let flatCounter = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Input */}
        <div className="flex items-center px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 gap-3">
          <Search className="w-5 h-5 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              "palette.placeholder",
              "Type a command or search...",
            )}
            className="flex-1 bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none text-base font-sans"
          />
          <span className="text-[11px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 font-mono">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-4 font-sans"
        >
          {flatItems.length === 0 ? (
            <div className="py-12 text-center text-zinc-400 text-sm">
              {t(
                "palette.noResults",
                "No matching commands or entities found.",
              )}
            </div>
          ) : (
            allItems.map((group) => {
              return (
                <div key={group.groupKey} className="space-y-1">
                  <div className="px-3 py-1 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    {group.groupLabel}
                  </div>
                  {group.items.map((item) => {
                    const currentIndex = flatCounter++;
                    const isSelected = currentIndex === selectedIndex;
                    const IconComp = item.icon;

                    return (
                      <div
                        key={item.id}
                        data-selected={isSelected}
                        onClick={() => {
                          item.action();
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        className={cn(
                          "flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors text-sm",
                          isSelected
                            ? "bg-indigo-600/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 font-medium"
                            : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/60",
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <IconComp
                            className={cn(
                              "w-4 h-4 shrink-0",
                              isSelected
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-zinc-400",
                            )}
                          />
                          <span className="truncate">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-xs text-zinc-400 truncate max-w-50">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-mono">
                            ↵ Enter
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2 bg-zinc-50 dark:bg-zinc-950/80 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span>Navigation:</span>
            <span className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-600 dark:text-zinc-300">
              ↑↓
            </span>
            <span>Select:</span>
            <span className="font-mono bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[10px] text-zinc-600 dark:text-zinc-300">
              ↵
            </span>
          </div>
          <div className="hidden sm:block text-[11px]">
            {t("palette.shortcutHint", "Press Cmd+K or Ctrl+K anytime")} (
            {SHORTCUTS.mod}K)
          </div>
        </div>
      </div>
    </div>
  );
};
