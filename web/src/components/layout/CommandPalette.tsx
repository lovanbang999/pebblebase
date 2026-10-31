import { useState, useEffect, useRef, useMemo, type FC } from "react";
import { createPortal } from "react-dom";
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
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import type { Connection, TableSchema, SavedQuery } from "@/lib/types";
import type { RecentItem } from "@/lib/recentItems";
import { SHORTCUTS } from "@/lib/platform";
import {
  PALETTE_COMMAND_IDS,
  WORKSPACE_COMMANDS,
  type WorkspaceCommandId,
} from "./workspaceCommands";
import { cn } from "cn";

export type CommandActionId = Extract<
  WorkspaceCommandId,
  | "open_query_console"
  | "open_erd"
  | "open_diff"
  | "run_from_log"
  | "export_csv"
  | "export_json"
  | "toggle_theme"
  | "open_settings"
  | "open_ai_settings"
  | "product_tour"
  | "check_updates"
  | "about"
  | "sign_out"
>;

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
  onFindEverywhere?: (value: string) => void;
  theme: "dark" | "light";
  canManageSettings: boolean;
}

interface PaletteItem {
  id: string;
  type: "recent" | "table" | "connection" | "query" | "action";
  title: string;
  subtitle?: string;
  icon: LucideIcon;
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
  onFindEverywhere,
  theme,
  canManageSettings,
}) => {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Auto focus input when opened
  useEffect(() => {
    if (!isOpen) return;
    setSearch("");
    setSelectedIndex(0);
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const shell = document.querySelector<HTMLElement>("[data-studio-shell]");
    const wasInert = shell?.inert ?? false;
    if (shell) shell.inert = true;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      if (shell) shell.inert = wasInert;
      const previousFocus = restoreFocusRef.current;
      restoreFocusRef.current = null;
      window.requestAnimationFrame(() => {
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, [isOpen]);

  // Actions list definition
  const actionItems: PaletteItem[] = useMemo(() => {
    const icons: Record<CommandActionId, LucideIcon> = {
      open_query_console: Terminal,
      open_erd: Workflow,
      open_diff: GitCompare,
      run_from_log: WandSparkles,
      export_csv: FileSpreadsheet,
      export_json: FileCode,
      toggle_theme: theme === "dark" ? Sun : Moon,
      open_settings: Settings,
      open_ai_settings: Sparkles,
      product_tour: Sparkles,
      check_updates: Sparkles,
      about: Settings,
      sign_out: LogOut,
    };
    return PALETTE_COMMAND_IDS.filter(
      (id) =>
        id === "open_settings" ||
        canManageSettings ||
        id !== "open_ai_settings",
    ).map((id) => {
      const definition = WORKSPACE_COMMANDS[id];
      return {
        id: `action_${id}`,
        type: "action",
        title: t(definition.labelKey, definition.fallback),
        subtitle: definition.shortcut,
        icon: icons[id],
        action: () => onTriggerAction(id),
      };
    });
  }, [t, theme, onTriggerAction, canManageSettings]);

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
    if (term && onFindEverywhere) {
      filteredActionItems.unshift({
        id: "find_everywhere_value",
        type: "action",
        title: `Find “${search.trim()}” everywhere`,
        subtitle: "Search values in the current workspace",
        icon: Search,
        action: () => onFindEverywhere(search.trim()),
      });
    }

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
    onFindEverywhere,
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
    if (e.key === "Tab") {
      e.preventDefault();
      inputRef.current?.focus();
    } else if (e.key === "ArrowDown") {
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

  return createPortal(
    <div
      className="animate-in fade-in fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-16 backdrop-blur-xs duration-150 sm:pt-24"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title", "Command Palette")}
        className="animate-in zoom-in-95 bg-popover text-popover-foreground border-border flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border shadow-xl duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Input */}
        <div className="border-border dark:border-border flex items-center gap-3 border-b px-4 py-3">
          <Search className="text-muted-foreground h-5 w-5 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={flatItems.length > 0}
            aria-haspopup="listbox"
            aria-controls="palette-listbox"
            aria-activedescendant={
              flatItems[selectedIndex]
                ? `palette-option-${selectedIndex}`
                : undefined
            }
            aria-autocomplete="list"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              "palette.placeholder",
              "Type a command or search...",
            )}
            className="text-foreground placeholder:text-muted-foreground flex-1 bg-transparent font-sans text-base focus:outline-none"
          />
          <span className="border-border bg-muted text-muted-foreground dark:border-border dark:bg-muted rounded border px-2 py-0.5 font-mono text-[11px] font-medium">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div
          id="palette-listbox"
          ref={listRef}
          role="listbox"
          aria-label={t("palette.results", "Command Suggestions")}
          className="flex-1 space-y-4 overflow-y-auto p-2 font-sans"
        >
          {flatItems.length === 0 ? (
            <div className="text-muted-foreground py-12 text-center text-sm">
              {t(
                "palette.noResults",
                "No matching commands or entities found.",
              )}
            </div>
          ) : (
            allItems.map((group) => {
              return (
                <div
                  key={group.groupKey}
                  role="group"
                  aria-label={group.groupLabel}
                  className="space-y-1"
                >
                  <div className="text-muted-foreground px-3 py-1 text-[11px] font-semibold tracking-wider uppercase">
                    {group.groupLabel}
                  </div>
                  {group.items.map((item) => {
                    const currentIndex = flatCounter++;
                    const isSelected = currentIndex === selectedIndex;
                    const IconComp = item.icon;

                    return (
                      <div
                        id={`palette-option-${currentIndex}`}
                        key={item.id}
                        role="option"
                        aria-selected={isSelected}
                        data-selected={isSelected}
                        onClick={() => {
                          item.action();
                          onClose();
                        }}
                        onMouseEnter={() => setSelectedIndex(currentIndex)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                          isSelected
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-foreground hover:bg-muted dark:text-foreground dark:hover:bg-muted/60",
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <IconComp
                            className={cn(
                              "h-4 w-4 shrink-0",
                              isSelected
                                ? "text-primary dark:text-primary"
                                : "text-muted-foreground",
                            )}
                          />
                          <span className="truncate">{item.title}</span>
                          {item.subtitle && (
                            <span className="text-muted-foreground max-w-50 truncate text-xs">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        {isSelected && (
                          <span className="bg-primary/10 text-primary dark:bg-primary/60 dark:text-primary rounded px-1.5 py-0.5 font-mono text-[10px] font-medium">
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
        <div className="border-border bg-card text-muted-foreground dark:border-border dark:bg-background/80 flex items-center justify-between border-t px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span>{t("palette.navHint", "Navigation")}:</span>
            <span className="bg-muted text-muted-foreground dark:bg-muted dark:text-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
              ↑↓
            </span>
            <span>{t("palette.selectHint", "Select")}:</span>
            <span className="bg-muted text-muted-foreground dark:bg-muted dark:text-foreground rounded px-1.5 py-0.5 font-mono text-[10px]">
              ↵
            </span>
          </div>
          <div className="hidden text-[11px] sm:block">
            {t("palette.shortcutHint", "Press Cmd+K or Ctrl+K anytime")} (
            {SHORTCUTS.mod}K)
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
