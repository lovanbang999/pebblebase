import { isWritingStatement } from "@/lib/querySafety";
import CodeMirror from "@uiw/react-codemirror";
import { StreamLanguage } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";
import { studioEditorTheme } from "@/lib/editorTheme";
import { parseRedisArguments, isRedisReadCommand } from "@/lib/redisCommand";
import {
  appendQueryHistory,
  readQueryHistory,
  containsCredentials,
} from "@/lib/queryHistoryStore";
import { STORAGE_KEYS } from "@/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useState,
  useRef,
  useEffect,
  useMemo,
  type FC,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Terminal,
  Trash2,
  CornerDownLeft,
  AlertTriangle,
  Clock,
  Sparkles,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { executeRawQuery } from "@/lib/api";
import type { RawQueryResult } from "@/lib/types";

interface RedisCliConsoleProps {
  connId: string;
  isReadOnly?: boolean;
  connectionName?: string;
  environment?: string;
  initialCommand?: string;
  workspaceTabId?: string;
  onCommandChange?: (command: string) => void;
}

interface ConsoleHistoryItem {
  id: string;
  command: string;
  timestamp: string;
  result?: RawQueryResult;
  error?: string;
}

interface CommandDef {
  name: string;
  syntax: string;
  category: "String" | "Hash" | "List" | "Set" | "ZSet" | "Key" | "Server";
  destructive?: boolean;
}

const REDIS_COMMANDS: CommandDef[] = [
  // Strings
  { name: "GET", syntax: "GET key", category: "String" },
  {
    name: "SET",
    syntax: "SET key value [EX seconds] [NX|XX]",
    category: "String",
  },
  { name: "MGET", syntax: "MGET key [key ...]", category: "String" },
  {
    name: "MSET",
    syntax: "MSET key value [key value ...]",
    category: "String",
  },
  { name: "INCR", syntax: "INCR key", category: "String" },
  { name: "DECR", syntax: "DECR key", category: "String" },
  { name: "APPEND", syntax: "APPEND key value", category: "String" },
  { name: "STRLEN", syntax: "STRLEN key", category: "String" },

  // Hashes
  { name: "HGET", syntax: "HGET key field", category: "Hash" },
  {
    name: "HSET",
    syntax: "HSET key field value [field value ...]",
    category: "Hash",
  },
  { name: "HGETALL", syntax: "HGETALL key", category: "Hash" },
  { name: "HDEL", syntax: "HDEL key field [field ...]", category: "Hash" },
  { name: "HEXISTS", syntax: "HEXISTS key field", category: "Hash" },
  { name: "HKEYS", syntax: "HKEYS key", category: "Hash" },
  { name: "HVALS", syntax: "HVALS key", category: "Hash" },
  { name: "HLEN", syntax: "HLEN key", category: "Hash" },

  // Lists
  {
    name: "LPUSH",
    syntax: "LPUSH key element [element ...]",
    category: "List",
  },
  {
    name: "RPUSH",
    syntax: "RPUSH key element [element ...]",
    category: "List",
  },
  { name: "LPOP", syntax: "LPOP key [count]", category: "List" },
  { name: "RPOP", syntax: "RPOP key [count]", category: "List" },
  { name: "LRANGE", syntax: "LRANGE key start stop", category: "List" },
  { name: "LLEN", syntax: "LLEN key", category: "List" },
  { name: "LINDEX", syntax: "LINDEX key index", category: "List" },

  // Sets
  { name: "SADD", syntax: "SADD key member [member ...]", category: "Set" },
  { name: "SMEMBERS", syntax: "SMEMBERS key", category: "Set" },
  { name: "SREM", syntax: "SREM key member [member ...]", category: "Set" },
  { name: "SISMEMBER", syntax: "SISMEMBER key member", category: "Set" },
  { name: "SCARD", syntax: "SCARD key", category: "Set" },

  // Sorted Sets
  {
    name: "ZADD",
    syntax: "ZADD key [NX|XX] [GT|LT] [CH] score member [score member ...]",
    category: "ZSet",
  },
  {
    name: "ZRANGE",
    syntax:
      "ZRANGE key min max [BYSCORE|BYLEX] [REV] [LIMIT offset count] [WITHSCORES]",
    category: "ZSet",
  },
  { name: "ZREM", syntax: "ZREM key member [member ...]", category: "ZSet" },
  { name: "ZCARD", syntax: "ZCARD key", category: "ZSet" },
  { name: "ZSCORE", syntax: "ZSCORE key member", category: "ZSet" },

  // Key operations
  { name: "KEYS", syntax: "KEYS pattern", category: "Key" },
  {
    name: "SCAN",
    syntax: "SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]",
    category: "Key",
  },
  { name: "TYPE", syntax: "TYPE key", category: "Key" },
  { name: "TTL", syntax: "TTL key", category: "Key" },
  { name: "PTTL", syntax: "PTTL key", category: "Key" },
  { name: "EXPIRE", syntax: "EXPIRE key seconds", category: "Key" },
  { name: "PERSIST", syntax: "PERSIST key", category: "Key" },
  { name: "DEL", syntax: "DEL key [key ...]", category: "Key" },
  { name: "EXISTS", syntax: "EXISTS key [key ...]", category: "Key" },

  // Server
  { name: "INFO", syntax: "INFO [section]", category: "Server" },
  { name: "DBSIZE", syntax: "DBSIZE", category: "Server" },
  { name: "PING", syntax: "PING [message]", category: "Server" },
  { name: "TIME", syntax: "TIME", category: "Server" },
  { name: "SLOWLOG GET", syntax: "SLOWLOG GET [count]", category: "Server" },
  { name: "CONFIG GET", syntax: "CONFIG GET parameter", category: "Server" },
  {
    name: "FLUSHDB",
    syntax: "FLUSHDB [ASYNC|SYNC]",
    category: "Server",
    destructive: true,
  },
  {
    name: "FLUSHALL",
    syntax: "FLUSHALL [ASYNC|SYNC]",
    category: "Server",
    destructive: true,
  },
];

const isReadOnlyCommand = isRedisReadCommand;
const redisLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.sol()) {
      stream.eatSpace();
      if (stream.match(/[A-Za-z]+/)) return "keyword";
    }
    if (stream.match(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/)) return "string";
    stream.next();
    return null;
  },
});

export const RedisCliConsole: FC<RedisCliConsoleProps> = ({
  connId,
  isReadOnly = false,
  connectionName,
  environment,
  initialCommand,
  workspaceTabId,
  onCommandChange,
}) => {
  const { t } = useTranslation();

  const [inputCommand, setInputCommand] = useState(initialCommand ?? "");
  const [history, setHistory] = useState<ConsoleHistoryItem[]>([]);
  const [pastCommands, setPastCommands] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [selectedSuggestIndex, setSelectedSuggestIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Destructive command guard modal
  const [pendingDestructiveCmd, setPendingDestructiveCmd] = useState<
    string | null
  >(null);

  const inputRef = useRef<EditorView | null>(null);
  const runningRef = useRef(false);
  const runInputRef = useRef<() => void>(() => {});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const historyKey = STORAGE_KEYS.queryHistory(connId);
  const [savedHistory, setSavedHistory] = useState(() => {
    try {
      return readQueryHistory(localStorage.getItem(historyKey));
    } catch {
      return [];
    }
  });
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleCommand = (event: Event) => {
      const detail = (event as CustomEvent<{ tabId: string; command: string }>)
        .detail;
      if (!workspaceTabId || detail?.tabId !== workspaceTabId) return;
      if (detail.command === "history") setHistoryOpen(true);
      if (detail.command === "run") runInputRef.current();
    };
    window.addEventListener("pb:query-command", handleCommand);
    return () => window.removeEventListener("pb:query-command", handleCommand);
  }, [workspaceTabId]);
  useEffect(() => {
    const refresh = () => {
      try {
        setSavedHistory(readQueryHistory(localStorage.getItem(historyKey)));
      } catch {
        /* storage unavailable */
      }
    };
    window.addEventListener("pb:query-history-changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("pb:query-history-changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [historyKey]);
  // Scroll to bottom when history grows
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, isRunning]);

  // Compute autocompletion suggestions based on current input command
  const suggestions = useMemo(() => {
    const trimmed = inputCommand.trimStart();
    if (!trimmed) return [];
    const firstWord = trimmed.split(/\s+/)[0].toUpperCase();
    return REDIS_COMMANDS.filter(
      (cmd) =>
        cmd.name.startsWith(firstWord) ||
        cmd.name.replace(/\s+/, " ").startsWith(trimmed.toUpperCase()),
    ).slice(0, 8);
  }, [inputCommand]);

  // Handle command execution
  const executeCommand = async (cmd: string, destructiveConfirmed = false) => {
    if (runningRef.current) return;
    const lines = cmd
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;
    try {
      for (const line of lines) {
        parseRedisArguments(line);
        if (containsCredentials(line))
          throw new Error(t("console.storageCredentialWarning"));
        if (isReadOnly && !isReadOnlyCommand(line))
          throw new Error(t("redis.cli.readOnlyError"));
      }
    } catch (error) {
      setHistory((previous) =>
        [
          ...previous,
          {
            id: crypto.randomUUID(),
            command: "(input rejected)",
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : "Invalid command",
          },
        ].slice(-50),
      );
      return;
    }
    if (
      !destructiveConfirmed &&
      lines.some((line) => /^FLUSH(?:DB|ALL)\b/i.test(line))
    ) {
      setPendingDestructiveCmd(cmd);
      return;
    }
    const writes = lines.filter((line) =>
      isWritingStatement(line, "redis"),
    ).length;
    if (
      environment === "production" &&
      writes &&
      !window.confirm(
        t("redis.cli.productionConfirm", {
          connection: connectionName ?? connId,
          count: writes,
        }),
      )
    )
      return;
    runningRef.current = true;
    setIsRunning(true);
    try {
      for (const line of lines) {
        if (!(await runCommandDirectly(line))) break;
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  };

  const runCommandDirectly = async (command: string) => {
    if (isReadOnly && !isReadOnlyCommand(command)) {
      setHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          command,
          timestamp: new Date().toISOString(),
          error: t("redis.cli.readOnlyError"),
        },
      ]);
      setInputCommand("");
      return false;
    }
    // Record in input history
    setPastCommands((prev) => {
      const filtered = prev.filter((c) => c !== command);
      return [...filtered, command].slice(-50);
    });
    setHistoryIndex(-1);
    setInputCommand("");
    setShowSuggestions(false);
    const item: ConsoleHistoryItem = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      command,
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await executeRawQuery(connId, command);
      item.result = res;
    } catch (err: unknown) {
      item.error = err instanceof Error ? err.message : String(err);
    } finally {
      setHistory((prev) => [...prev, item].slice(-50));
      setSavedHistory((previous) => {
        let existing = previous;
        try {
          existing = readQueryHistory(localStorage.getItem(historyKey));
        } catch {
          /* storage unavailable */
        }
        const next = appendQueryHistory(existing, {
          id: item.id,
          query: command,
          timestamp: Date.parse(item.timestamp),
          execution_time_ms: item.result?.execution_time_ms,
          error: item.error,
        });
        try {
          localStorage.setItem(historyKey, JSON.stringify(next));
          queueMicrotask(() =>
            window.dispatchEvent(new Event("pb:query-history-changed")),
          );
        } catch {
          /* Storage may be full. */
        }
        return next;
      });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
    return !item.error;
  };

  useEffect(() => {
    runInputRef.current = () => {
      void executeCommand(inputCommand);
    };
  });

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "e") {
      e.preventDefault();
      e.stopPropagation();
      setHistoryOpen(true);
      return;
    }
    if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.metaKey) return;
    if (inputCommand.includes("\n") && ["ArrowUp", "ArrowDown"].includes(e.key))
      return;
    // Navigate suggestions with Tab or Up/Down
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "Tab") {
        e.preventDefault();
        const selected = suggestions[selectedSuggestIndex] || suggestions[0];
        setInputCommand(selected.name + " ");
        setShowSuggestions(false);
        return;
      }
      if (e.key === "ArrowDown" && historyIndex === -1) {
        e.preventDefault();
        setSelectedSuggestIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp" && historyIndex === -1) {
        e.preventDefault();
        setSelectedSuggestIndex((prev) =>
          prev <= 0 ? suggestions.length - 1 : prev - 1,
        );
        return;
      }
    }

    if (e.key === "Enter" || e.key === "F5") {
      e.preventDefault();
      e.stopPropagation();
      executeCommand(inputCommand);
      return;
    }

    // Command History navigation (Up / Down)
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (pastCommands.length === 0) return;
      const nextIndex =
        historyIndex === -1
          ? pastCommands.length - 1
          : Math.max(0, historyIndex - 1);
      setHistoryIndex(nextIndex);
      setInputCommand(pastCommands[nextIndex]);
      setShowSuggestions(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex === -1) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= pastCommands.length) {
        setHistoryIndex(-1);
        setInputCommand("");
      } else {
        setHistoryIndex(nextIndex);
        setInputCommand(pastCommands[nextIndex]);
      }
      setShowSuggestions(false);
      return;
    }

    if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleApplySuggestion = (cmd: CommandDef) => {
    setInputCommand(cmd.name + " ");
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const handleCopyResult = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="bg-code text-code-foreground flex h-full flex-col font-mono">
      {/* CLI Header */}
      <div className="border-border bg-code/60 flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="text-success h-4 w-4" />
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
            {t("redis.cli.title")}
          </h2>
          <span className="text-muted-foreground text-[11px]">
            {t("redis.cli.historyTip")}
          </span>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="text-muted-foreground hover:bg-muted hover:text-foreground h-7 text-xs"
          onClick={() => setHistory([])}
          disabled={history.length === 0}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {t("redis.cli.clearOutput")}
        </Button>
      </div>

      <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(true)}>
        {t("console.historyTitle")} (Ctrl/Cmd+E)
      </Button>
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t("console.historyTitle")} — {connectionName ?? connId}
            </DialogTitle>
          </DialogHeader>
          <Input
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder={t("console.historyTitle")}
          />
          <Button
            variant="outline"
            onClick={() => {
              setSavedHistory([]);
              try {
                localStorage.removeItem(historyKey);
                window.dispatchEvent(new Event("pb:query-history-changed"));
              } catch {
                /* storage unavailable */
              }
            }}
          >
            {t("redis.cli.clearOutput")}
          </Button>
          <div className="max-h-96 space-y-2 overflow-auto">
            {savedHistory
              .filter((entry) =>
                entry.query.toLowerCase().includes(historySearch.toLowerCase()),
              )
              .map((entry) => (
                <button
                  key={entry.id}
                  className="border-border block w-full rounded border p-2 text-left text-xs"
                  onClick={() => {
                    setInputCommand(entry.query);
                    setHistoryOpen(false);
                    inputRef.current?.focus();
                  }}
                >
                  <pre>{entry.query}</pre>
                  <span>
                    {connectionName ?? connId} ·{" "}
                    {new Date(entry.timestamp).toLocaleString()} ·{" "}
                    {entry.execution_time_ms ?? 0} ms ·{" "}
                    {entry.error
                      ? t("console.historyFailed")
                      : t("console.historySuccess")}
                  </span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
      {/* Terminal Output Area */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {history.length === 0 && !isRunning && (
          <div className="text-muted-foreground flex flex-col items-center justify-center py-12 text-center">
            <Terminal className="text-muted-foreground mb-2 h-8 w-8" />
            <p>{t("redis.cli.emptyOutput")}</p>
            <div className="mt-4 flex max-w-lg flex-wrap justify-center gap-1.5">
              {["INFO", "DBSIZE", "KEYS *", "SLOWLOG GET 10", "PING"].map(
                (sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => {
                      setInputCommand(sample);
                      inputRef.current?.focus();
                    }}
                    className="hover:border-primary/50 border-border bg-code text-muted-foreground hover:text-success rounded border px-2 py-0.5 text-[11px] transition-colors"
                  >
                    {sample}
                  </button>
                ),
              )}
            </div>
          </div>
        )}

        {history.map((item) => (
          <div key={item.id} className="space-y-1.5">
            {/* Command Header line */}
            <div className="text-muted-foreground flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-success font-bold">redis&gt;</span>
                <span className="text-code-foreground font-semibold">
                  {item.command}
                </span>
              </div>
              <div className="text-muted-foreground flex items-center gap-3 text-[11px]">
                {item.result && (
                  <>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {t("redis.cli.executionTime", {
                        ms: item.result.execution_time_ms.toFixed(1),
                      })}
                    </span>
                    {item.result.is_mutation && (
                      <Badge
                        variant="outline"
                        className="border-warning/30 bg-warning/10 text-warning px-1 py-0 text-[10px]"
                      >
                        {t("redis.cli.rowsAffected", {
                          count: item.result.rows_affected,
                        })}
                      </Badge>
                    )}
                  </>
                )}
                <span>
                  {new Date(item.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
            </div>

            {/* Error or Result Display */}
            {item.error ? (
              <div className="rounded border border-red-500/30 bg-red-950/30 p-2 text-red-400">
                (error) {item.error}
              </div>
            ) : item.result ? (
              <div className="group border-border bg-code/40 relative rounded border p-2.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="bg-muted text-muted-foreground hover:text-foreground absolute top-2 right-2 h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() =>
                    handleCopyResult(
                      item.id,
                      JSON.stringify(item.result?.rows, null, 2),
                    )
                  }
                  title={t("redis.cli.copyOutput")}
                >
                  {copiedId === item.id ? (
                    <Check className="text-success h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
                <RenderCliResult result={item.result} />
              </div>
            ) : null}
          </div>
        ))}

        {isRunning && (
          <div className="text-muted-foreground flex items-center gap-2">
            <span className="text-success font-bold">redis&gt;</span>
            <Loader2 className="text-success h-3.5 w-3.5 animate-spin" />
            <span className="text-muted-foreground italic">
              {t("redis.cli.running")}
            </span>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Input Prompt & Autocomplete Floating Box */}
      <div className="border-border bg-code relative border-t p-3">
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="border-border bg-code/95 absolute right-3 bottom-full left-3 mb-2 max-h-56 overflow-y-auto rounded-lg border shadow-xl backdrop-blur-md">
            <div className="border-border text-muted-foreground flex items-center justify-between border-b px-3 py-1.5 text-[10px] font-semibold tracking-wider uppercase">
              <span className="flex items-center gap-1">
                <Sparkles className="text-success h-3 w-3" />{" "}
                {t("redis.cli.autocompleteSuggestions")}
              </span>
              <span>{t("redis.cli.pressTabToApply")}</span>
            </div>
            {suggestions.map((cmd, idx) => (
              <button
                key={cmd.name}
                type="button"
                onClick={() => handleApplySuggestion(cmd)}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-xs transition-colors ${
                  idx === selectedSuggestIndex
                    ? "bg-success/20 text-success font-bold"
                    : "text-muted-foreground hover:bg-muted/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono">{cmd.name}</span>
                  <span className="text-muted-foreground font-mono text-[11px]">
                    {cmd.syntax}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={`px-1 py-0 text-[9px] ${
                    cmd.destructive
                      ? "border-red-500/30 bg-red-500/10 text-red-400"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {cmd.category}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {/* Command Line Input */}
        <div className="flex items-center gap-2">
          <span className="text-success text-xs font-bold select-none">
            redis&gt;
          </span>
          <CodeMirror
            value={inputCommand}
            onCreateEditor={(view) => {
              inputRef.current = view;
            }}
            onChange={(value) => {
              setInputCommand(value);
              onCommandChange?.(value);
              setShowSuggestions(
                !value.includes("\n") && value.trim().length > 0,
              );
              setSelectedSuggestIndex(0);
            }}
            onKeyDown={handleKeyDown}
            extensions={[redisLanguage, studioEditorTheme]}
            basicSetup={{
              lineNumbers: true,
              autocompletion: false,
              foldGutter: false,
            }}
            theme={
              document.documentElement.classList.contains("dark")
                ? "dark"
                : "light"
            }
            placeholder={t("redis.cli.multilinePlaceholder")}
            className="min-w-0 flex-1 text-xs"
            editable={!isRunning}
          />
          <Button
            size="sm"
            className="bg-primary hover:bg-success px-3 font-mono text-xs text-white"
            onClick={() => executeCommand(inputCommand)}
            disabled={isRunning || !inputCommand.trim()}
          >
            <CornerDownLeft className="mr-1 h-3.5 w-3.5" />
            {t("redis.cli.run")}
          </Button>
        </div>
      </div>

      {/* Destructive Command Alert Confirmation Modal */}
      <AlertDialog
        open={!!pendingDestructiveCmd}
        onOpenChange={(open) => {
          if (!open) setPendingDestructiveCmd(null);
        }}
      >
        <AlertDialogContent className="border-border bg-code text-code-foreground">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>
                {t("redis.cli.flushdbWarningTitle")}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-muted-foreground mt-2 text-xs">
              {t("redis.cli.flushdbWarningDesc", {
                command: pendingDestructiveCmd,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="border-border bg-muted text-muted-foreground hover:bg-muted">
              {t("redis.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (pendingDestructiveCmd) {
                  executeCommand(pendingDestructiveCmd, true);
                  setPendingDestructiveCmd(null);
                }
              }}
            >
              {t("redis.cli.confirmExecute")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// Helper component to render command results in tabular or key-value format
const RenderCliResult: FC<{ result: RawQueryResult }> = ({ result }) => {
  const { t } = useTranslation();
  const { columns, rows } = result;

  if (rows.length === 0) {
    return (
      <span className="text-muted-foreground italic">
        {t("redis.cli.emptyListOrSet")}
      </span>
    );
  }

  // Multi-column table
  return (
    <div className="max-h-80 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-border text-muted-foreground border-b">
            {columns.map((col) => (
              <th key={col} className="p-1 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-border/40 divide-y">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-muted/30">
              {columns.map((col) => (
                <td key={col} className="text-muted-foreground p-1 break-all">
                  {typeof row[col] === "object"
                    ? JSON.stringify(row[col])
                    : String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
