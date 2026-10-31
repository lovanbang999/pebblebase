import { readQueryHistory } from "@/lib/queryHistoryStore";
import { STORAGE_KEYS } from "@/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { containsCredentials } from "@/lib/queryHistoryStore";
import { useEffect, useState } from "react";
import { FileCode2, FolderOpen, Plus, Terminal } from "lucide-react";
import { useTranslation } from "react-i18next";
import type {
  Connection,
  QueryHistoryItem,
  SavedQuery,
  StudioTab,
} from "@/lib/types";
import {
  createSavedQuery,
  updateSavedQuery,
  deleteSavedQuery,
  fetchSavedQueries,
} from "@/lib/api";
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
  onSavedQueriesChange: (queries: SavedQuery[]) => void;
  onOpenSqlFile: () => void;
  onSelectHistory: (connectionId: string, query: string) => void;
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
  onSavedQueriesChange,
  onOpenSqlFile,
  onSelectHistory,
}: ScriptsToolWindowProps) {
  const { t } = useTranslation();
  const queryTabs = tabs.filter((tab) => tab.type === "query");
  const [scriptDialog, setScriptDialog] = useState(false);
  const [editingScript, setEditingScript] = useState<SavedQuery | null>(null);
  const [scriptTitle, setScriptTitle] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [scriptError, setScriptError] = useState("");
  const [saving, setSaving] = useState(false);
  const editScript = (script: SavedQuery | null) => {
    setEditingScript(script);
    setScriptTitle(script?.title ?? "");
    setScriptText(
      script?.query ??
        tabs.find((tab) => tab.id === activeTabId)?.state?.queryText ??
        "",
    );
    setScriptError("");
    setScriptDialog(true);
  };
  const saveScript = async () => {
    const connectionId = editingScript?.connection_id ?? activeConnectionId;
    if (!connectionId || !scriptTitle.trim() || !scriptText.trim()) return;
    if (containsCredentials(scriptText)) {
      setScriptError(t("console.storageCredentialWarning"));
      return;
    }
    setSaving(true);
    try {
      if (editingScript)
        await updateSavedQuery(connectionId, editingScript.id, {
          title: scriptTitle.trim(),
          query: scriptText,
        });
      else
        await createSavedQuery(connectionId, {
          title: scriptTitle.trim(),
          query: scriptText,
          tags: [],
          is_favorite: false,
        });
      onSavedQueriesChange(await fetchSavedQueries(connectionId));
      setScriptDialog(false);
    } catch {
      setScriptError(t("savedQuery.operationFailed"));
    } finally {
      setSaving(false);
    }
  };
  const deleteScript = async (script: SavedQuery) => {
    if (!window.confirm(t("savedQuery.deleteConfirm", { title: script.title })))
      return;
    try {
      await deleteSavedQuery(script.connection_id, script.id);
      onSavedQueriesChange(await fetchSavedQueries(script.connection_id));
    } catch {
      setScriptError(t("savedQuery.operationFailed"));
    }
  };
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);
  const [historySearch, setHistorySearch] = useState("");
  useEffect(() => {
    const refresh = () => {
      try {
        setHistory(
          activeConnectionId
            ? readQueryHistory(
                localStorage.getItem(
                  STORAGE_KEYS.queryHistory(activeConnectionId),
                ),
              )
            : [],
        );
      } catch {
        setHistory([]);
      }
    };
    refresh();
    window.addEventListener("pb:query-history-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("pb:query-history-changed", refresh);
      window.removeEventListener("storage", refresh);
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
            disabled={
              !canOpenQuery ||
              connections.find((item) => item.id === activeConnectionId)
                ?.type === "redis"
            }
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
        <Button
          variant="outline"
          size="sm"
          disabled={!activeConnectionId}
          onClick={() => editScript(null)}
        >
          {t("commands.newScript")}
        </Button>
        {scriptError && !scriptDialog && (
          <p role="alert" className="text-destructive text-xs">
            {scriptError}
          </p>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-0.5">
            {savedQueries
              .filter(
                (query) =>
                  !activeConnectionId ||
                  query.connection_id === activeConnectionId,
              )
              .map((query) => (
                <div key={query.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectSavedQuery(query)}
                    className="hover:bg-sidebar-accent flex h-7 min-w-0 flex-1 items-center gap-2 rounded px-2 text-left text-xs"
                  >
                    <FileCode2 className="size-3.5 shrink-0" />
                    <span className="truncate">{query.title}</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("savedQuery.editScript")}
                    title={t("savedQuery.editScript")}
                    onClick={() => editScript(query)}
                  >
                    ✎
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("savedQuery.deleteScript")}
                    title={t("savedQuery.deleteScript")}
                    onClick={() => void deleteScript(query)}
                  >
                    ×
                  </Button>
                </div>
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
        <Input
          aria-label={t("console.historyTitle")}
          value={historySearch}
          onChange={(event) => setHistorySearch(event.target.value)}
          className="h-7 text-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={!activeConnectionId}
          onClick={() => {
            if (!activeConnectionId) return;
            try {
              localStorage.removeItem(
                STORAGE_KEYS.queryHistory(activeConnectionId),
              );
            } catch {
              /* storage unavailable */
            }
            setHistory([]);
            window.dispatchEvent(new Event("pb:query-history-changed"));
          }}
        >
          {t("redis.cli.clearOutput")}
        </Button>
        <div className="max-h-48 overflow-auto">
          <div className="space-y-0.5">
            {history
              .filter((entry) =>
                entry.query.toLowerCase().includes(historySearch.toLowerCase()),
              )
              .map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() =>
                    activeConnectionId &&
                    onSelectHistory(activeConnectionId, entry.query)
                  }
                  className="hover:bg-sidebar-accent flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs"
                >
                  <Terminal className="text-muted-foreground size-3.5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {entry.query ||
                      t("savedQuery.history.emptyQuery", "(empty query)")}
                  </span>
                  <span className="text-muted-foreground text-[10px]">
                    {entry.execution_time_ms ?? 0} ms ·{" "}
                    {entry.error
                      ? t("console.historyFailed")
                      : t("console.historySuccess")}
                  </span>
                  <time className="text-muted-foreground shrink-0 text-[10px]">
                    {new Date(entry.timestamp).toLocaleTimeString()}
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
      <Dialog
        open={scriptDialog}
        onOpenChange={(open) => {
          if (!saving) setScriptDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("savedQuery.editScript")}</DialogTitle>
          </DialogHeader>
          <Input
            aria-label={t("savedQuery.scriptTitle")}
            value={scriptTitle}
            onChange={(event) => setScriptTitle(event.target.value)}
          />
          <textarea
            aria-label={t("savedQuery.scriptBody")}
            value={scriptText}
            onChange={(event) => setScriptText(event.target.value)}
            className="border-border bg-background min-h-48 rounded border p-2 font-mono text-xs"
          />
          {scriptError && (
            <p role="alert" className="text-destructive text-xs">
              {scriptError}
            </p>
          )}
          <Button
            disabled={saving || !scriptTitle.trim() || !scriptText.trim()}
            onClick={() => void saveScript()}
          >
            {t("savedQuery.save")}
          </Button>
        </DialogContent>
      </Dialog>
      <SidebarRail />
    </Sidebar>
  );
}
