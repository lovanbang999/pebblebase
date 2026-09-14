import { useState, useEffect, useMemo, useCallback, type FC } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { keymap } from "@codemirror/view";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import { json, jsonLanguage } from "@codemirror/lang-json";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { SHORTCUTS, getShortcutTooltip } from "../lib/platform";
import {
  Play,
  Loader2,
  Trash2,
  Clock,
  History,
  Copy,
  Check,
  Zap,
  ShieldAlert,
  ArrowLeft,
  FileSpreadsheet,
  Terminal,
  Sparkles,
  ChevronDown,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";
import type {
  Connection,
  TableSchema,
  RawQueryResult,
  QueryHistoryItem,
} from "../lib/types";
import { executeRawQuery } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { cn } from "cn";

// --------------------------------------------------------------------------
// MongoDB Completion Source Helper
// --------------------------------------------------------------------------
const MONGO_METHODS = [
  { label: "find", type: "function", detail: "find(filter, projection)" },
  { label: "findOne", type: "function", detail: "findOne(filter)" },
  {
    label: "countDocuments",
    type: "function",
    detail: "countDocuments(filter)",
  },
  { label: "aggregate", type: "function", detail: "aggregate(pipeline)" },
  { label: "insertOne", type: "function", detail: "insertOne(doc)" },
  { label: "deleteOne", type: "function", detail: "deleteOne(filter)" },
  { label: "deleteMany", type: "function", detail: "deleteMany(filter)" },
  { label: "limit", type: "function", detail: "limit(count)" },
  { label: "skip", type: "function", detail: "skip(count)" },
  { label: "sort", type: "function", detail: "sort({ field: 1 })" },
];

const MONGO_OPERATORS = [
  { label: "$match", type: "keyword", detail: "Aggregation: filter documents" },
  {
    label: "$group",
    type: "keyword",
    detail: "Aggregation: group by expression",
  },
  {
    label: "$project",
    type: "keyword",
    detail: "Aggregation: reshape documents",
  },
  { label: "$sort", type: "keyword", detail: "Aggregation: order documents" },
  { label: "$limit", type: "keyword", detail: "Aggregation: limit count" },
  { label: "$lookup", type: "keyword", detail: "Aggregation: left outer join" },
  {
    label: "$unwind",
    type: "keyword",
    detail: "Aggregation: deconstruct array",
  },
  { label: "$eq", type: "operator", detail: "Filter: equal" },
  { label: "$ne", type: "operator", detail: "Filter: not equal" },
  { label: "$gt", type: "operator", detail: "Filter: greater than" },
  { label: "$gte", type: "operator", detail: "Filter: greater than or equal" },
  { label: "$lt", type: "operator", detail: "Filter: less than" },
  { label: "$lte", type: "operator", detail: "Filter: less than or equal" },
  { label: "$in", type: "operator", detail: "Filter: matches any in array" },
  { label: "$nin", type: "operator", detail: "Filter: matches none in array" },
  { label: "$regex", type: "operator", detail: "Filter: regular expression" },
  { label: "$exists", type: "operator", detail: "Filter: field exists" },
];

function createMongoCompletionSource(tables: TableSchema[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w\.\$]+/);
    if (!word && !context.explicit) return null;
    const token = word ? word.text : "";

    // 1. If typing db.<collection>.method
    if (word && token.startsWith("db.") && token.split(".").length >= 3) {
      const parts = token.split(".");
      return {
        from: word.from + parts[0].length + parts[1].length + 2,
        options: MONGO_METHODS,
      };
    }

    // 2. If typing db.<collection>
    if (word && token.startsWith("db.")) {
      return {
        from: word.from + 3,
        options: tables.map((t) => ({
          label: t.name,
          type: "class",
          detail: `Collection (${t.columns.length} fields)`,
        })),
      };
    }

    const options: any[] = [];

    // 3. Collection field names
    for (const t of tables) {
      for (const col of t.columns) {
        options.push({
          label: col.name,
          type: "property",
          detail: `${t.name}.${col.name} (${col.type})`,
          boost: 3,
        });
      }
    }

    // 4. Collection names
    for (const t of tables) {
      options.push({
        label: t.name,
        type: "class",
        detail: `Collection (${t.columns.length} fields)`,
        boost: 2,
      });
      options.push({
        label: `db.${t.name}`,
        type: "class",
        detail: `Collection reference`,
        boost: 4,
      });
    }

    options.push(...MONGO_METHODS);
    options.push(...MONGO_OPERATORS);

    return {
      from: word ? word.from : context.pos,
      options,
    };
  };
}

// --------------------------------------------------------------------------
// SQL Completion Source Helper
// --------------------------------------------------------------------------
function createSqlCompletionSource(tables: TableSchema[]) {
  return (context: CompletionContext): CompletionResult | null => {
    const word = context.matchBefore(/[\w\.\$]+/);
    if (!word && !context.explicit) return null;

    const fullDoc = context.state.doc.toString();
    const token = word ? word.text : "";

    // 1. If typing after a dot: tableName.column
    if (word && token.includes(".")) {
      const parts = token.split(".");
      const tablePrefix = parts[0].replace(/['"`]/g, "");
      const matchedTable = tables.find(
        (t) => t.name.toLowerCase() === tablePrefix.toLowerCase(),
      );
      if (matchedTable) {
        return {
          from: word.from + parts[0].length + 1,
          options: matchedTable.columns.map((col) => ({
            label: col.name,
            type: "property",
            detail: `${col.type}${col.is_primary_key ? " • PK" : col.is_foreign_key ? " • FK" : ""}`,
            boost: col.is_primary_key ? 3 : 1,
          })),
        };
      }
    }

    // 2. Identify tables mentioned in the current query to prioritize their columns
    const mentionedTables = tables.filter((t) => {
      const escaped = t.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`['"\`]?\\b${escaped}\\b['"\`]?`, "i");
      return regex.test(fullDoc);
    });

    const options: any[] = [];
    const seen = new Set<string>();

    // Add columns of mentioned tables with highest priority (boost: 4)
    const priorityTables =
      mentionedTables.length > 0 ? mentionedTables : tables;
    for (const t of priorityTables) {
      for (const col of t.columns) {
        const key = `${t.name}.${col.name}`;
        if (!seen.has(key)) {
          seen.add(key);
          options.push({
            label: col.name,
            type: "property",
            detail: `${t.name}.${col.name} (${col.type}${col.is_primary_key ? " • PK" : ""})`,
            boost: mentionedTables.includes(t) ? 4 : 2,
          });
        }
      }
    }

    // Add columns of other tables if not already in priority
    if (mentionedTables.length > 0) {
      for (const t of tables) {
        if (!mentionedTables.includes(t)) {
          for (const col of t.columns) {
            const key = `${t.name}.${col.name}`;
            if (!seen.has(key)) {
              seen.add(key);
              options.push({
                label: col.name,
                type: "property",
                detail: `${t.name}.${col.name} (${col.type})`,
                boost: 1,
              });
            }
          }
        }
      }
    }

    // Add table names (boost: 3)
    for (const t of tables) {
      options.push({
        label: t.name,
        type: "class",
        detail: `Table (${t.columns.length} cols)`,
        boost: 3,
      });
    }

    return {
      from: word ? word.from : context.pos,
      options,
    };
  };
}

function formatLatency(ms?: number): string {
  if (ms === undefined || ms === null) return "0.00";
  // Always display exact decimal time for developers:
  if (ms < 1) {
    return ms.toFixed(2); // e.g. "0.35", "0.05"
  }
  if (ms < 100) {
    return ms.toFixed(2); // e.g. "1.24", "18.50"
  }
  return ms.toFixed(1); // e.g. "145.2"
}

interface QueryConsoleProps {
  connection: Connection;
  tables: TableSchema[];
  initialQuery?: string;
  onNavigateToTable?: (tableName: string) => void;
}

export const QueryConsole: FC<QueryConsoleProps> = ({
  connection,
  tables,
  initialQuery,
  onNavigateToTable,
}) => {
  const { t } = useTranslation();
  const isMongo = connection.type === "mongodb";
  const isMysql = connection.type === "mysql";
  const isSqlite = connection.type === "sqlite";

  // Helper to build default example query for a given connection & tables
  const buildExampleQuery = useCallback(
    (connType: string, tbls: TableSchema[]) => {
      const firstTable =
        tbls[0]?.name || (connType === "mongodb" ? "collection" : "records");
      if (connType === "mongodb") {
        return `db.${firstTable}.find({}).limit(50)`;
      }
      if (connType === "mysql") {
        return `SELECT * FROM \`${firstTable}\` LIMIT 50;`;
      }
      return `SELECT * FROM "${firstTable}" LIMIT 50;`;
    },
    [],
  );

  // Validate if initialQuery matches current engine dialect
  const isValidInitialQuery = useMemo(() => {
    if (!initialQuery) return false;
    const trimmed = initialQuery.trim();
    if (isMongo) {
      return trimmed.startsWith("db.") || trimmed.startsWith("{");
    }
    return !trimmed.startsWith("db.");
  }, [initialQuery, isMongo]);

  // Pre-seed query
  const defaultQuery = useMemo(() => {
    if (isValidInitialQuery && initialQuery) return initialQuery;
    return buildExampleQuery(connection.type, tables);
  }, [
    isValidInitialQuery,
    initialQuery,
    connection.type,
    tables,
    buildExampleQuery,
  ]);

  const [query, setQuery] = useState(defaultQuery);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RawQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);

  const handleCopyHistory = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHistoryId(id);
    setTimeout(() => setCopiedHistoryId(null), 1500);
  };

  // History State
  const storageKey = `pebblebase_query_history_${connection.id}`;
  const [history, setHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Keep history synced when connection.id changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setHistory(saved ? JSON.parse(saved) : []);
    } catch {
      setHistory([]);
    }
  }, [storageKey]);

  // When tables arrive, engine changes, or dialect mismatch is detected, update to engine example query
  useEffect(() => {
    const trimmed = query.trim();
    const isPlaceholderMongo =
      trimmed === "db.records.find({}).limit(50)" ||
      trimmed === "db.collection.find({}).limit(50)";
    const isPlaceholderSQL =
      trimmed === 'SELECT * FROM "records" LIMIT 50;' ||
      trimmed === "SELECT * FROM `records` LIMIT 50;";
    const isDialectMismatch = isMongo
      ? !trimmed.startsWith("db.") && !trimmed.startsWith("{")
      : trimmed.startsWith("db.");

    if (
      isPlaceholderMongo ||
      isPlaceholderSQL ||
      isDialectMismatch ||
      !trimmed
    ) {
      setQuery(buildExampleQuery(connection.type, tables));
      setResult(null);
      setError(null);
    }
  }, [tables, connection.type, isMongo, buildExampleQuery]);

  const saveHistory = useCallback(
    (item: Omit<QueryHistoryItem, "id" | "timestamp">) => {
      const newItem: QueryHistoryItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        timestamp: Date.now(),
        ...item,
      };
      setHistory((prev) => {
        const next = [
          newItem,
          ...prev.filter((p) => p.query !== item.query),
        ].slice(0, 50);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore localStorage quota errors
        }
        return next;
      });
    },
    [storageKey],
  );

  const clearHistory = () => {
    setHistory([]);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
  };

  // Run Query handler
  const handleRun = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isRunning) return;

    setIsRunning(true);
    setError(null);
    const startClient = performance.now();

    try {
      const res = await executeRawQuery(connection.id, trimmed);
      const clientDuration = performance.now() - startClient;
      // If backend returned a precise time > 0, use it.
      // If backend returned 0 (e.g. before server restart), use client elapsed time.
      const exactTime =
        res.execution_time_ms > 0
          ? res.execution_time_ms
          : Math.max(0.01, Number(clientDuration.toFixed(2)));

      const enrichedResult: RawQueryResult = {
        ...res,
        execution_time_ms: exactTime,
        round_trip_ms: Number(clientDuration.toFixed(2)),
      };

      setResult(enrichedResult);
      saveHistory({
        query: trimmed,
        execution_time_ms: exactTime,
        round_trip_ms: Number(clientDuration.toFixed(2)),
        is_mutation: res.is_mutation,
        row_count: res.rows.length,
      });
    } catch (err: any) {
      const msg = err.message || "Execution error";
      setError(msg);
      saveHistory({
        query: trimmed,
        error: msg,
      });
    } finally {
      setIsRunning(false);
    }
  }, [query, isRunning, connection.id, saveHistory]);

  // Global shortcut: Cmd/Ctrl + Enter or F5 to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (((e.metaKey || e.ctrlKey) && e.key === "Enter") || e.key === "F5") {
        e.preventDefault();
        handleRun();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleRun]);

  // CodeMirror Extensions with Dialect, Keymaps & Dynamic Autocomplete
  const extensions = useMemo(() => {
    const runKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          handleRun();
          return true;
        },
      },
      {
        key: "F5",
        run: () => {
          handleRun();
          return true;
        },
      },
    ]);

    if (isMongo) {
      return [
        json(),
        jsonLanguage.data.of({
          autocomplete: createMongoCompletionSource(tables),
        }),
        autocompletion({
          activateOnTyping: true,
          maxRenderedOptions: 30,
        }),
        runKeymap,
      ];
    }

    const dialect = isMysql ? MySQL : isSqlite ? SQLite : PostgreSQL;

    // Generate schema object for CodeMirror SQL
    const sqlSchema: Record<string, any[]> = {};
    for (const t of tables) {
      sqlSchema[t.name] = t.columns.map((col) => ({
        label: col.name,
        type: "property",
        detail: `${col.type}${col.is_primary_key ? " • PK" : col.is_foreign_key ? " • FK" : ""}`,
        boost: col.is_primary_key ? 3 : 1,
      }));
    }

    const sqlTables = tables.map((t) => ({
      label: t.name,
      type: "class",
      detail: `Table (${t.columns.length} cols)`,
      boost: 2,
    }));

    return [
      sql({
        dialect,
        schema: sqlSchema,
        tables: sqlTables,
        upperCaseKeywords: true,
      }),
      dialect.language.data.of({
        autocomplete: createSqlCompletionSource(tables),
      }),
      autocompletion({
        activateOnTyping: true,
        maxRenderedOptions: 30,
      }),
      runKeymap,
    ];
  }, [isMongo, isMysql, isSqlite, tables, handleRun]);

  // Theme detection
  const isDark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  // Sample templates
  const sampleTemplates = useMemo(() => {
    const firstTable = tables[0]?.name || "users";
    if (isMongo) {
      return [
        {
          label: t("console.templateMongoFind"),
          query: `db.${firstTable}.find({}).limit(50)`,
        },
        {
          label: t("console.templateMongoCount"),
          query: `db.${firstTable}.countDocuments({})`,
        },
        {
          label: t("console.templateMongoAgg"),
          query: `db.${firstTable}.aggregate([\n  { "$match": {} },\n  { "$limit": 20 }\n])`,
        },
      ];
    }
    if (isMysql) {
      return [
        {
          label: t("console.templateSelectAll"),
          query: `SELECT * FROM \`${firstTable}\` LIMIT 50;`,
        },
        {
          label: t("console.templateCount"),
          query: `SELECT COUNT(*) AS total_records FROM \`${firstTable}\`;`,
        },
        {
          label: t("console.templateFilterSort"),
          query: `SELECT * FROM \`${firstTable}\` WHERE id > 0 ORDER BY id DESC LIMIT 20;`,
        },
      ];
    }
    return [
      {
        label: t("console.templateSelectAll"),
        query: `SELECT * FROM "${firstTable}" LIMIT 50;`,
      },
      {
        label: t("console.templateCount"),
        query: `SELECT COUNT(*) AS total_records FROM "${firstTable}";`,
      },
      {
        label: t("console.templateFilterSort"),
        query: `SELECT * FROM "${firstTable}" WHERE id > 0 ORDER BY id DESC LIMIT 20;`,
      },
    ];
  }, [tables, isMongo, isMysql, t]);

  // Export Results to CSV
  const handleExportCSV = () => {
    if (!result || result.rows.length === 0) return;
    const cols = result.columns;
    const header = cols.join(",");
    const rowsText = result.rows.map((r) =>
      cols
        .map((c) => {
          const val = r[c];
          if (val === null || val === undefined) return '""';
          if (typeof val === "object")
            return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const csvContent = [header, ...rowsText].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `query_result_${connection.db_name}_${Date.now()}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered Rows for Results Table
  const displayedRows = useMemo(() => {
    if (!result || !result.rows) return [];
    if (!resultFilter.trim()) return result.rows;
    const term = resultFilter.toLowerCase();
    return result.rows.filter((row) =>
      Object.values(row).some(
        (v) =>
          v !== null &&
          v !== undefined &&
          String(v).toLowerCase().includes(term),
      ),
    );
  }, [result, resultFilter]);

  const copyToClipboard = (text: string, cellKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell(cellKey);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const term = historySearch.toLowerCase();
    return history.filter((h) => h.query.toLowerCase().includes(term));
  }, [history, historySearch]);

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-zinc-950 overflow-hidden select-text">
      {/* Top Header */}
      <div className="h-11 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 bg-white dark:bg-zinc-900/40 shrink-0">
        <div className="flex items-center gap-2">
          {onNavigateToTable && tables.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigateToTable(tables[0].name)}
              className="text-xs font-mono gap-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 -ml-1 h-7"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t("console.backToTable")}</span>
            </Button>
          )}

          <div className="flex items-center gap-1.5 ml-1">
            <Terminal className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {t("console.title")}
            </span>
          </div>

          <Badge
            variant="outline"
            className="text-[10px] font-mono px-1.5 py-0 h-4 uppercase border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10"
          >
            {connection.type}
          </Badge>

          {connection.read_only && (
            <Badge
              variant="outline"
              className="text-[10px] font-mono px-1.5 py-0 h-4 uppercase border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10 gap-1"
            >
              <ShieldAlert className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{t("connection.readOnlyBadge")}</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Sample Templates */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs font-mono gap-1 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800"
                >
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>{t("console.sampleTemplates")}</span>
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-64 font-mono text-xs">
              {sampleTemplates.map((item, i) => (
                <DropdownMenuItem
                  key={i}
                  onClick={() => setQuery(item.query)}
                  className="cursor-pointer text-xs"
                >
                  {item.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* History Toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsHistoryOpen(true)}
            className="h-7 text-xs font-mono gap-1 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800"
          >
            <History className="w-3 h-3" />
            <span>{t("console.history")}</span>
            {history.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-[10px] font-sans font-semibold leading-none tabular-nums text-center select-none">
                {history.length}
              </span>
            )}
          </Button>

          {/* Clear Editor */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setQuery("")}
            className="h-7 text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center justify-center gap-1.5"
          >
            <Trash2 className="size-3.5 shrink-0" />
            <span className="leading-none translate-y-px">{t("console.clear")}</span>
          </Button>

          {/* Run Query CTA */}
          <Button
            type="button"
            size="sm"
            onClick={handleRun}
            disabled={isRunning || !query.trim()}
            title={getShortcutTooltip("runQuery")}
            aria-keyshortcuts={SHORTCUTS.runQueryFull}
            className="h-7 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t("console.running")}</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-current" />
                <span>{t("console.runQuery")}</span>
                <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[9px] bg-emerald-700/80 text-emerald-100 rounded font-mono font-medium leading-none tracking-tight">
                  {SHORTCUTS.runQuery}
                </kbd>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Read-Only Safety Notice */}
      {connection.read_only && (
        <div className="px-3 py-1 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/25 flex items-center gap-2 text-[11px] font-mono text-amber-800 dark:text-amber-300">
          <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{t("console.readOnlyWarn")}</span>
        </div>
      )}

      {/* CodeMirror Editor Area */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/80 shrink-0">
        <CodeMirror
          value={query}
          height="160px"
          theme={isDark ? "dark" : "light"}
          extensions={extensions}
          onChange={(val) => setQuery(val)}
          placeholder={
            isMongo
              ? 'db.collection.find({ "status": "active" }).limit(50)'
              : 'SELECT * FROM "users" WHERE id > 0 ORDER BY id DESC LIMIT 50;'
          }
          className="text-xs font-mono border-0 focus:outline-hidden"
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLineGutter: true,
            highlightActiveLine: true,
            autocompletion: true,
          }}
        />
      </div>

      {/* Execution Metrics & Results Status Bar */}
      <div className="h-9 px-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/60 flex items-center justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400 shrink-0">
        <div className="flex items-center gap-3">
          {result && (
            <>
              <div
                className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold cursor-help"
                title={
                  result.round_trip_ms
                    ? `Database query: ${formatLatency(result.execution_time_ms)}ms | Network round-trip: ${formatLatency(result.round_trip_ms)}ms`
                    : `Database query: ${formatLatency(result.execution_time_ms)}ms`
                }
              >
                <Zap className="w-3 h-3 fill-emerald-500/20 text-emerald-600 dark:text-emerald-400" />
                <span>
                  {t("console.latency", { ms: formatLatency(result.execution_time_ms) })}
                </span>
              </div>

              <span className="text-zinc-300 dark:text-zinc-700">|</span>

              {result.is_mutation ? (
                <span className="text-amber-700 dark:text-amber-400 font-medium">
                  {t("console.rowsAffected", { count: result.rows_affected })}
                </span>
              ) : (
                <span>
                  {t("console.rowsReturned", { count: result.rows.length })}
                </span>
              )}

              {result.columns && result.columns.length > 0 && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-700">|</span>
                  <span>{result.columns.length} columns</span>
                </>
              )}
            </>
          )}

          {!result && !error && !isRunning && (
            <span className="text-zinc-400 dark:text-zinc-500 italic text-[11px]">
              {t("console.emptyPrompt")}
            </span>
          )}
        </div>

        {result && result.rows.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Quick Filter across results */}
            <div className="relative flex items-center">
              <Search className="w-3 h-3 text-zinc-400 absolute left-2 pointer-events-none" />
              <Input
                type="text"
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                placeholder={t("console.rowsFilter")}
                className="pl-6 pr-2 h-6 text-[11px] font-mono w-40 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            {/* Export CSV */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="h-6 px-2 text-[11px] font-mono gap-1 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800"
            >
              <FileSpreadsheet className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span>{t("console.exportResults")}</span>
            </Button>
          </div>
        )}
      </div>

      {/* Results Content Area */}
      <div className="flex-1 overflow-auto custom-scrollbar p-3">
        {/* Error Alert */}
        {error && (
          <Alert
            variant="destructive"
            className="border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300"
          >
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
            <AlertDescription className="font-mono text-xs break-all">
              {error}
            </AlertDescription>
          </Alert>
        )}

        {/* Mutation Success Banner */}
        {result && result.is_mutation && !error && (
          <Alert className="border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <AlertDescription className="font-mono text-xs">
              {t("console.mutationSuccess")} ({result.rows_affected} row(s)
              affected in {formatLatency(result.execution_time_ms)}ms)
            </AlertDescription>
          </Alert>
        )}

        {/* Data Table */}
        {result && result.rows.length > 0 ? (
          <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900/40 shadow-xs">
            <Table className="w-full border-collapse text-left font-mono text-xs">
              <TableHeader className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                <TableRow>
                  <TableHead className="w-12 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-500 select-none">
                    #
                  </TableHead>
                  {result.columns.map((col) => (
                    <TableHead
                      key={col}
                      className="px-3 py-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 border-l border-zinc-200/60 dark:border-zinc-800/60 whitespace-nowrap"
                    >
                      {col}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-zinc-200/80 dark:divide-zinc-800/60">
                {displayedRows.map((row, idx) => (
                  <TableRow
                    key={idx}
                    className="hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors group"
                  >
                    <TableCell className="px-2.5 py-1.5 text-[11px] font-mono text-zinc-400 dark:text-zinc-500 select-none">
                      {idx + 1}
                    </TableCell>
                    {result.columns.map((col) => {
                      const val = row[col];
                      const cellKey = `${idx}-${col}`;
                      const isCopied = copiedCell === cellKey;

                      return (
                        <TableCell
                          key={col}
                          onClick={() => copyToClipboard(String(val), cellKey)}
                          title="Click to copy value"
                          className="px-3 py-1.5 text-xs border-l border-zinc-200/60 dark:border-zinc-800/60 whitespace-nowrap max-w-xs truncate cursor-pointer relative"
                        >
                          {val === null ? (
                            <span className="text-zinc-400 dark:text-zinc-600 italic">
                              NULL
                            </span>
                          ) : val === undefined ? (
                            <span className="text-zinc-400 dark:text-zinc-600 italic">
                              —
                            </span>
                          ) : typeof val === "boolean" ? (
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-1 py-0 text-[10px] font-mono font-medium",
                                val
                                  ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                              )}
                            >
                              {String(val)}
                            </Badge>
                          ) : typeof val === "object" ? (
                            <span className="text-amber-700 dark:text-amber-300">
                              {JSON.stringify(val)}
                            </span>
                          ) : (
                            <span className="text-zinc-900 dark:text-zinc-100">
                              {String(val)}
                            </span>
                          )}

                          {isCopied && (
                            <span className="absolute right-1 top-1 bg-emerald-600 text-white text-[9px] px-1 py-0.2 rounded font-sans flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" /> copied
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {result &&
          result.rows.length === 0 &&
          !result.is_mutation &&
          !error && (
            <div className="h-48 flex flex-col items-center justify-center text-center p-6">
              <CheckCircle2 className="w-8 h-8 text-zinc-400 mb-2 opacity-50" />
              <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                {t("console.noResults")}
              </h3>
              <p className="text-xs text-zinc-500 mt-1">
                Query returned 0 rows in {formatLatency(result.execution_time_ms)}ms.
              </p>
            </div>
          )}
      </div>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-2xl rounded-xl">
          <DialogHeader className="pl-5 pr-12 py-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 flex flex-row items-center justify-between space-y-0">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t("console.historyTitle")}
              </DialogTitle>
              <Badge
                variant="outline"
                className="text-[10px] font-mono px-1.5 py-0 h-4"
              >
                {history.length}
              </Badge>
              <DialogDescription className="sr-only">
                {t("console.historyDesc", { name: connection.name })}
              </DialogDescription>
            </div>
            {history.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 h-7 px-2"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                {t("console.clearHistory")}
              </Button>
            )}
          </DialogHeader>

          <div className="p-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 pointer-events-none" />
              <Input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder={t("console.searchHistory")}
                className="pl-8 pr-8 h-8 text-xs font-mono"
              />
              {historySearch && (
                <button
                  type="button"
                  onClick={() => setHistorySearch("")}
                  className="absolute right-2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar max-h-96">
            {filteredHistory.length === 0 ? (
              <div className="text-center py-8 text-xs text-zinc-500 font-mono">
                {historySearch
                  ? t("console.noHistoryMatch", { term: historySearch })
                  : t("console.noHistory")}
              </div>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/40 hover:border-emerald-500/40 transition-all group flex items-start justify-between gap-3 shadow-xs"
                >
                  <div className="flex-1 min-w-0">
                    <pre className="text-xs font-mono text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap break-all line-clamp-3 p-2 rounded bg-zinc-100/70 dark:bg-zinc-950/60 border border-zinc-200/60 dark:border-zinc-800/60">
                      {item.query}
                    </pre>
                    <div className="flex items-center gap-2 mt-2 text-[10px] font-mono text-zinc-400">
                      <span>
                        {new Date(item.timestamp).toLocaleTimeString()}
                      </span>
                      {item.execution_time_ms !== undefined && (
                        <Badge
                          variant="outline"
                          title={
                            item.round_trip_ms
                              ? `Query: ${formatLatency(item.execution_time_ms)}ms | Total: ${formatLatency(item.round_trip_ms)}ms`
                              : `Query execution: ${formatLatency(item.execution_time_ms)}ms`
                          }
                          className="px-1.5 py-0 text-[10px] font-mono border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 gap-0.5 h-4 cursor-help"
                        >
                          <Zap className="w-2.5 h-2.5 fill-current" />
                          <span>{formatLatency(item.execution_time_ms)}ms</span>
                        </Badge>
                      )}
                      {item.row_count !== undefined && !item.error && (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px] font-mono border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 h-4"
                        >
                          {item.row_count} rows
                        </Badge>
                      )}
                      {item.error && (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px] font-mono border-rose-500/30 text-rose-700 dark:text-rose-400 bg-rose-500/10 gap-0.5 h-4"
                        >
                          <AlertCircle className="w-2.5 h-2.5" />
                          <span>{item.error}</span>
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleCopyHistory(item.id, item.query)}
                      title={t("console.copyQuery")}
                      className="h-7 w-7 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      {copiedHistoryId === item.id ? (
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setQuery(item.query);
                        setIsHistoryOpen(false);
                      }}
                      className="h-7 px-2.5 text-xs font-mono border-zinc-200 dark:border-zinc-800 text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 gap-1"
                    >
                      <Terminal className="w-3 h-3" />
                      <span>{t("console.useQuery")}</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
