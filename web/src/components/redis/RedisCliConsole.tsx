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

export const RedisCliConsole: FC<RedisCliConsoleProps> = ({
  connId,
  isReadOnly = false,
}) => {
  const { t } = useTranslation();

  const [inputCommand, setInputCommand] = useState("");
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

  const inputRef = useRef<HTMLInputElement | null>(null);
  const terminalEndRef = useRef<HTMLDivElement | null>(null);

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
  const executeCommand = async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    // Check destructive command
    const upper = trimmed.toUpperCase();
    if (
      isReadOnly &&
      (upper.startsWith("SET") ||
        upper.startsWith("DEL") ||
        upper.startsWith("FLUSHDB") ||
        upper.startsWith("FLUSHALL"))
    ) {
      setHistory((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          command: trimmed,
          timestamp: new Date().toISOString(),
          error: t("redis.cli.readOnlyError"),
        },
      ]);
      setInputCommand("");
      return;
    }
    if (upper.startsWith("FLUSHDB") || upper.startsWith("FLUSHALL")) {
      setPendingDestructiveCmd(trimmed);
      return;
    }

    await runCommandDirectly(trimmed);
  };

  const runCommandDirectly = async (command: string) => {
    // Record in input history
    setPastCommands((prev) => {
      const filtered = prev.filter((c) => c !== command);
      return [...filtered, command];
    });
    setHistoryIndex(-1);
    setInputCommand("");
    setShowSuggestions(false);
    setIsRunning(true);

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
      setHistory((prev) => [...prev, item]);
      setIsRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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

    if (e.key === "Enter") {
      e.preventDefault();
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
    <div className="flex h-full flex-col bg-zinc-950 font-mono text-zinc-100">
      {/* CLI Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-emerald-400" />
          <h2 className="text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            {t("redis.cli.title")}
          </h2>
          <span className="text-[11px] text-zinc-500">
            {t("redis.cli.historyTip")}
          </span>
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={() => setHistory([])}
          disabled={history.length === 0}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          {t("redis.cli.clearOutput")}
        </Button>
      </div>

      {/* Terminal Output Area */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
        {history.length === 0 && !isRunning && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-zinc-500">
            <Terminal className="mb-2 h-8 w-8 text-zinc-600" />
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
                    className="hover:border-primary/50 rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400 transition-colors hover:text-emerald-400"
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
            <div className="flex items-center justify-between text-zinc-400">
              <div className="flex items-center gap-2">
                <span className="font-bold text-emerald-400">redis&gt;</span>
                <span className="font-semibold text-zinc-100">
                  {item.command}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
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
                        className="border-amber-500/30 bg-amber-500/10 px-1 py-0 text-[10px] text-amber-400"
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
              <div className="group relative rounded border border-zinc-800 bg-zinc-900/40 p-2.5">
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute top-2 right-2 h-6 w-6 bg-zinc-800 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-zinc-100"
                  onClick={() =>
                    handleCopyResult(
                      item.id,
                      JSON.stringify(item.result?.rows, null, 2),
                    )
                  }
                  title={t("redis.cli.copyOutput")}
                >
                  {copiedId === item.id ? (
                    <Check className="h-3 w-3 text-emerald-400" />
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
          <div className="flex items-center gap-2 text-zinc-400">
            <span className="font-bold text-emerald-400">redis&gt;</span>
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
            <span className="text-zinc-500 italic">
              {t("redis.cli.running")}
            </span>
          </div>
        )}

        <div ref={terminalEndRef} />
      </div>

      {/* Input Prompt & Autocomplete Floating Box */}
      <div className="relative border-t border-zinc-800 bg-zinc-900 p-3">
        {/* Suggestions dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute right-3 bottom-full left-3 mb-2 max-h-56 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/95 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-400" />{" "}
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
                    ? "bg-emerald-500/20 font-bold text-emerald-300"
                    : "text-zinc-300 hover:bg-zinc-800/80"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono">{cmd.name}</span>
                  <span className="font-mono text-[11px] text-zinc-500">
                    {cmd.syntax}
                  </span>
                </div>
                <Badge
                  variant="outline"
                  className={`px-1 py-0 text-[9px] ${
                    cmd.destructive
                      ? "border-red-500/30 bg-red-500/10 text-red-400"
                      : "border-zinc-700 text-zinc-400"
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
          <span className="text-xs font-bold text-emerald-400 select-none">
            redis&gt;
          </span>
          <Input
            ref={inputRef}
            type="text"
            value={inputCommand}
            onChange={(e) => {
              setInputCommand(e.target.value);
              setShowSuggestions(e.target.value.trim().length > 0);
              setSelectedSuggestIndex(0);
            }}
            onFocus={() => {
              if (inputCommand.trim().length > 0) setShowSuggestions(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("redis.cli.inputPlaceholder")}
            className="focus-visible:ring-primary/50 flex-1 border-zinc-800 bg-zinc-950 font-mono text-xs text-zinc-100 placeholder:text-zinc-600"
            disabled={isRunning}
            autoFocus
          />
          <Button
            size="sm"
            className="bg-primary px-3 font-mono text-xs text-white hover:bg-emerald-700"
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
        <AlertDialogContent className="border-zinc-800 bg-zinc-900 text-zinc-100">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>
                {t("redis.cli.flushdbWarningTitle")}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="mt-2 text-xs text-zinc-400">
              {t("redis.cli.flushdbWarningDesc", {
                command: pendingDestructiveCmd,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4">
            <AlertDialogCancel className="border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700">
              {t("redis.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={() => {
                if (pendingDestructiveCmd) {
                  runCommandDirectly(pendingDestructiveCmd);
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
      <span className="text-zinc-500 italic">
        {t("redis.cli.emptyListOrSet")}
      </span>
    );
  }

  // Single column result (e.g. string result or simple array)
  if (columns.length === 1) {
    const colName = columns[0];
    return (
      <div className="space-y-1">
        {rows.map((row, idx) => {
          const val = row[colName];
          return (
            <div key={idx} className="flex items-start gap-2">
              <span className="text-zinc-500 select-none">{idx + 1})</span>
              <span className="break-all whitespace-pre-wrap text-emerald-400">
                {typeof val === "object" ? JSON.stringify(val) : String(val)}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // Key-value pairs (e.g. HGETALL or INFO table: field/value)
  if (
    columns.length === 2 &&
    (columns.includes("field") || columns.includes("key")) &&
    columns.includes("value")
  ) {
    const keyCol = columns[0] === "value" ? columns[1] : columns[0];
    const valCol = "value";
    return (
      <div className="grid max-h-80 grid-cols-1 gap-1 overflow-y-auto md:grid-cols-2">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-1 text-[11px]"
          >
            <span className="truncate font-semibold text-zinc-400">
              {String(row[keyCol])}:
            </span>
            <span className="truncate font-mono text-emerald-400">
              {String(row[valCol])}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Multi-column table
  return (
    <div className="max-h-80 overflow-x-auto">
      <table className="w-full border-collapse text-left text-[11px]">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400">
            {columns.map((col) => (
              <th key={col} className="p-1 font-semibold">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/40">
          {rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-zinc-800/30">
              {columns.map((col) => (
                <td key={col} className="p-1 break-all text-zinc-300">
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
