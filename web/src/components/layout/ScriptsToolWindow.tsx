import { useEffect, useState } from "react";
import { FileCode2, FolderOpen, Plus, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  Connection,
  QueryHistoryEntry,
  SavedQuery,
  StudioTab,
} from "@/lib/types";
import { fetchQueryHistory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { cn } from "cn";

interface ScriptsToolWindowProps {
  tabs: StudioTab[];
  connections: Connection[];
  activeTabId: string | null;
  savedQueries: SavedQuery[];
  onSelectTab: (tabId: string) => void;
  onNewQuery: () => void;
  onSelectSavedQuery: (query: SavedQuery) => void;
  activeConnectionId?: string;
  canOpenQuery: boolean;
  onOpenSqlFile: () => void;
  onSelectHistory: (connectionId: string, entry: QueryHistoryEntry) => void;
}

export function ScriptsToolWindow({
  tabs,
  connections,
  activeTabId,
  savedQueries,
  onSelectTab,
  onNewQuery,
  onSelectSavedQuery,
  activeConnectionId,
  canOpenQuery,
  onOpenSqlFile,
  onSelectHistory,
}: ScriptsToolWindowProps) {
  const { t } = useTranslation();
  const queryTabs = tabs.filter((tab) => tab.type === "query");
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  useEffect(() => {
    if (!activeConnectionId) {
      setHistory([]);
      return;
    }
    let mounted = true;
    fetchQueryHistory(activeConnectionId, { limit: 25 })
      .then((result) => {
        if (mounted) setHistory(result.entries);
      })
      .catch(() => {
        if (mounted) setHistory([]);
      });
    return () => {
      mounted = false;
    };
  }, [activeConnectionId]);

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-sidebar-border bg-sidebar border-r"
    >
      <SidebarHeader className="border-sidebar-border flex h-9 flex-row items-center justify-between border-b px-2 py-1">
        <span className="text-xs font-medium">
          {t("commands.scriptsWindow", "Scripts")}
        </span>
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!canOpenQuery}
            onClick={onOpenSqlFile}
            aria-label={t("commands.openSqlFile", "Open SQL file")}
            title={t("commands.openSqlFile", "Open SQL file")}
          >
            <FolderOpen className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={!canOpenQuery}
            onClick={onNewQuery}
            aria-label={t("commands.newScript", "New query script")}
            title={t("commands.newScript", "New query script")}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-1.5 py-2">
        <div className="text-muted-foreground mb-1 px-2 font-mono text-[10px] font-semibold tracking-wide uppercase">
          {t("commands.openConsoles", "Open Consoles")}
        </div>
        <div className="max-h-[45%] overflow-auto">
          <div className="space-y-0.5">
            {queryTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectTab(tab.id)}
                className={cn(
                  "hover:bg-sidebar-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs",
                  tab.id === activeTabId &&
                    "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
                )}
              >
                <Terminal className="size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{tab.title}</span>
                <span className="text-muted-foreground max-w-20 truncate text-[10px]">
                  {
                    connections.find((item) => item.id === tab.connectionId)
                      ?.name
                  }
                </span>
              </button>
            ))}
            {queryTabs.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-[11px]">
                {t("commands.noOpenConsoles", "No open query consoles")}
              </p>
            )}
          </div>
        </div>

        <div className="text-muted-foreground mt-4 mb-1 px-2 font-mono text-[10px] font-semibold tracking-wide uppercase">
          {t("commands.savedQueries", "Saved Queries")}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-0.5">
            {savedQueries
              .filter(
                (query) =>
                  !activeConnectionId ||
                  query.connection_id === activeConnectionId,
              )
              .map((query) => (
                <button
                  key={query.id}
                  type="button"
                  onClick={() => onSelectSavedQuery(query)}
                  className="hover:bg-sidebar-accent flex h-7 w-full items-center gap-2 rounded px-2 text-left text-xs"
                >
                  <FileCode2 className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{query.title}</span>
                </button>
              ))}
            {savedQueries.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-[11px]">
                {t(
                  "commands.noSavedQueries",
                  "No saved queries for this connection",
                )}
              </p>
            )}
          </div>
        </div>

        <div className="text-muted-foreground mt-4 mb-1 px-2 font-mono text-[10px] font-semibold tracking-wide uppercase">
          {t("savedQuery.tabs.history", "History")}
        </div>
        <div className="max-h-48 overflow-auto">
          <div className="space-y-0.5">
            {history.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() =>
                  activeConnectionId &&
                  onSelectHistory(activeConnectionId, entry)
                }
                className="hover:bg-sidebar-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
              >
                <Terminal className="text-muted-foreground size-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-mono">
                  {entry.detail ||
                    t("savedQuery.history.emptyQuery", "(empty query)")}
                </span>
                <time className="text-muted-foreground shrink-0 text-[10px]">
                  {new Date(entry.created_at).toLocaleTimeString()}
                </time>
              </button>
            ))}
            {history.length === 0 && (
              <p className="text-muted-foreground px-2 py-2 text-[11px]">
                {t("savedQuery.history.empty", "No query history")}
              </p>
            )}
          </div>
        </div>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
