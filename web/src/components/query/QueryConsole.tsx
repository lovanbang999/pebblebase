import {
  appendQueryHistory,
  readQueryHistory,
  containsCredentials,
} from "@/lib/queryHistoryStore";
import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type FC,
} from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { studioEditorTheme } from "@/lib/editorTheme";
import { EditorView, keymap } from "@codemirror/view";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import { javascript, javascriptLanguage } from "@codemirror/lang-javascript";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { SHORTCUTS, getShortcutTooltip } from "@/lib/platform";
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
  ChevronUp,
  ChevronRight,
  Search,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  X,
  Plus,
  BookOpen,
  Save,
  Star,
  FileSearch,
  Layers,
} from "lucide-react";
import type {
  Connection,
  TableSchema,
  RawQueryResult,
  QueryHistoryItem,
  ExplainResult,
  AIQueryAssistResponse,
  TableSchemaSummary,
} from "@/lib/types";
import { createSavedQuery, explainQuery, queryAssist } from "@/lib/api";
import {
  STORAGE_KEYS,
  DEFAULT_QUERY_LIMIT,
  VIRTUALIZER_QUERY_ROW_HEIGHT,
  VIRTUALIZER_OVERSCAN,
  COPY_FEEDBACK_MS,
  TOAST_DURATION_MS,
} from "@/constants";
import { PipelineBuilder } from "./PipelineBuilder";
import { emitOperationEvent } from "@/lib/operationEvents";
import { QUERY_EDITOR_MIN_HEIGHT } from "@/constants/workspaceLayout";
import { splitQueryStatements } from "@/lib/queryStatements";
import { useConsoleTransactions } from "@/hooks/useConsoleTransactions";
import { getDefaultConsoleTransaction } from "@/lib/settingsPreferences";
import { isWritingStatement } from "@/lib/querySafety";

interface ConsoleStatementResult {
  id: string;
  statement: string;
  result: RawQueryResult | null;
  error?: string;
}

interface ConsoleOutputEntry {
  id: string;
  statement: string;
  message: string;
  status: "running" | "success" | "error";
}

export interface ConsoleTab {
  id: string;
  label: string;
  query: string;
  results: RawQueryResult | null;
  executionTime?: number;
  error?: string | null;
  explainResult?: ExplainResult | null;
  statementResults?: ConsoleStatementResult[];
  outputEntries?: ConsoleOutputEntry[];
}
import QueryLibraryPanel from "./QueryLibraryPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  { label: "findOne", type: "function", detail: "findOne(filter, projection)" },
  {
    label: "countDocuments",
    type: "function",
    detail: "countDocuments(filter)",
  },
  { label: "aggregate", type: "function", detail: "aggregate(pipeline)" },
  { label: "insertOne", type: "function", detail: "insertOne(doc)" },
  { label: "insertMany", type: "function", detail: "insertMany([doc1, doc2])" },
  {
    label: "updateOne",
    type: "function",
    detail: "updateOne(filter, update, options)",
  },
  {
    label: "updateMany",
    type: "function",
    detail: "updateMany(filter, update, options)",
  },
  { label: "deleteOne", type: "function", detail: "deleteOne(filter)" },
  { label: "deleteMany", type: "function", detail: "deleteMany(filter)" },
  { label: "distinct", type: "function", detail: "distinct(field, filter)" },
  { label: "limit", type: "function", detail: "limit(count)" },
  { label: "skip", type: "function", detail: "skip(count)" },
  { label: "sort", type: "function", detail: "sort({ field: 1 })" },
  { label: "toArray", type: "function", detail: "toArray()" },
  { label: "drop", type: "function", detail: "drop()" },
  {
    label: "getCollectionNames",
    type: "function",
    detail: "getCollectionNames()",
  },
];

const MONGO_HELPERS = [
  { label: "ObjectId", type: "function", detail: "ObjectId(hexString?)" },
  { label: "ISODate", type: "function", detail: "ISODate(dateString?)" },
  { label: "NumberLong", type: "function", detail: "NumberLong(value)" },
  { label: "UUID", type: "function", detail: "UUID(uuidString?)" },
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
    const word = context.matchBefore(/[\w.$]+/);
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
    options.push(...MONGO_HELPERS);
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
    const word = context.matchBefore(/[\w.$]+/);
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

const PlanTreeNode: FC<{
  keyName?: string;
  value: any;
  depth?: number;
  expandAll?: boolean | null;
}> = ({ keyName, value, depth = 0, expandAll = null }) => {
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const [isOpenState, setIsOpenState] = useState<boolean | null>(null);
  const [prevExpandAll, setPrevExpandAll] = useState(expandAll);

  if (prevExpandAll !== expandAll) {
    setPrevExpandAll(expandAll);
    setIsOpenState(null);
  }

  const isOpen =
    isOpenState !== null
      ? isOpenState
      : expandAll !== null
        ? expandAll
        : depth < 2;

  if (!isObject) {
    let valueColor = "text-syntax-string";
    if (typeof value === "number") {
      valueColor = "text-syntax-number font-semibold";
    } else if (typeof value === "boolean") {
      valueColor = "text-sky-600 dark:text-sky-400 font-semibold";
    } else if (value === null) {
      valueColor = "text-muted-foreground italic";
    }

    return (
      <div
        className="hover:bg-muted/50 dark:hover:bg-muted/30 flex items-baseline gap-2 rounded px-1 py-0.5 font-mono text-xs"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {keyName && (
          <span className="text-muted-foreground dark:text-muted-foreground shrink-0 font-medium">
            {keyName}:
          </span>
        )}
        <span className={cn("break-all select-text", valueColor)}>
          {value === null
            ? "null"
            : typeof value === "string"
              ? `"${value}"`
              : String(value)}
        </span>
      </div>
    );
  }

  const entries = isArray
    ? value.map((v: any, i: number) => [String(i), v])
    : Object.entries(value);
  const count = entries.length;

  return (
    <div className="font-mono text-xs">
      <div
        onClick={() => setIsOpenState(!isOpen)}
        className="group hover:bg-muted/70 dark:hover:bg-muted/40 flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 select-none"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {isOpen ? (
          <ChevronDown className="text-muted-foreground group-hover:text-foreground dark:group-hover:text-foreground h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="text-muted-foreground group-hover:text-foreground dark:group-hover:text-foreground h-3.5 w-3.5 shrink-0" />
        )}

        {keyName && (
          <span className="text-primary dark:text-primary shrink-0 font-medium">
            {keyName}:
          </span>
        )}

        <span className="text-muted-foreground text-[11px]">
          {isArray ? `Array(${count})` : `{${count} fields}`}
        </span>

        {!isOpen && !isArray && value && (
          <span className="text-muted-foreground ml-1 truncate font-sans text-[11px]">
            {String(
              value["Node Type"] ||
                value["type"] ||
                value["table_name"] ||
                value["stage"] ||
                value["detail"] ||
                "",
            )}
          </span>
        )}
      </div>

      {isOpen && (
        <div className="border-border/60 ml-2 border-l">
          {entries.map(([k, v]) => (
            <PlanTreeNode
              key={k}
              keyName={isArray ? undefined : k}
              value={v}
              depth={depth + 1}
              expandAll={expandAll}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface QueryConsoleProps {
  connection: Connection;
  workspaceTabId?: string;
  tables: TableSchema[];
  initialQuery?: string;
  onNavigateToTable?: (tableName: string) => void;
  onQueryChange?: (query: string) => void;
  onOpenAISettings?: () => void;
}

export const QueryConsole: FC<QueryConsoleProps> = ({
  connection,
  workspaceTabId,
  tables,
  initialQuery,
  onNavigateToTable,
  onQueryChange,
  onOpenAISettings,
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
        return `db.${firstTable}.find({}).limit(${DEFAULT_QUERY_LIMIT})`;
      }
      if (connType === "mysql") {
        return `SELECT * FROM \`${firstTable}\` LIMIT ${DEFAULT_QUERY_LIMIT};`;
      }
      return `SELECT * FROM "${firstTable}" LIMIT ${DEFAULT_QUERY_LIMIT};`;
    },
    [],
  );

  // Validate if initialQuery matches current dialect
  const isValidInitialQuery = useMemo(() => {
    if (typeof initialQuery !== "string" || !initialQuery.trim()) return false;
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

  const tabsStorageKey = workspaceTabId
    ? STORAGE_KEYS.queryWorkspaceTabs(connection.id, workspaceTabId)
    : STORAGE_KEYS.queryTabs(connection.id);

  const [activeMode, setActiveMode] = useState<"console" | "pipeline">(
    "console",
  );

  // Keep activeMode consistent if dialect changes
  useEffect(() => {
    if (!isMongo && activeMode === "pipeline") {
      setActiveMode("console");
    }
  }, [isMongo, activeMode]);

  const [tabs, setTabs] = useState<ConsoleTab[]>(() => {
    try {
      const saved = sessionStorage.getItem(tabsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed?.tabs) && parsed.tabs.length > 0) {
          return parsed.tabs;
        }
      }
    } catch {
      // ignore
    }
    return [
      {
        id: "tab-1",
        label: "Query 1",
        query: defaultQuery,
        results: null,
        executionTime: undefined,
        error: null,
      },
    ];
  });

  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = sessionStorage.getItem(tabsStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          parsed?.activeTabId &&
          parsed.tabs?.some((t: ConsoleTab) => t.id === parsed.activeTabId)
        ) {
          return parsed.activeTabId;
        }
        if (Array.isArray(parsed?.tabs) && parsed.tabs.length > 0) {
          return parsed.tabs[0].id;
        }
      }
    } catch {
      // ignore
    }
    return "tab-1";
  });

  // Reload tabs when switching active connection
  const prevConnIdRef = useRef(connection.id);
  useEffect(() => {
    if (prevConnIdRef.current !== connection.id) {
      prevConnIdRef.current = connection.id;
      try {
        const saved = sessionStorage.getItem(tabsStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed?.tabs) && parsed.tabs.length > 0) {
            setTabs(parsed.tabs);
            setActiveTabId(
              parsed.activeTabId &&
                parsed.tabs.some((t: ConsoleTab) => t.id === parsed.activeTabId)
                ? parsed.activeTabId
                : parsed.tabs[0].id,
            );
            return;
          }
        }
      } catch {
        // ignore
      }
      const initialTab: ConsoleTab = {
        id: "tab-1",
        label: "Query 1",
        query: defaultQuery,
        results: null,
        executionTime: undefined,
        error: null,
      };
      setTabs([initialTab]);
      setActiveTabId("tab-1");
    }
  }, [connection.id, tabsStorageKey, defaultQuery]);

  // Persist tabs and activeTabId to sessionStorage
  useEffect(() => {
    if (tabs.length === 0) return;
    try {
      sessionStorage.setItem(
        tabsStorageKey,
        JSON.stringify({
          tabs: tabs.map((tab) => ({
            ...tab,
            query: containsCredentials(tab.query) ? "" : tab.query,
            results: null,
            statementResults: undefined,
            outputEntries: undefined,
            explainResult: null,
            error: null,
            executionTime: undefined,
          })),
          activeTabId,
        }),
      );
    } catch {
      // Handle quota exceeded (e.g., large query results)
      try {
        const lightweightTabs = tabs.map((t) => ({
          ...t,
          query: containsCredentials(t.query) ? "" : t.query,
          results: null,
          statementResults: undefined,
          outputEntries: undefined,
          explainResult: null,
          error: null,
        }));
        sessionStorage.setItem(
          tabsStorageKey,
          JSON.stringify({ tabs: lightweightTabs, activeTabId }),
        );
      } catch {
        // ignore
      }
    }
  }, [tabs, activeTabId, tabsStorageKey]);

  const activeTab = useMemo(() => {
    return (
      tabs.find((t) => t.id === activeTabId) ||
      tabs[0] || {
        id: "tab-1",
        label: "Query 1",
        query: "",
        results: null,
        executionTime: undefined,
        error: null,
      }
    );
  }, [tabs, activeTabId]);

  const query = activeTab.query;
  const [activeStatementResultId, setActiveStatementResultId] = useState<
    string | null
  >(null);
  const selectedStatementResult =
    activeTab.statementResults?.find(
      (statement) => statement.id === activeStatementResultId,
    ) ?? activeTab.statementResults?.at(-1);
  const result = selectedStatementResult
    ? selectedStatementResult.result
    : activeTab.results;
  const error = selectedStatementResult
    ? (selectedStatementResult.error ?? null)
    : (activeTab.error ?? null);
  const editorViewRef = useRef<EditorView | null>(null);
  const [hasEditorSelection, setHasEditorSelection] = useState(false);
  const [sortState, setSortState] = useState<{
    column: string;
    descending: boolean;
  } | null>(null);
  const [showLimitWarning, setShowLimitWarning] = useState(false);
  const [pendingRunStatements, setPendingRunStatements] = useState<string[]>(
    [],
  );

  // Execution Plan states
  const [isExplaining, setIsExplaining] = useState(false);
  const [activeResultsTab, setActiveResultsTab] = useState<
    "results" | "plan" | "output"
  >("results");
  const [planExpandAll, setPlanExpandAll] = useState<boolean | null>(null);
  const [copiedPlan, setCopiedPlan] = useState(false);

  // AI Query Assistant States (Prompt 3.2)
  const [isAiBarOpen, setIsAiBarOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiGeneratedResult, setAiGeneratedResult] =
    useState<AIQueryAssistResponse | null>(null);

  const [isFixingWithAi, setIsFixingWithAi] = useState(false);
  const [aiFixedResult, setAiFixedResult] =
    useState<AIQueryAssistResponse | null>(null);

  const [isOptimizingWithAi, setIsOptimizingWithAi] = useState(false);
  const [aiOptimizationResult, setAiOptimizationResult] =
    useState<AIQueryAssistResponse | null>(null);

  const [aiErrorNotice, setAiErrorNotice] = useState<string | null>(null);
  const [copiedIndexDdl, setCopiedIndexDdl] = useState<string | null>(null);
  const [aiToast, setAiToast] = useState<string | null>(null);

  const showAiToast = useCallback((msg: string) => {
    setAiToast(msg);
    setTimeout(() => setAiToast(null), TOAST_DURATION_MS);
  }, []);

  const [isRunning, setIsRunning] = useState(false);
  const {
    states: transactionStates,
    transition: transactionTransition,
    execute: executeTransaction,
    finish: finishTransaction,
  } = useConsoleTransactions(connection, workspaceTabId, showAiToast);
  const transaction =
    transactionStates[activeTab.id] ?? getDefaultConsoleTransaction(connection);
  const manualUnavailable = connection.read_only
    ? t("console.transaction.readOnly")
    : !["postgres", "mysql"].includes(connection.type)
      ? t("console.transaction.unsupported")
      : null;
  const [switchToAutoOpen, setSwitchToAutoOpen] = useState(false);
  const [isFinishingTransaction, setIsFinishingTransaction] = useState(false);
  const hasUncommittedWork =
    Object.values(transactionStates).some((state) =>
      Boolean(state.sessionId),
    ) ||
    (isRunning && transaction.mode === "manual");
  useEffect(() => {
    if (workspaceTabId)
      window.dispatchEvent(
        new CustomEvent("pb:console-transaction-dirty", {
          detail: { tabId: workspaceTabId, isDirty: hasUncommittedWork },
        }),
      );
  }, [workspaceTabId, hasUncommittedWork]);
  const finishActiveTransaction = async (
    action: "commit" | "rollback" | "close",
    switchToAuto = false,
  ) => {
    setIsFinishingTransaction(true);
    try {
      const finished = await finishTransaction(activeTab.id, action);
      if (action === "rollback" && finished)
        showAiToast(t("console.transaction.rolledBack"));
      if (switchToAuto) {
        transactionTransition(activeTab.id, { type: "mode", mode: "auto" });
        setSwitchToAutoOpen(false);
      }
    } catch (error) {
      showAiToast(
        error instanceof Error
          ? error.message
          : t("console.transaction.failed"),
      );
    } finally {
      setIsFinishingTransaction(false);
    }
  };

  // Condensed schema context for prompt injection
  const condensedSchema = useMemo<TableSchemaSummary[]>(() => {
    return (tables || []).slice(0, 30).map((t) => ({
      name: t.name,
      columns: t.columns.map((c) => `${c.name} (${c.type})`),
      primary_keys: t.columns
        .filter((c) => c.is_primary_key)
        .map((c) => c.name),
      foreign_keys: (t.relations || []).map(
        (r) => `${r.from_column} -> ${r.to_table}.${r.to_column}`,
      ),
    }));
  }, [tables]);

  // Handle Text-to-Query Generation
  const handleGenerateQuery = async (customPrompt?: string) => {
    const promptText = (customPrompt || aiPrompt).trim();
    if (!promptText || isGeneratingAi) return;

    setIsGeneratingAi(true);
    setAiErrorNotice(null);
    setAiGeneratedResult(null);

    try {
      const res = await queryAssist({
        mode: "generate",
        engine: connection.type,
        prompt: promptText,
        schema: condensedSchema,
      });
      setAiGeneratedResult(res);
    } catch (err: any) {
      setAiErrorNotice(err?.message || t("ai.generateFailed"));
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Handle Error Remediation
  const handleFixWithAi = async () => {
    if (!error || isFixingWithAi) return;

    setIsFixingWithAi(true);
    setAiErrorNotice(null);
    setAiFixedResult(null);

    try {
      const res = await queryAssist({
        mode: "fix",
        engine: connection.type,
        current_query: query,
        error_message: error,
        schema: condensedSchema,
      });
      setAiFixedResult(res);
    } catch (err: any) {
      setAiErrorNotice(err?.message || t("ai.fixFailed"));
    } finally {
      setIsFixingWithAi(false);
    }
  };

  // Handle Query Explain Optimization
  const handleOptimizeWithAi = async () => {
    if (!activeTab.explainResult?.plan || isOptimizingWithAi) return;

    setIsOptimizingWithAi(true);
    setAiErrorNotice(null);
    setAiOptimizationResult(null);

    try {
      const planStr =
        typeof activeTab.explainResult.plan === "string"
          ? activeTab.explainResult.plan
          : JSON.stringify(activeTab.explainResult.plan, null, 2);

      const res = await queryAssist({
        mode: "explain",
        engine: connection.type,
        current_query: query,
        explain_plan: planStr,
        schema: condensedSchema,
      });
      setAiOptimizationResult(res);
    } catch (err: any) {
      setAiErrorNotice(err?.message || t("ai.optimizeFailed"));
    } finally {
      setIsOptimizingWithAi(false);
    }
  };

  const handleCopyIndex = (ddl: string) => {
    navigator.clipboard.writeText(ddl);
    setCopiedIndexDdl(ddl);
    setTimeout(() => setCopiedIndexDdl(null), 2000);
  };

  // Tab management & close warning states
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const checkMissingLimit = useCallback((q: string): boolean => {
    const trimmed = q.trim();
    const isSelect = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*SELECT\b/i.test(
      trimmed,
    );
    const hasLimit = /\bLIMIT\b/i.test(trimmed);
    return isSelect && !hasLimit;
  }, []);

  const handleQueryChange = useCallback(
    (newQuery: string) => {
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id ? { ...t, query: newQuery } : t,
        ),
      );
      onQueryChange?.(newQuery);
      setShowLimitWarning((prev) =>
        prev && !checkMissingLimit(newQuery) ? false : prev,
      );
    },
    [activeTab.id, onQueryChange, checkMissingLimit],
  );

  const handleSelectTab = useCallback(
    (tabId: string) => {
      setActiveMode("console");
      if (tabId !== activeTabId) {
        setActiveTabId(tabId);
        setResultFilter("");
        setShowLimitWarning(false);
      }
    },
    [activeTabId],
  );

  const handleNewTab = useCallback(() => {
    setActiveMode("console");
    if (tabs.length >= 8) return;

    const newId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const existingNums = tabs
      .map((t) => {
        const m = t.label.match(/(?:Query|Tab)\s*(\d+)/i);
        return m ? parseInt(m[1], 10) : 0;
      })
      .filter((n) => !isNaN(n));
    const nextNum =
      existingNums.length > 0 ? Math.max(...existingNums) + 1 : tabs.length + 1;
    const newLabel = `Query ${nextNum}`;

    const newTab: ConsoleTab = {
      id: newId,
      label: newLabel,
      query: buildExampleQuery(connection.type, tables),
      results: null,
      executionTime: undefined,
      error: null,
    };

    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newId);
    setResultFilter("");
    setShowLimitWarning(false);
  }, [tabs, connection.type, tables, buildExampleQuery]);

  const handleConfirmCloseTab = useCallback(
    async (tabId: string) => {
      if (isRunning || isFinishingTransaction) return;
      setIsFinishingTransaction(true);
      try {
        await finishTransaction(tabId, "close");
      } catch (error) {
        showAiToast(
          error instanceof Error
            ? error.message
            : t("console.transaction.closeFailed"),
        );
        setIsFinishingTransaction(false);
        return;
      }
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== tabId);
        if (remaining.length === 0) {
          const fallbackTab: ConsoleTab = {
            id: `tab-${Date.now()}`,
            label: "Query 1",
            query: "",
            results: null,
            executionTime: undefined,
            error: null,
          };
          setActiveTabId(fallbackTab.id);
          return [fallbackTab];
        }

        if (activeTabId === tabId) {
          const closedIndex = prev.findIndex((t) => t.id === tabId);
          const nextTab =
            remaining[closedIndex] ||
            remaining[closedIndex - 1] ||
            remaining[0];
          setActiveTabId(nextTab.id);
        }
        return remaining;
      });
      setIsFinishingTransaction(false);
      setClosingTabId(null);
      setResultFilter("");
      setShowLimitWarning(false);
    },
    [
      activeTabId,
      finishTransaction,
      showAiToast,
      t,
      isRunning,
      isFinishingTransaction,
    ],
  );

  const handleRequestCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      if (isRunning || isFinishingTransaction) return;
      const tabToClose = tabs.find((t) => t.id === tabId);
      if (!tabToClose) return;

      if (
        transactionStates[tabId]?.sessionId ||
        tabToClose.query.trim().length > 0
      ) {
        setClosingTabId(tabId);
      } else {
        handleConfirmCloseTab(tabId);
      }
    },
    [
      tabs,
      handleConfirmCloseTab,
      transactionStates,
      isRunning,
      isFinishingTransaction,
    ],
  );

  const handleStartRename = useCallback(
    (tabId: string, currentLabel: string) => {
      setEditingTabId(tabId);
      setEditingLabel(currentLabel);
    },
    [],
  );

  const handleSaveRename = useCallback(() => {
    if (!editingTabId) return;
    const trimmed = editingLabel.trim();
    if (trimmed) {
      setTabs((prev) =>
        prev.map((t) => (t.id === editingTabId ? { ...t, label: trimmed } : t)),
      );
    }
    setEditingTabId(null);
  }, [editingTabId, editingLabel]);

  const handleCancelRename = useCallback(() => {
    setEditingTabId(null);
  }, []);

  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [resultFilter, setResultFilter] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);

  // Query Library state
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saveFolder, setSaveFolder] = useState("");
  const [saveTags, setSaveTags] = useState("");
  const [saveIsFavorite, setSaveIsFavorite] = useState(false);
  const [libRefreshKey, setLibRefreshKey] = useState(0);
  const [saveToast, setSaveToast] = useState(false);

  // Collapsible & Resizable Results Panel State
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false);
  // Responsively scale editor height based on viewport height (default ~35% of screen, leaving >=65% for results)
  const [editorHeight, setEditorHeight] = useState(() => {
    if (typeof window !== "undefined") {
      return Math.min(
        420,
        Math.max(160, Math.floor(window.innerHeight * 0.35)),
      );
    }
    return 300;
  });
  const [isDragging, setIsDragging] = useState(false);

  const handlePointerDownResizer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
      const startY = e.clientY;
      const startHeight = editorHeight;

      const handlePointerMove = (moveEvent: globalThis.PointerEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const maxAllowedHeight =
          typeof window !== "undefined"
            ? Math.max(160, window.innerHeight - 200)
            : 700;
        const newHeight = Math.min(
          Math.max(QUERY_EDITOR_MIN_HEIGHT, startHeight + deltaY),
          maxAllowedHeight,
        );
        setEditorHeight(newHeight);
      };

      const handlePointerUp = () => {
        setIsDragging(false);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
        window.removeEventListener("pointercancel", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
      window.addEventListener("pointercancel", handlePointerUp);
    },
    [editorHeight],
  );

  const handleCopyHistory = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHistoryId(id);
    setTimeout(() => setCopiedHistoryId(null), COPY_FEEDBACK_MS);
  };

  // History State
  const storageKey = STORAGE_KEYS.queryHistory(connection.id);
  const [history, setHistory] = useState<QueryHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return readQueryHistory(saved);
    } catch {
      return [];
    }
  });

  // Keep history synced when connection.id changes
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      setHistory(readQueryHistory(saved));
    } catch {
      setHistory([]);
    }
  }, [storageKey]);

  useEffect(() => {
    const refresh = () => {
      try {
        setHistory(readQueryHistory(localStorage.getItem(storageKey)));
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
      const example = buildExampleQuery(connection.type, tables);
      handleQueryChange(example);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTab.id ? { ...t, results: null, error: null } : t,
        ),
      );
    }
  }, [tables, connection.type, isMongo, buildExampleQuery, onQueryChange]);

  const saveHistory = useCallback(
    (item: Omit<QueryHistoryItem, "id" | "timestamp">) => {
      const newItem: QueryHistoryItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        timestamp: Date.now(),
        ...item,
      };
      setHistory((prev) => {
        let existing = prev;
        try {
          existing = readQueryHistory(localStorage.getItem(storageKey));
        } catch {
          /* storage unavailable */
        }
        const next = appendQueryHistory(existing, newItem);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
          queueMicrotask(() =>
            window.dispatchEvent(new Event("pb:query-history-changed")),
          );
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
      window.dispatchEvent(new Event("pb:query-history-changed"));
    } catch {
      // ignore
    }
  };

  // Save Query handler
  const handleSaveQuery = async () => {
    const trimmed = query.trim();
    if (!trimmed || !saveTitle.trim()) return;
    const tags = saveTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (containsCredentials(trimmed)) {
      showAiToast(t("console.storageCredentialWarning"));
      return;
    }
    try {
      await createSavedQuery(connection.id, {
        title: saveTitle.trim(),
        query: trimmed,
        folder: saveFolder.trim(),
        tags,
        is_favorite: saveIsFavorite,
      });
      setIsSaveDialogOpen(false);
      setSaveTitle("");
      setSaveFolder("");
      setSaveTags("");
      setSaveIsFavorite(false);
      setLibRefreshKey((k) => k + 1);
      window.dispatchEvent(new Event("pb:saved-queries-changed"));
      // Show a brief toast
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), TOAST_DURATION_MS);
    } catch {
      /* ignore */
    }
  };

  const confirmConsoleStatements = useCallback(
    (statements: string[]) => {
      const count = statements.filter((statement) =>
        isWritingStatement(statement, connection.type),
      ).length;
      return (
        connection.environment !== "production" ||
        count === 0 ||
        window.confirm(
          `Run on production: ${connection.name}?\n${count} statement${count === 1 ? "" : "s"} may write data or change database state.`,
        )
      );
    },
    [connection.type, connection.environment, connection.name],
  );

  // All console execution passes through this function so confirmation and
  // pinned-session behavior can be added at one boundary in Phase 4B.
  const runStatements = useCallback(
    async (statements: string[]) => {
      const runnable = statements
        .map((statement) => statement.trim())
        .filter(Boolean);
      if (!runnable.length || isRunning || isFinishingTransaction) return;
      if (!confirmConsoleStatements(runnable)) return;

      const targetTabId = activeTab.id;
      const statementResults: ConsoleStatementResult[] = [];
      const outputEntries: ConsoleOutputEntry[] = [];
      setIsRunning(true);
      setActiveResultsTab("results");
      setActiveStatementResultId(null);
      setTabs((prev) =>
        prev.map((tab) =>
          tab.id === targetTabId
            ? {
                ...tab,
                results: null,
                error: null,
                statementResults: [],
                outputEntries: [
                  {
                    id: `run-${Date.now()}`,
                    statement: "",
                    message: `Running ${runnable.length} statement${runnable.length === 1 ? "" : "s"}`,
                    status: "running",
                  },
                ],
              }
            : tab,
        ),
      );

      try {
        for (const statement of runnable) {
          const statementId = `statement-${Date.now()}-${statementResults.length}`;
          const started = performance.now();
          try {
            const response = await executeTransaction(
              targetTabId,
              statement,
              isWritingStatement(statement, connection.type),
            );
            const roundTrip = Number((performance.now() - started).toFixed(2));
            const executionTime =
              response.execution_time_ms > 0
                ? response.execution_time_ms
                : Math.max(0.01, roundTrip);
            const enriched: RawQueryResult = {
              ...response,
              execution_time_ms: executionTime,
              round_trip_ms: roundTrip,
            };
            statementResults.push({
              id: statementId,
              statement,
              result: enriched,
            });
            outputEntries.push({
              id: statementId,
              statement,
              message: `${response.rows.length} row${response.rows.length === 1 ? "" : "s"} · ${executionTime} ms`,
              status: "success",
            });
            setActiveStatementResultId(statementId);
            setTabs((prev) =>
              prev.map((tab) =>
                tab.id === targetTabId
                  ? {
                      ...tab,
                      results: enriched,
                      executionTime,
                      error: null,
                      statementResults: [...statementResults],
                      outputEntries: [...outputEntries],
                    }
                  : tab,
              ),
            );
            saveHistory({
              query: statement,
              execution_time_ms: executionTime,
              round_trip_ms: roundTrip,
              is_mutation: response.is_mutation,
              row_count: response.rows.length,
            });
            emitOperationEvent({
              kind: "query",
              severity: "success",
              title: t("operations.querySucceeded", "Query completed"),
              message: t("operations.queryResultSummary", {
                rows: response.rows.length,
                time: executionTime,
                defaultValue: "{{rows}} rows · {{time}} ms",
              }),
              connectionId: connection.id,
              connectionName: connection.name,
              tabId: targetTabId,
            });
          } catch (err: unknown) {
            const message =
              err instanceof Error ? err.message : "Execution error";
            statementResults.push({
              id: statementId,
              statement,
              result: null,
              error: message,
            });
            outputEntries.push({
              id: statementId,
              statement,
              message,
              status: "error",
            });
            setActiveStatementResultId(statementId);
            setTabs((prev) =>
              prev.map((tab) =>
                tab.id === targetTabId
                  ? {
                      ...tab,
                      error: message,
                      statementResults: [...statementResults],
                      outputEntries: [...outputEntries],
                    }
                  : tab,
              ),
            );
            saveHistory({ query: statement, error: message });
            emitOperationEvent({
              kind: "query",
              severity: "error",
              title: t("operations.queryFailed", "Query failed"),
              message: t(
                "operations.queryFailureSafe",
                "The query could not be completed. See the query console for details.",
              ),
              connectionId: connection.id,
              connectionName: connection.name,
              tabId: targetTabId,
            });
            break;
          }
        }
      } finally {
        setIsRunning(false);
      }
    },
    [
      isRunning,
      isFinishingTransaction,
      executeTransaction,
      confirmConsoleStatements,
      activeTab.id,
      connection.id,
      connection.name,
      connection.type,
      saveHistory,
      t,
    ],
  );

  const executeQuery = useCallback(
    (queryToRun: string) =>
      runStatements(
        splitQueryStatements(queryToRun, isMongo ? "mongodb" : "sql").map(
          (item) => item.statement,
        ),
      ),
    [runStatements, isMongo],
  );

  // Run Query handler (validates LIMIT for SELECT queries)
  const handleRun = useCallback(async () => {
    const statements = splitQueryStatements(
      query,
      isMongo ? "mongodb" : "sql",
    ).map((item) => item.statement);
    if (!statements.length || isRunning) return;

    if (!isMongo && statements.some(checkMissingLimit)) {
      setPendingRunStatements(statements);
      setShowLimitWarning(true);
      return;
    }

    setShowLimitWarning(false);
    setPendingRunStatements([]);
    await runStatements(statements);
  }, [query, isRunning, isMongo, checkMissingLimit, runStatements]);

  const statementsAtEditorSelection = useCallback(
    (selectionOnly: boolean) => {
      const view = editorViewRef.current;
      if (!view) return [];
      const selection = view.state.selection.main;
      const source = view.state.doc.toString();
      if (selectionOnly) {
        if (selection.empty) return [];
        return splitQueryStatements(
          view.state.sliceDoc(selection.from, selection.to),
          isMongo ? "mongodb" : "sql",
        ).map((item) => item.statement);
      }
      if (!selection.empty) {
        return splitQueryStatements(
          view.state.sliceDoc(selection.from, selection.to),
          isMongo ? "mongodb" : "sql",
        ).map((item) => item.statement);
      }
      const range = splitQueryStatements(
        source,
        isMongo ? "mongodb" : "sql",
      ).find(
        (item) => selection.head >= item.start && selection.head <= item.end,
      );
      return range ? [range.statement] : [];
    },
    [isMongo],
  );

  const runRequestedStatements = useCallback(
    async (statements: string[]) => {
      if (!statements.length || isRunning) return;
      if (!isMongo && statements.some(checkMissingLimit)) {
        setPendingRunStatements(statements);
        setShowLimitWarning(true);
        return;
      }
      setPendingRunStatements([]);
      setShowLimitWarning(false);
      await runStatements(statements);
    },
    [isMongo, isRunning, checkMissingLimit, runStatements],
  );

  const handleRunAtCaret = useCallback(
    () => runRequestedStatements(statementsAtEditorSelection(false)),
    [runRequestedStatements, statementsAtEditorSelection],
  );
  const handleRunSelection = useCallback(
    () => runRequestedStatements(statementsAtEditorSelection(true)),
    [runRequestedStatements, statementsAtEditorSelection],
  );

  const handleRunAnyway = useCallback(async () => {
    setShowLimitWarning(false);
    const statements = pendingRunStatements.length
      ? pendingRunStatements
      : [query];
    setPendingRunStatements([]);
    await runStatements(statements);
  }, [query, pendingRunStatements, runStatements]);

  const handleAddLimit = useCallback(async () => {
    let newQuery = query.trim();
    if (newQuery.endsWith(";")) {
      newQuery = newQuery.slice(0, -1).trim() + " LIMIT 100;";
    } else {
      newQuery = newQuery + " LIMIT 100";
    }
    handleQueryChange(newQuery);
    setShowLimitWarning(false);
    await executeQuery(newQuery);
  }, [query, handleQueryChange, executeQuery]);

  // Explain Query handler
  const handleExplain = useCallback(async () => {
    const trimmed = statementsAtEditorSelection(false)[0]?.trim() ?? "";
    if (connection.type !== "postgres" || !trimmed || isExplaining || isRunning)
      return;

    if (transaction.aborted || isFinishingTransaction) return;
    if (transaction.mode === "manual") {
      await runStatements([`EXPLAIN ${trimmed.replace(/^explain\s+/i, "")}`]);
      return;
    }
    if (!confirmConsoleStatements([trimmed])) return;

    setIsExplaining(true);
    const targetTabId = activeTab.id;

    // Clear previous errors
    setTabs((prev) =>
      prev.map((t) => (t.id === targetTabId ? { ...t, error: null } : t)),
    );

    try {
      const res = await explainQuery(connection.id, trimmed);
      setTabs((prev) =>
        prev.map((t) =>
          t.id === targetTabId
            ? {
                ...t,
                explainResult: res,
                error: null,
              }
            : t,
        ),
      );
      // Auto-switch to the plan tab to display the result
      setActiveResultsTab("plan");
      setPlanExpandAll(null);
    } catch (err: any) {
      const msg = err.message || "Failed to explain query";
      setTabs((prev) =>
        prev.map((t) => (t.id === targetTabId ? { ...t, error: msg } : t)),
      );
      setActiveResultsTab("plan");
    } finally {
      setIsExplaining(false);
    }
  }, [
    statementsAtEditorSelection,
    transaction.mode,
    transaction.aborted,
    isFinishingTransaction,
    runStatements,
    confirmConsoleStatements,
    isExplaining,
    isRunning,
    activeTab.id,
    connection.id,
    connection.type,
  ]);

  // Copy Plan JSON
  const handleCopyPlan = useCallback(() => {
    if (!activeTab.explainResult?.plan) return;
    navigator.clipboard.writeText(
      typeof activeTab.explainResult.plan === "string"
        ? activeTab.explainResult.plan
        : JSON.stringify(activeTab.explainResult.plan, null, 2),
    );
    setCopiedPlan(true);
    setTimeout(() => setCopiedPlan(false), 2000);
  }, [activeTab.explainResult]);

  // Shell commands are routed to one workspace tab by ID. This avoids hidden
  // query consoles reacting to the same global run/history shortcut.
  useEffect(() => {
    const handleWorkspaceQueryCommand = (event: Event) => {
      const commandEvent = event as CustomEvent<{
        tabId: string;
        command: "run" | "explain" | "history";
      }>;
      if (commandEvent.detail?.tabId !== activeTab.id) return;
      if (commandEvent.detail.command === "run") void handleRun();
      if (commandEvent.detail.command === "explain") void handleExplain();
      if (commandEvent.detail.command === "history") setIsHistoryOpen(true);
    };
    window.addEventListener("pb:query-command", handleWorkspaceQueryCommand);
    return () =>
      window.removeEventListener(
        "pb:query-command",
        handleWorkspaceQueryCommand,
      );
  }, [activeTab.id, handleExplain, handleRun]);

  useEffect(() => {
    const handleReviewAIDraft = (event: Event) => {
      const detail = (event as CustomEvent<{ tabId: string; query: string }>)
        .detail;
      if (detail?.tabId === workspaceTabId && typeof detail.query === "string")
        handleQueryChange(detail.query);
    };
    window.addEventListener("pb:review-ai-query", handleReviewAIDraft);
    return () =>
      window.removeEventListener("pb:review-ai-query", handleReviewAIDraft);
  }, [workspaceTabId, handleQueryChange]);

  // CodeMirror Extensions with Dialect, Keymaps & Dynamic Autocomplete
  const extensions = useMemo(() => {
    const runKeymap = keymap.of([
      {
        key: "Mod-Shift-Enter",
        run: () => {
          handleRun();
          return true;
        },
      },
      {
        key: "Mod-Enter",
        run: () => {
          handleRunAtCaret();
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
        javascript(),
        javascriptLanguage.data.of({
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
  }, [isMongo, isMysql, isSqlite, tables, handleRun, handleRunAtCaret]);

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
          query: `db.${firstTable}.find({}).sort({ _id: -1 }).limit(50)`,
        },
        {
          label: t("console.templateMongoCount"),
          query: `db.${firstTable}.countDocuments({})`,
        },
        {
          label: t("console.templateMongoAgg"),
          query: `db.${firstTable}.aggregate([\n  { $match: {} },\n  { $limit: 20 }\n])`,
        },
        {
          label: t("console.templateMongoUpdate"),
          query: `db.${firstTable}.updateMany({ status: "pending" }, { $set: { status: "processed" } })`,
        },
        {
          label: t("console.templateMongoInsert"),
          query: `db.${firstTable}.insertOne({\n  name: "New Document",\n  createdAt: new Date()\n})`,
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
    const term = resultFilter.toLowerCase();
    const rows = !term
      ? [...result.rows]
      : result.rows.filter((row) =>
          Object.values(row).some(
            (v) =>
              v !== null &&
              v !== undefined &&
              String(v).toLowerCase().includes(term),
          ),
        );
    if (sortState) {
      rows.sort((left, right) => {
        const a = left[sortState.column];
        const b = right[sortState.column];
        const comparison =
          a == null && b == null
            ? 0
            : a == null
              ? -1
              : b == null
                ? 1
                : typeof a === "number" && typeof b === "number"
                  ? a - b
                  : String(a).localeCompare(String(b), undefined, {
                      numeric: true,
                      sensitivity: "base",
                    });
        return sortState.descending ? -comparison : comparison;
      });
    }
    return rows;
  }, [result, resultFilter, sortState]);

  const resultsContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library, react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: displayedRows.length,
    getScrollElement: () => resultsContainerRef.current,
    estimateSize: () => VIRTUALIZER_QUERY_ROW_HEIGHT,
    overscan: VIRTUALIZER_OVERSCAN,
  });

  const copyToClipboard = (text: string, cellKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell(cellKey);
    setTimeout(() => setCopiedCell(null), COPY_FEEDBACK_MS);
  };

  const handleCopyResults = useCallback(() => {
    if (!result || !result.columns.length) return;
    const lines = [
      result.columns.join("\t"),
      ...displayedRows.map((row) =>
        result.columns
          .map((column) => {
            const value = row[column];
            return value == null
              ? ""
              : typeof value === "object"
                ? JSON.stringify(value)
                : String(value);
          })
          .join("\t"),
      ),
    ];
    void navigator.clipboard.writeText(lines.join("\n"));
  }, [result, displayedRows]);

  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const term = historySearch.toLowerCase();
    return history.filter((h) => h.query.toLowerCase().includes(term));
  }, [history, historySearch]);

  return (
    <div className="bg-background dark:bg-background flex h-full flex-1 flex-col overflow-hidden select-text">
      {/* Top Header */}
      <div className="border-border bg-background dark:border-border dark:bg-card/40 flex min-h-9 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-1">
        <div className="flex shrink-0 items-center gap-2">
          {onNavigateToTable && tables.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onNavigateToTable(tables[0].name)}
              className="text-muted-foreground hover:text-foreground dark:hover:text-foreground -ml-1 h-7 shrink-0 gap-1 font-mono text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="whitespace-nowrap">
                {t("console.backToTable")}
              </span>
            </Button>
          )}

          <div className="ml-1 flex shrink-0 items-center gap-1.5">
            <Terminal className="text-success dark:text-success h-4 w-4 shrink-0" />
            <span className="text-foreground font-mono text-xs font-semibold whitespace-nowrap">
              {t("console.title")}
            </span>
          </div>

          <Badge
            variant="outline"
            className="border-primary/30 bg-success/10 text-success dark:text-success h-4 shrink-0 px-1.5 py-0 font-mono text-[10px] uppercase"
          >
            {connection.type}
          </Badge>

          {isMongo && (
            <div className="border-border bg-muted dark:border-border/60 dark:bg-muted/80 ml-2 flex shrink-0 items-center rounded-md border p-0.5">
              <button
                type="button"
                onClick={() => setActiveMode("console")}
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 font-mono text-xs transition-all",
                  activeMode === "console"
                    ? "bg-background text-foreground dark:bg-card dark:text-foreground font-semibold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground dark:hover:text-foreground",
                )}
              >
                <Terminal className="size-3" />
                <span>Console</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("pipeline")}
                className={cn(
                  "flex cursor-pointer items-center gap-1 rounded px-2 py-0.5 font-mono text-xs transition-all",
                  activeMode === "pipeline"
                    ? "bg-background text-success dark:bg-card dark:text-success font-semibold shadow-2xs"
                    : "text-muted-foreground hover:text-foreground dark:hover:text-foreground",
                )}
              >
                <Layers className="text-success size-3" />
                <span>{t("pipeline.title")}</span>
              </button>
            </div>
          )}

          {connection.read_only && (
            <Badge
              variant="outline"
              className="border-warning/40 bg-warning/10 text-warning dark:text-warning h-4 shrink-0 gap-1 px-1.5 py-0 font-mono text-[10px] uppercase"
            >
              <ShieldAlert className="text-warning dark:text-warning h-2.5 w-2.5 shrink-0" />
              <span>{t("connection.readOnlyBadge")}</span>
            </Badge>
          )}
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {/* Sample Templates */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  title={t("console.sampleTemplates")}
                  className="border-border text-muted-foreground dark:border-border dark:text-foreground h-7 shrink-0 gap-1 font-mono text-xs"
                >
                  <Sparkles className="text-warning h-3 w-3 shrink-0" />
                  <span className="hidden whitespace-nowrap xl:inline">
                    {t("console.sampleTemplates")}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-64 font-mono text-xs">
              {sampleTemplates.map((item, i) => (
                <DropdownMenuItem
                  key={i}
                  onClick={() => handleQueryChange(item.query)}
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
            title={t("console.history")}
            className="border-border text-muted-foreground dark:border-border dark:text-foreground h-7 shrink-0 gap-1 font-mono text-xs"
          >
            <History className="h-3 w-3 shrink-0" />
            <span className="hidden whitespace-nowrap sm:inline">
              {t("console.history")}
            </span>
            {history.length > 0 && (
              <span className="bg-muted text-foreground dark:bg-muted dark:text-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-center font-sans text-[10px] leading-none font-semibold tabular-nums select-none">
                {history.length}
              </span>
            )}
          </Button>

          {/* Clear Editor */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              handleQueryChange("");
              setShowLimitWarning(false);
            }}
            title={t("console.clear")}
            className="text-muted-foreground hover:text-foreground dark:hover:text-foreground inline-flex h-7 shrink-0 items-center justify-center gap-1.5 font-mono text-xs"
          >
            <Trash2 className="size-3.5 shrink-0" />
            <span className="hidden translate-y-px leading-none whitespace-nowrap md:inline">
              {t("console.clear")}
            </span>
          </Button>

          <div
            className="flex items-center gap-1"
            title={manualUnavailable ?? t("console.transaction.mode")}
          >
            <select
              aria-label={t("console.transaction.mode")}
              value={transaction.mode}
              disabled={isRunning || isFinishingTransaction}
              className="border-border bg-background h-7 rounded border px-2 text-xs"
              onChange={(event) => {
                if (event.target.value === "auto" && transaction.sessionId)
                  setSwitchToAutoOpen(true);
                else
                  transactionTransition(activeTab.id, {
                    type: "mode",
                    mode: event.target.value as "auto" | "manual",
                  });
              }}
            >
              <option value="auto">{t("console.transaction.auto")}</option>
              <option
                value="manual"
                disabled={Boolean(manualUnavailable)}
                title={manualUnavailable ?? undefined}
              >
                {t("console.transaction.manual")}
              </option>
            </select>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={
                !transaction.sessionId ||
                transaction.aborted ||
                isRunning ||
                isFinishingTransaction
              }
              onClick={() => void finishActiveTransaction("commit")}
            >
              {t("console.transaction.commit")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={
                !transaction.sessionId || isRunning || isFinishingTransaction
              }
              onClick={() => void finishActiveTransaction("rollback")}
            >
              {t("console.transaction.rollback")}
            </Button>
            {transaction.pending > 0 && (
              <Badge variant="outline">
                {t("console.transaction.pending", {
                  count: transaction.pending,
                })}
              </Badge>
            )}
            {transaction.aborted && (
              <span role="alert" className="text-destructive text-xs">
                {t("console.transaction.aborted")}
              </span>
            )}
          </div>

          {/* Run Query CTA */}
          <Button
            type="button"
            size="sm"
            onClick={handleRunAtCaret}
            disabled={
              isRunning ||
              isFinishingTransaction ||
              transaction.aborted ||
              !query.trim()
            }
            title={getShortcutTooltip("runQuery")}
            aria-keyshortcuts={SHORTCUTS.runQueryFull}
            className="bg-primary hover:bg-primary/90 h-7 shrink-0 cursor-pointer gap-1.5 text-xs font-semibold text-white shadow-xs transition-all"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="whitespace-nowrap">
                  {t("console.running")}
                </span>
              </>
            ) : (
              <>
                <Play className="h-3 w-3 shrink-0 fill-current" />
                <span className="whitespace-nowrap">Run statement</span>
                <kbd className="bg-success/80 text-success hidden items-center rounded px-1.5 py-0.5 font-mono text-[9px] leading-none font-medium tracking-tight sm:inline-flex">
                  {SHORTCUTS.runQuery}
                </kbd>
              </>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  disabled={
                    isRunning ||
                    isFinishingTransaction ||
                    transaction.aborted ||
                    !query.trim()
                  }
                  aria-label="More run options"
                  title="Run all statements or the selected text"
                  className="h-7 w-7"
                >
                  <ChevronDown className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => void handleRun()}>
                Run all statements <kbd className="ml-auto pl-4">F5</kbd>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={!hasEditorSelection}
                onClick={() => void handleRunSelection()}
              >
                Run selection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled
            title="SQL formatter dependency is not installed."
            aria-label="Format query unavailable"
            className="h-7 px-2 text-xs"
          >
            Format
          </Button>

          {/* Ask AI CTA (Prompt 3.2.1) */}
          <Button
            type="button"
            size="sm"
            onClick={() => setIsAiBarOpen((v) => !v)}
            title={t("ai.askAiTooltip")}
            className={cn(
              "h-7 shrink-0 cursor-pointer gap-1.5 border text-xs font-semibold shadow-xs transition-all",
              isAiBarOpen
                ? "border-primary/50 bg-primary/15 text-primary dark:border-primary/40 dark:bg-primary/20 dark:text-primary"
                : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 dark:border-primary/30 dark:bg-primary/10 dark:text-primary dark:hover:bg-primary/20",
            )}
          >
            <Sparkles className="text-primary dark:text-primary size-3.5" />
            <span className="whitespace-nowrap">{t("ai.askAi")}</span>
          </Button>

          {/* Explain Query CTA */}
          <Button
            type="button"
            size="sm"
            onClick={handleExplain}
            disabled={
              isMongo ||
              connection.type !== "postgres" ||
              isExplaining ||
              isRunning ||
              !query.trim()
            }
            title={
              connection.type !== "postgres"
                ? "Explain is available for PostgreSQL connections only."
                : t("console.explain.tooltip")
            }
            className="bg-warning hover:bg-warning h-7 shrink-0 cursor-pointer gap-1.5 text-xs font-semibold text-white shadow-xs transition-all"
          >
            {isExplaining ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="hidden whitespace-nowrap md:inline">
                  {t("console.explain.explaining")}
                </span>
              </>
            ) : (
              <>
                <FileSearch className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden whitespace-nowrap md:inline">
                  {t("console.explain.button")}
                </span>
              </>
            )}
          </Button>

          {/* Save Query */}
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setSaveTitle("");
              setSaveTags("");
              setSaveIsFavorite(false);
              setIsSaveDialogOpen(true);
            }}
            disabled={!query.trim()}
            title={t("savedQuery.save")}
            className="bg-primary hover:bg-primary/90 h-7 shrink-0 gap-1.5 border-0 text-xs font-semibold text-white shadow-xs transition-all disabled:opacity-40"
          >
            <Save className="h-3 w-3 shrink-0" />
            <span className="hidden whitespace-nowrap lg:inline">
              {t("savedQuery.save")}
            </span>
          </Button>

          {/* Library Toggle */}
          <Button
            type="button"
            size="sm"
            onClick={() => setIsLibraryOpen((v) => !v)}
            title={t("savedQuery.library")}
            className={cn(
              "h-7 shrink-0 gap-1.5 border text-xs font-semibold transition-all",
              isLibraryOpen
                ? "border-primary/30 hover:bg-primary/25 bg-success/15 text-success dark:text-success"
                : "border-border text-muted-foreground hover:bg-muted dark:border-border dark:text-muted-foreground dark:hover:bg-muted bg-transparent",
            )}
          >
            <BookOpen
              className={cn(
                "h-3 w-3 shrink-0",
                isLibraryOpen ? "text-success dark:text-success" : "",
              )}
            />
            <span className="hidden whitespace-nowrap lg:inline">
              {t("savedQuery.library")}
            </span>
          </Button>
        </div>
      </div>

      {/* Save toast — bottom-right floating */}
      {saveToast && (
        <div className="animate-in fade-in slide-in-from-bottom-2 border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground fixed right-6 bottom-6 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-xl">
          <div className="border-primary/30 bg-success/15 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
            <CheckCircle2 className="text-success dark:text-success h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-foreground">{t("savedQuery.saved")}</p>
            <p className="text-muted-foreground text-[10px] font-normal">
              {t("savedQuery.saveSuccess")}
            </p>
          </div>
        </div>
      )}

      {/* AI feedback toast */}
      {aiToast && (
        <div className="animate-in fade-in slide-in-from-bottom-2 border-primary/30 bg-background text-foreground dark:border-primary/40 dark:bg-card dark:text-foreground fixed right-6 bottom-6 z-50 flex items-center gap-2.5 rounded-xl border px-4 py-2.5 text-xs font-semibold shadow-xl">
          <div className="border-primary/30 bg-primary/15 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border">
            <Sparkles className="text-primary dark:text-primary h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-foreground">{aiToast}</p>
          </div>
        </div>
      )}

      {/* Read-Only Safety Notice */}
      {connection.read_only && (
        <div className="border-warning/25 bg-warning/10 text-warning dark:bg-warning/15 dark:text-warning flex items-center gap-2 border-b px-3 py-1 font-mono text-[11px]">
          <ShieldAlert className="text-warning dark:text-warning h-3 w-3 shrink-0" />
          <span>{t("console.readOnlyWarn")}</span>
        </div>
      )}

      {/* Missing LIMIT Warning Banner */}
      {showLimitWarning && (
        <div
          role="alert"
          className="animate-in fade-in slide-in-from-top-1 border-warning/30 bg-warning/10 text-warning dark:bg-warning/15 dark:text-warning flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 font-mono text-xs"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="text-warning dark:text-warning size-3.5 shrink-0" />
            <span className="leading-snug">{t("query.warn.no_limit")}</span>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRunAnyway}
              disabled={isRunning}
              className="border-warning/40 text-warning hover:bg-warning/20 dark:text-warning h-6 cursor-pointer bg-transparent text-[11px] font-medium"
            >
              {t("query.warn.run_anyway")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAddLimit}
              disabled={isRunning}
              className="bg-warning hover:bg-warning h-6 cursor-pointer text-[11px] font-semibold text-white shadow-2xs"
            >
              {t("query.warn.add_limit")}
            </Button>
            <button
              type="button"
              onClick={() => setShowLimitWarning(false)}
              className="text-warning/60 hover:bg-warning/15 hover:text-warning dark:text-warning/60 dark:hover:text-warning cursor-pointer rounded p-0.5 transition-colors"
              aria-label="Dismiss warning"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main content: Library Panel (optional) + Editor+Results */}
      <div className="flex flex-1 overflow-hidden">
        {/* Query Library Panel */}
        {isLibraryOpen && (
          <div className="border-border w-72 shrink-0 overflow-hidden border-r">
            <QueryLibraryPanel
              connectionId={connection.id}
              onLoadQuery={(q) => handleQueryChange(q)}
              refreshTrigger={libRefreshKey}
            />
          </div>
        )}

        {/* Editor + Results column */}
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* Query Console Tab Bar */}
          <div className="border-border bg-muted/90 dark:border-border dark:bg-card/90 flex h-8.5 shrink-0 items-center justify-between gap-1 overflow-x-auto border-b px-2 select-none">
            <div className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto py-0.5">
              {tabs.map((tab) => {
                const isActive =
                  activeMode === "console" && tab.id === activeTab.id;
                const isEditing = editingTabId === tab.id;

                return (
                  <div
                    key={tab.id}
                    onClick={() => handleSelectTab(tab.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleStartRename(tab.id, tab.label);
                    }}
                    className={cn(
                      "group relative flex h-7 cursor-pointer items-center gap-1.5 rounded-t border-x border-t px-2.5 font-mono text-xs transition-all",
                      isActive
                        ? "border-x-border border-t-success bg-background text-foreground dark:border-x-border dark:bg-background dark:text-foreground z-1 border-t-2 font-medium shadow-2xs"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted/50 dark:hover:text-foreground border-t-2 border-transparent border-t-transparent bg-transparent",
                    )}
                    title={isEditing ? undefined : t("console.tab.rename")}
                  >
                    {isEditing ? (
                      <input
                        type="text"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        onBlur={handleSaveRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleSaveRename();
                          } else if (e.key === "Escape") {
                            handleCancelRename();
                          }
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="border-primary bg-muted text-foreground dark:bg-card dark:text-foreground h-4.5 w-24 rounded border px-1 py-0 font-mono text-xs outline-hidden"
                      />
                    ) : (
                      <span className="max-w-32 truncate select-none">
                        {tab.label}
                      </span>
                    )}

                    {/* Dot indicator if tab has returned rows */}
                    {tab.results &&
                      tab.results.rows &&
                      tab.results.rows.length > 0 && (
                        <span
                          className="bg-success h-1.5 w-1.5 shrink-0 rounded-full"
                          title={`${tab.results.rows.length} rows`}
                        />
                      )}

                    {/* Close Tab Button */}
                    <button
                      type="button"
                      onClick={(e) => handleRequestCloseTab(e, tab.id)}
                      className={cn(
                        "text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground ml-0.5 cursor-pointer rounded-sm p-0.5 transition-colors",
                        isActive
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                      title={t("console.tab.close")}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}

              {/* Add New Tab Button (+) */}
              {tabs.length < 8 && (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        onClick={handleNewTab}
                        className="text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground ml-0.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded transition-colors"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    }
                  />
                  <TooltipContent side="bottom">
                    <p className="text-xs">{t("console.tab.new")}</p>
                  </TooltipContent>
                </Tooltip>
              )}

              {/* MongoDB Pipeline Builder Tab */}
              {isMongo && (
                <div
                  onClick={() => setActiveMode("pipeline")}
                  className={cn(
                    "group relative ml-1.5 flex h-7 cursor-pointer items-center gap-1.5 rounded-t border-x border-t px-2.5 font-mono text-xs transition-all",
                    activeMode === "pipeline"
                      ? "border-x-border border-t-success bg-background text-success dark:border-x-border dark:bg-background dark:text-success z-1 border-t-2 font-semibold shadow-2xs"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted/50 dark:hover:text-foreground border-t-2 border-transparent border-t-transparent bg-transparent",
                  )}
                  title={t("pipeline.title")}
                >
                  <Layers className="text-success size-3.5" />
                  <span className="truncate select-none">
                    {t("pipeline.title")}
                  </span>
                </div>
              )}
            </div>

            {/* Tab Counter */}
            <div className="text-muted-foreground shrink-0 pr-1 font-mono text-[10px]">
              {tabs.length}/8
            </div>
          </div>
          {isMongo && activeMode === "pipeline" ? (
            <PipelineBuilder
              connection={connection}
              tables={tables}
              onOpenInConsole={(generatedQuery) => {
                handleQueryChange(generatedQuery);
                setActiveMode("console");
              }}
            />
          ) : (
            <>
              {/* Inline Ask AI Bar (Prompt 3.2.1) */}
              {isAiBarOpen && (
                <div className="border-primary/20 bg-primary/5 dark:border-primary/30 dark:bg-primary/20 shrink-0 border-b p-3">
                  <div className="flex items-center justify-between pb-2">
                    <div className="flex items-center gap-2">
                      <div className="bg-primary flex size-5 items-center justify-center rounded-md text-white shadow-2xs">
                        <Sparkles className="size-3" />
                      </div>
                      <span className="text-primary dark:text-primary text-xs font-semibold">
                        {t("ai.askAi")}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-primary/40 bg-primary/10 text-primary dark:text-primary h-4 px-1 font-mono text-[9px] font-semibold uppercase"
                      >
                        {connection.type}
                      </Badge>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => {
                        setIsAiBarOpen(false);
                        setAiErrorNotice(null);
                      }}
                      title={t("ai.closeAiBar")}
                      className="text-muted-foreground hover:text-foreground dark:hover:text-foreground size-5"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>

                  {/* AI Provider Error or Missing Notice */}
                  {aiErrorNotice && (
                    <Alert
                      variant="destructive"
                      className="border-destructive/30 bg-destructive/90 text-destructive dark:border-destructive/60 dark:bg-destructive/50 dark:text-destructive mb-2.5 py-1.5 text-xs"
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <AlertCircle className="text-destructive dark:text-destructive size-3.5 shrink-0" />
                          <AlertDescription className="text-xs break-all">
                            {aiErrorNotice}
                          </AlertDescription>
                        </div>
                        {onOpenAISettings && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={onOpenAISettings}
                            className="border-destructive/30 bg-background text-destructive hover:bg-destructive/10 dark:border-destructive dark:bg-card dark:text-destructive dark:hover:bg-muted h-6 shrink-0 gap-1 text-[11px] font-medium shadow-2xs"
                          >
                            <Sparkles className="size-3" />
                            <span>{t("ai.openAiSettings")}</span>
                          </Button>
                        )}
                      </div>
                    </Alert>
                  )}

                  {/* Natural Language Prompt Input Bar */}
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type="text"
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleGenerateQuery();
                          }
                        }}
                        placeholder={t("ai.askAiPlaceholder")}
                        disabled={isGeneratingAi}
                        className="border-primary/30 bg-background text-foreground placeholder:text-muted-foreground dark:border-primary/60 dark:bg-card/80 dark:text-foreground dark:placeholder:text-muted-foreground h-8 pr-8 text-xs shadow-2xs"
                      />
                      {aiPrompt && (
                        <button
                          type="button"
                          onClick={() => setAiPrompt("")}
                          className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer"
                        >
                          <X className="size-3" />
                        </button>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleGenerateQuery()}
                      disabled={isGeneratingAi || !aiPrompt.trim()}
                      className="bg-primary hover:bg-primary dark:bg-primary dark:hover:bg-primary h-8 gap-1.5 text-xs font-semibold text-white shadow-2xs disabled:opacity-50"
                    >
                      {isGeneratingAi ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>{t("ai.generating")}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-3.5" />
                          <span>{t("ai.generate")}</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Quick Suggestion Chips */}
                  <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-muted-foreground font-medium">
                      💡
                    </span>
                    {(isMongo
                      ? [
                          t("ai.chipMongoCount"),
                          t("ai.chipMongoLatest"),
                          t("ai.chipMongoAggregate"),
                        ]
                      : [
                          t("ai.chipRevenue"),
                          t("ai.chipTopUsers"),
                          t("ai.chipInactive"),
                        ]
                    ).map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => {
                          setAiPrompt(chip);
                          handleGenerateQuery(chip);
                        }}
                        className="border-primary/20 bg-background/70 text-primary hover:border-primary/40 hover:bg-primary/10 dark:border-primary/30 dark:bg-card/60 dark:text-primary dark:hover:bg-primary/20 cursor-pointer rounded-md border px-2 py-0.5 text-[11px] transition-colors"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>

                  {/* Generated Result Preview Card */}
                  {aiGeneratedResult && (
                    <div className="border-primary/30 bg-background dark:border-primary/30 dark:bg-card/90 mt-3 rounded-lg border p-3 shadow-xs">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-foreground dark:text-foreground text-[11px] font-semibold tracking-wider uppercase">
                          {t("ai.explanationTitle")}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              handleQueryChange(aiGeneratedResult.query);
                              showAiToast(t("ai.fixApplied"));
                            }}
                            className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 dark:text-primary h-6 gap-1 text-[11px] font-medium"
                          >
                            <Check className="size-3" />
                            <span>{t("ai.replace")}</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const newQ = query.trim()
                                ? `${query.trim()}\n\n${aiGeneratedResult.query}`
                                : aiGeneratedResult.query;
                              handleQueryChange(newQ);
                              showAiToast(t("ai.fixApplied"));
                            }}
                            className="border-border text-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted h-6 gap-1 text-[11px] font-medium"
                          >
                            <Plus className="size-3" />
                            <span>{t("ai.insert")}</span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            onClick={async () => {
                              handleQueryChange(aiGeneratedResult.query);
                              await executeQuery(aiGeneratedResult.query);
                            }}
                            className="bg-primary hover:bg-primary h-6 gap-1 text-[11px] font-medium text-white"
                          >
                            <Play className="size-2.5 fill-current" />
                            <span>{t("ai.run")}</span>
                          </Button>
                        </div>
                      </div>

                      {aiGeneratedResult.explanation && (
                        <p className="text-muted-foreground dark:text-foreground mb-2 text-xs">
                          {aiGeneratedResult.explanation}
                        </p>
                      )}

                      <div className="border-border/80 bg-card text-foreground dark:border-border dark:bg-background dark:text-foreground rounded-md border p-2 font-mono text-xs select-all">
                        <code>{aiGeneratedResult.query}</code>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div
                style={{
                  height: isResultsCollapsed ? "100%" : `${editorHeight}px`,
                }}
                className={cn(
                  "border-border bg-card/50 dark:border-border dark:bg-background/80 shrink-0 overflow-hidden border-b transition-all duration-75",
                  isResultsCollapsed && "flex-1 border-b-0",
                )}
              >
                <CodeMirror
                  value={query}
                  height="100%"
                  theme={isDark ? "dark" : "light"}
                  extensions={[...extensions, studioEditorTheme]}
                  onChange={(val) => handleQueryChange(val)}
                  onCreateEditor={(view) => {
                    editorViewRef.current = view;
                    setHasEditorSelection(!view.state.selection.main.empty);
                  }}
                  onUpdate={(viewUpdate) => {
                    if (viewUpdate.selectionSet) {
                      setHasEditorSelection(
                        !viewUpdate.state.selection.main.empty,
                      );
                    }
                  }}
                  placeholder={
                    isMongo
                      ? 'db.collection.find({ "status": "active" }).limit(50)'
                      : 'SELECT * FROM "users" WHERE id > 0 ORDER BY id DESC LIMIT 50;'
                  }
                  className="h-full border-0 font-mono text-xs focus:outline-hidden"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: false,
                    highlightActiveLineGutter: true,
                    highlightActiveLine: true,
                    autocompletion: true,
                  }}
                />
              </div>

              {/* Drag Resizer Handle Bar (Visible when not collapsed) */}
              {!isResultsCollapsed && (
                <div
                  onPointerDown={handlePointerDownResizer}
                  role="separator"
                  aria-label={t(
                    "console.resizePanels",
                    "Resize query editor and results",
                  )}
                  aria-orientation="horizontal"
                  aria-valuemin={QUERY_EDITOR_MIN_HEIGHT}
                  aria-valuemax={
                    typeof window === "undefined"
                      ? 700
                      : Math.max(160, window.innerHeight - 200)
                  }
                  aria-valuenow={editorHeight}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (
                      !["ArrowUp", "ArrowDown", "Home", "End"].includes(
                        event.key,
                      )
                    )
                      return;
                    event.preventDefault();
                    const maximum =
                      typeof window === "undefined"
                        ? 700
                        : Math.max(160, window.innerHeight - 200);
                    if (event.key === "Home")
                      setEditorHeight(QUERY_EDITOR_MIN_HEIGHT);
                    else if (event.key === "End") setEditorHeight(maximum);
                    else
                      setEditorHeight((height) =>
                        Math.min(
                          maximum,
                          Math.max(
                            QUERY_EDITOR_MIN_HEIGHT,
                            height + (event.key === "ArrowDown" ? 16 : -16),
                          ),
                        ),
                      );
                  }}
                  className={cn(
                    "group hover:bg-primary/40 dark:hover:bg-primary/50 bg-muted/80 dark:bg-muted/80 relative z-10 flex h-1 w-full shrink-0 cursor-row-resize items-center justify-center transition-colors select-none",
                    isDragging && "bg-primary/60",
                  )}
                  title="Drag up or down to resize editor and results panel"
                >
                  <div className="group-hover:bg-primary/90 bg-muted/80 dark:bg-muted/80 h-1 w-10 rounded-full transition-colors" />
                </div>
              )}

              {/* Execution Metrics & Results Status Bar */}
              <div className="border-border bg-muted/70 text-muted-foreground dark:border-border dark:bg-card/60 dark:text-muted-foreground flex h-8 shrink-0 items-center justify-between border-b px-3 font-mono text-xs select-none">
                <div className="flex items-center gap-3">
                  {/* Tab Selector: Results vs Execution Plan */}
                  <div className="bg-muted/70 dark:bg-muted/80 flex items-center gap-0.5 rounded-md p-0.5">
                    <button
                      type="button"
                      onClick={() => setActiveResultsTab("results")}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-0.5 font-sans text-[11px] font-medium transition-colors",
                        activeResultsTab === "results"
                          ? "bg-background text-foreground dark:bg-muted dark:text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
                      )}
                    >
                      <span>{t("console.explain.results_tab", "Results")}</span>
                      {result && (
                        <span className="py-0.2 bg-muted text-foreground dark:bg-muted/90 dark:text-foreground rounded px-1 font-mono text-[9px]">
                          {result.is_mutation
                            ? result.rows_affected
                            : result.rows.length}
                        </span>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveResultsTab("plan")}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-0.5 font-sans text-[11px] font-medium transition-colors",
                        activeResultsTab === "plan"
                          ? "bg-background text-foreground dark:bg-muted dark:text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
                      )}
                    >
                      <FileSearch className="text-warning dark:text-warning h-3 w-3" />
                      <span>{t("console.explain.plan", "Execution Plan")}</span>
                      {activeTab.explainResult && (
                        <span className="bg-warning h-1.5 w-1.5 rounded-full" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveResultsTab("output")}
                      className={cn(
                        "flex cursor-pointer items-center gap-1.5 rounded px-2.5 py-0.5 font-sans text-[11px] font-medium transition-colors",
                        activeResultsTab === "output"
                          ? "bg-background text-foreground dark:bg-muted dark:text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground",
                      )}
                    >
                      <span>Output / Log</span>
                      {activeTab.outputEntries?.some(
                        (entry) => entry.status === "error",
                      ) && <AlertCircle className="text-destructive h-3 w-3" />}
                    </button>
                  </div>

                  {activeTab.statementResults &&
                    activeTab.statementResults.length > 0 && (
                      <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
                        {activeTab.statementResults.map((statement, index) => (
                          <button
                            key={statement.id}
                            type="button"
                            onClick={() => {
                              setActiveStatementResultId(statement.id);
                              setActiveResultsTab("results");
                            }}
                            title={statement.statement}
                            className={cn(
                              "max-w-40 truncate rounded px-1.5 py-0.5 font-sans text-[10px]",
                              selectedStatementResult?.id === statement.id
                                ? "bg-background text-foreground dark:bg-muted"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                          >
                            {statement.error ? "!" : "#"}
                            {index + 1} {statement.statement.slice(0, 20)}
                          </button>
                        ))}
                      </div>
                    )}

                  {activeResultsTab === "results" ? (
                    <>
                      {result && (
                        <>
                          <div
                            className="text-success dark:text-success flex cursor-help items-center gap-1 font-semibold"
                            title={
                              result.round_trip_ms
                                ? `Database query: ${formatLatency(result.execution_time_ms)}ms | Network round-trip: ${formatLatency(result.round_trip_ms)}ms`
                                : `Database query: ${formatLatency(result.execution_time_ms)}ms`
                            }
                          >
                            <Zap className="fill-success/20 text-success dark:text-success h-3 w-3" />
                            <span>
                              {t("console.latency", {
                                ms: formatLatency(result.execution_time_ms),
                              })}
                            </span>
                          </div>

                          <span className="text-muted-foreground dark:text-foreground">
                            |
                          </span>

                          {result.is_mutation ? (
                            <span className="text-warning dark:text-warning font-medium">
                              {t("console.rowsAffected", {
                                count: result.rows_affected,
                              })}
                            </span>
                          ) : (
                            <span>
                              {t("console.rowsReturned", {
                                count: result.rows.length,
                              })}
                            </span>
                          )}

                          {result.columns && result.columns.length > 0 && (
                            <>
                              <span className="text-muted-foreground dark:text-foreground">
                                |
                              </span>
                              <span>{result.columns.length} columns</span>
                            </>
                          )}
                        </>
                      )}

                      {!result && !error && !isRunning && (
                        <span className="text-muted-foreground dark:text-muted-foreground text-[11px] italic">
                          {t("console.emptyPrompt")}
                        </span>
                      )}
                    </>
                  ) : activeResultsTab === "plan" ? (
                    /* Plan tab header metrics */
                    <>
                      {activeTab.explainResult && (
                        <>
                          <div className="text-foreground flex items-center gap-1.5">
                            <Clock className="text-warning dark:text-warning h-3 w-3" />
                            <span>
                              {activeTab.explainResult.execution_time_ms
                                ? `${formatLatency(activeTab.explainResult.execution_time_ms)} ms`
                                : "—"}
                            </span>
                          </div>
                          <span className="text-muted-foreground dark:text-foreground">
                            |
                          </span>
                          <span className="text-muted-foreground">
                            {activeTab.explainResult.format}
                          </span>
                        </>
                      )}
                    </>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {activeResultsTab === "results" &&
                    result &&
                    result.rows.length > 0 && (
                      <>
                        {/* Quick Filter across results */}
                        <div className="relative flex items-center">
                          <Search className="text-muted-foreground pointer-events-none absolute left-2 h-3 w-3" />
                          <Input
                            type="text"
                            value={resultFilter}
                            onChange={(e) => setResultFilter(e.target.value)}
                            placeholder={t("console.rowsFilter")}
                            className="border-border bg-background dark:border-border dark:bg-background h-6 w-40 pr-2 pl-6 font-mono text-[11px]"
                          />
                        </div>

                        {/* Export CSV */}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleCopyResults}
                          className="border-border text-muted-foreground dark:border-border dark:text-foreground h-6 gap-1 px-2 font-mono text-[11px]"
                        >
                          <Copy className="h-3 w-3" />
                          <span>Copy results</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleExportCSV}
                          className="border-border text-muted-foreground dark:border-border dark:text-foreground h-6 gap-1 px-2 font-mono text-[11px]"
                        >
                          <FileSpreadsheet className="text-success dark:text-success h-3 w-3" />
                          <span>{t("console.exportResults")}</span>
                        </Button>
                      </>
                    )}

                  {/* Collapse / Expand Toggle Button */}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() =>
                            setIsResultsCollapsed(!isResultsCollapsed)
                          }
                          className="text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground h-6 w-6 cursor-pointer"
                        >
                          {isResultsCollapsed ? (
                            <ChevronUp className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      }
                    />
                    <TooltipContent side="top">
                      {isResultsCollapsed
                        ? t("console.expandResults", "Expand Results")
                        : t("console.collapseResults", "Collapse Results")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Results Content Area (Hidden when collapsed) */}
              {!isResultsCollapsed && (
                <div className="custom-scrollbar min-h-0 flex-1 overflow-auto">
                  {activeResultsTab === "results" ? (
                    <>
                      {/* Error Alert with 1-Click Fix with AI */}
                      {error && (
                        <Alert
                          variant="destructive"
                          className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/40 dark:text-destructive"
                        >
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <div className="flex-1 space-y-2">
                            {selectedStatementResult?.error && (
                              <pre className="border-destructive/20 bg-background/50 max-h-32 overflow-auto rounded border p-2 font-mono text-[11px] whitespace-pre-wrap">
                                {selectedStatementResult.statement}
                              </pre>
                            )}
                            <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
                              {error}
                            </AlertDescription>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={handleFixWithAi}
                                disabled={isFixingWithAi}
                                className="border-destructive/30 bg-destructive/70 text-destructive hover:bg-destructive/10 dark:border-destructive dark:bg-destructive/40 dark:text-destructive dark:hover:bg-destructive/70 h-6.5 gap-1.5 text-[11px] font-semibold shadow-2xs"
                              >
                                {isFixingWithAi ? (
                                  <>
                                    <Loader2 className="size-3 animate-spin" />
                                    <span>{t("ai.fixing")}</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="text-primary dark:text-primary size-3" />
                                    <span>{t("ai.fixWithAi")}</span>
                                  </>
                                )}
                              </Button>
                            </div>

                            {/* Render AI Fix Result */}
                            {aiFixedResult && (
                              <div className="border-primary/30 bg-background text-foreground dark:border-primary/30 dark:bg-card dark:text-foreground mt-2 rounded-lg border p-3 shadow-xs">
                                <div className="mb-1.5 flex items-center justify-between">
                                  <div className="flex items-center gap-1.5">
                                    <Sparkles className="text-primary dark:text-primary size-3.5" />
                                    <span className="text-primary dark:text-primary text-xs font-semibold">
                                      {t("ai.fixWithAi")}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => {
                                        handleQueryChange(aiFixedResult.query);
                                        showAiToast(t("ai.fixApplied"));
                                      }}
                                      className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 dark:text-primary h-6 gap-1 text-[11px] font-medium"
                                    >
                                      <Check className="size-3" />
                                      <span>{t("ai.applyFix")}</span>
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={async () => {
                                        handleQueryChange(aiFixedResult.query);
                                        await executeQuery(aiFixedResult.query);
                                      }}
                                      className="bg-primary hover:bg-primary h-6 gap-1 text-[11px] font-medium text-white"
                                    >
                                      <Play className="size-2.5 fill-current" />
                                      <span>{t("ai.run")}</span>
                                    </Button>
                                  </div>
                                </div>
                                {aiFixedResult.explanation && (
                                  <p className="text-muted-foreground dark:text-foreground mb-2 text-xs">
                                    {aiFixedResult.explanation}
                                  </p>
                                )}
                                <div className="border-border bg-card dark:border-border dark:bg-background rounded-md border p-2 font-mono text-xs select-all">
                                  <code>{aiFixedResult.query}</code>
                                </div>
                              </div>
                            )}
                          </div>
                        </Alert>
                      )}

                      {/* Mutation Success Notice */}
                      {result?.is_mutation && !error && (
                        <Alert className="border-success/30 bg-success/10 text-success dark:border-success dark:bg-success/40 dark:text-success">
                          <CheckCircle2 className="text-success dark:text-success h-4 w-4" />
                          <AlertDescription className="font-mono text-xs">
                            {t("console.mutationSuccess")} (
                            {t("console.rowsAffected", {
                              count: result.rows_affected,
                            })}
                            )
                          </AlertDescription>
                        </Alert>
                      )}

                      {/* Data Table View */}
                      {result &&
                        !result.is_mutation &&
                        displayedRows.length > 0 && (
                          <div
                            ref={resultsContainerRef}
                            className="border-border bg-background dark:border-border dark:bg-card/40 max-h-[calc(100vh-380px)] min-h-40 overflow-auto rounded-lg border"
                          >
                            <Table className="studio-data-table w-full border-collapse text-left">
                              <TableHeader className="border-border bg-card dark:border-border dark:bg-card sticky top-0 z-10 border-b">
                                <TableRow>
                                  <TableHead className="text-muted-foreground h-7 w-12 text-center font-mono text-xs">
                                    #
                                  </TableHead>
                                  {result.columns.map((col) => (
                                    <TableHead
                                      key={col}
                                      onClick={() =>
                                        setSortState((current) =>
                                          current?.column === col
                                            ? {
                                                column: col,
                                                descending: !current.descending,
                                              }
                                            : {
                                                column: col,
                                                descending: false,
                                              },
                                        )
                                      }
                                      className="border-border/50 text-foreground dark:border-border/50 dark:text-foreground cursor-pointer border-r px-2.5 py-1 font-mono text-xs font-semibold last:border-r-0"
                                    >
                                      {col}
                                      {sortState?.column === col
                                        ? sortState.descending
                                          ? " ↓"
                                          : " ↑"
                                        : ""}
                                    </TableHead>
                                  ))}
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {rowVirtualizer.getVirtualItems().length >
                                  0 && (
                                  <>
                                    {rowVirtualizer.getVirtualItems()[0].start >
                                      0 && (
                                      <tr>
                                        <td
                                          colSpan={result.columns.length + 1}
                                          style={{
                                            height: `${rowVirtualizer.getVirtualItems()[0].start}px`,
                                            padding: 0,
                                            border: 0,
                                          }}
                                        />
                                      </tr>
                                    )}
                                    {rowVirtualizer
                                      .getVirtualItems()
                                      .map((virtualRow) => {
                                        const row =
                                          displayedRows[virtualRow.index];
                                        const idx = virtualRow.index;
                                        if (!row) return null;
                                        return (
                                          <TableRow
                                            key={idx}
                                            data-index={virtualRow.index}
                                            ref={rowVirtualizer.measureElement}
                                            className="border-border hover:bg-card/80 dark:border-border/60 dark:hover:bg-muted/40 border-b transition-colors"
                                          >
                                            <TableCell className="bg-card/30 text-muted-foreground dark:bg-card/30 text-center font-mono text-xs select-none">
                                              {idx + 1}
                                            </TableCell>
                                            {result.columns.map((col) => {
                                              const val = row[col];
                                              const cellKey = `${idx}-${col}`;
                                              const isCopied =
                                                copiedCell === cellKey;
                                              return (
                                                <TableCell
                                                  key={col}
                                                  onClick={() =>
                                                    copyToClipboard(
                                                      typeof val === "object"
                                                        ? JSON.stringify(val)
                                                        : String(val ?? ""),
                                                      cellKey,
                                                    )
                                                  }
                                                  title="Click to copy value"
                                                  className="group border-border dark:border-border/60 relative max-w-xs cursor-pointer truncate border-r px-2.5 py-1 font-mono text-xs last:border-r-0"
                                                >
                                                  {val === null ||
                                                  val === undefined ? (
                                                    <span className="text-muted-foreground dark:text-muted-foreground italic">
                                                      NULL
                                                    </span>
                                                  ) : typeof val ===
                                                    "boolean" ? (
                                                    <Badge
                                                      variant="outline"
                                                      className={cn(
                                                        "px-1 py-0 font-mono text-[10px] font-medium",
                                                        val
                                                          ? "border-primary/30 bg-success/10 text-success"
                                                          : "bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground",
                                                      )}
                                                    >
                                                      {String(val)}
                                                    </Badge>
                                                  ) : typeof val ===
                                                    "object" ? (
                                                    <span className="text-warning dark:text-warning">
                                                      {JSON.stringify(val)}
                                                    </span>
                                                  ) : (
                                                    <span className="text-foreground">
                                                      {String(val)}
                                                    </span>
                                                  )}

                                                  {isCopied && (
                                                    <span className="py-0.2 bg-primary absolute top-1 right-1 flex items-center gap-0.5 rounded px-1 font-sans text-[9px] text-white">
                                                      <Check className="h-2.5 w-2.5" />{" "}
                                                      copied
                                                    </span>
                                                  )}
                                                </TableCell>
                                              );
                                            })}
                                          </TableRow>
                                        );
                                      })}
                                    {rowVirtualizer.getTotalSize() -
                                      (rowVirtualizer.getVirtualItems()[
                                        rowVirtualizer.getVirtualItems()
                                          .length - 1
                                      ]?.end ?? 0) >
                                      0 && (
                                      <tr>
                                        <td
                                          colSpan={result.columns.length + 1}
                                          style={{
                                            height: `${
                                              rowVirtualizer.getTotalSize() -
                                              (rowVirtualizer.getVirtualItems()[
                                                rowVirtualizer.getVirtualItems()
                                                  .length - 1
                                              ]?.end ?? 0)
                                            }px`,
                                            padding: 0,
                                            border: 0,
                                          }}
                                        />
                                      </tr>
                                    )}
                                  </>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        )}

                      {result &&
                        result.rows.length === 0 &&
                        !result.is_mutation &&
                        !error && (
                          <div className="flex h-48 flex-col items-center justify-center p-6 text-center">
                            <CheckCircle2 className="text-muted-foreground mb-2 h-8 w-8 opacity-50" />
                            <h3 className="text-foreground text-sm font-semibold">
                              {t("console.noResults")}
                            </h3>
                            <p className="text-muted-foreground mt-1 text-xs">
                              Query returned 0 rows in{" "}
                              {formatLatency(result.execution_time_ms)}ms.
                            </p>
                          </div>
                        )}
                    </>
                  ) : activeResultsTab === "plan" ? (
                    /* Execution Plan Tab */
                    <div className="space-y-3">
                      {/* Plan Error Alert */}
                      {error && (
                        <Alert
                          variant="destructive"
                          className="border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive dark:bg-destructive/40 dark:text-destructive"
                        >
                          <AlertCircle className="h-4 w-4" />
                          <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
                            {error}
                          </AlertDescription>
                        </Alert>
                      )}

                      {activeTab.explainResult ? (
                        <div className="space-y-3">
                          {/* Metric Summary Cards */}
                          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                            {/* Estimated Rows */}
                            <div className="border-border bg-background/70 dark:border-border dark:bg-card/60 rounded-lg border p-2.5 shadow-xs">
                              <div className="text-muted-foreground dark:text-muted-foreground font-mono text-[10px] font-semibold tracking-wider uppercase">
                                {t("console.explain.estimated_rows")}
                              </div>
                              <div className="text-foreground mt-1 font-mono text-base font-bold">
                                {activeTab.explainResult.estimated_rows !==
                                undefined
                                  ? activeTab.explainResult.estimated_rows.toLocaleString()
                                  : "—"}
                              </div>
                            </div>

                            {/* Actual Rows */}
                            <div className="border-border bg-background/70 dark:border-border dark:bg-card/60 rounded-lg border p-2.5 shadow-xs">
                              <div className="text-muted-foreground dark:text-muted-foreground font-mono text-[10px] font-semibold tracking-wider uppercase">
                                {t("console.explain.actual_rows")}
                              </div>
                              <div className="text-foreground mt-1 font-mono text-base font-bold">
                                {activeTab.explainResult.actual_rows !==
                                undefined
                                  ? activeTab.explainResult.actual_rows.toLocaleString()
                                  : "—"}
                              </div>
                            </div>

                            {/* Execution Time */}
                            <div className="border-border bg-background/70 dark:border-border dark:bg-card/60 rounded-lg border p-2.5 shadow-xs">
                              <div className="text-muted-foreground dark:text-muted-foreground font-mono text-[10px] font-semibold tracking-wider uppercase">
                                {t("console.explain.execution_time")}
                              </div>
                              <div className="text-success dark:text-success mt-1 font-mono text-base font-bold">
                                {activeTab.explainResult.execution_time_ms
                                  ? `${formatLatency(activeTab.explainResult.execution_time_ms)} ms`
                                  : "—"}
                              </div>
                            </div>

                            {/* Index Used */}
                            <div className="border-border bg-background/70 dark:border-border dark:bg-card/60 rounded-lg border p-2.5 shadow-xs">
                              <div className="text-muted-foreground dark:text-muted-foreground font-mono text-[10px] font-semibold tracking-wider uppercase">
                                {t("console.explain.index_used")}
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 truncate">
                                {activeTab.explainResult.index_used ? (
                                  <Badge
                                    variant="outline"
                                    className="border-primary/30 bg-success/10 text-success dark:text-success max-w-full truncate font-mono text-[11px] font-semibold"
                                    title={activeTab.explainResult.index_used}
                                  >
                                    {activeTab.explainResult.index_used}
                                  </Badge>
                                ) : (
                                  <Badge
                                    variant="outline"
                                    className="border-warning/30 bg-warning/10 text-warning dark:text-warning truncate font-mono text-[11px] font-medium"
                                  >
                                    {t("console.explain.no_index")}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Execution Plan Tree Container */}
                          <div className="border-border bg-background dark:border-border dark:bg-background/60 overflow-hidden rounded-lg border shadow-xs">
                            <div className="border-border bg-card dark:border-border dark:bg-card flex items-center justify-between border-b px-3 py-2">
                              <div className="flex items-center gap-2">
                                <FileSearch className="text-warning dark:text-warning h-3.5 w-3.5" />
                                <span className="text-foreground font-mono text-xs font-semibold">
                                  {t("console.explain.plan")}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className="bg-muted text-muted-foreground dark:bg-muted dark:text-foreground px-1.5 py-0 font-mono text-[10px] uppercase"
                                >
                                  {activeTab.explainResult.format}
                                </Badge>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPlanExpandAll(true)}
                                  className="border-border text-muted-foreground dark:border-border dark:text-muted-foreground h-6 px-2 font-mono text-[11px]"
                                >
                                  {t("console.explain.expand_all")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPlanExpandAll(false)}
                                  className="border-border text-muted-foreground dark:border-border dark:text-muted-foreground h-6 px-2 font-mono text-[11px]"
                                >
                                  {t("console.explain.collapse_all")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleOptimizeWithAi}
                                  disabled={isOptimizingWithAi}
                                  className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 dark:text-primary h-6 gap-1 px-2 font-mono text-[11px]"
                                >
                                  {isOptimizingWithAi ? (
                                    <>
                                      <Loader2 className="size-3 animate-spin" />
                                      <span>{t("ai.optimizing")}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Sparkles className="text-primary dark:text-primary size-3" />
                                      <span>{t("ai.optimizeWithAi")}</span>
                                    </>
                                  )}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={handleCopyPlan}
                                  className="border-border text-muted-foreground dark:border-border dark:text-foreground h-6 gap-1 px-2 font-mono text-[11px]"
                                >
                                  {copiedPlan ? (
                                    <>
                                      <Check className="text-success h-3 w-3" />
                                      <span>{t("console.explain.copied")}</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      <span>
                                        {t("console.explain.copy_json")}
                                      </span>
                                    </>
                                  )}
                                </Button>
                              </div>
                            </div>

                            {/* AI Plan Optimization & Index Recommendations (Prompt 3.2.3) */}
                            {aiOptimizationResult && (
                              <div className="border-primary/20 bg-primary/5 dark:border-primary/30 dark:bg-primary/20 border-b p-3">
                                <div className="mb-1 flex items-center gap-1.5">
                                  <Sparkles className="text-primary dark:text-primary size-3.5" />
                                  <span className="text-primary dark:text-primary text-xs font-semibold">
                                    {t("ai.optimizeWithAi")}
                                  </span>
                                </div>
                                {aiOptimizationResult.explanation && (
                                  <p className="text-foreground text-xs">
                                    {aiOptimizationResult.explanation}
                                  </p>
                                )}

                                {aiOptimizationResult.indexes &&
                                  aiOptimizationResult.indexes.length > 0 && (
                                    <div className="mt-2.5 space-y-1.5">
                                      <span className="text-muted-foreground dark:text-muted-foreground text-[11px] font-semibold uppercase">
                                        {t("ai.suggestedIndexes")}
                                      </span>
                                      {aiOptimizationResult.indexes.map(
                                        (idx, i) => (
                                          <div
                                            key={i}
                                            className="border-primary/20 bg-background dark:border-primary/30 dark:bg-card flex items-center justify-between gap-2 rounded-md border p-2 font-mono text-xs"
                                          >
                                            <code className="text-primary dark:text-primary">
                                              {idx}
                                            </code>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() =>
                                                handleCopyIndex(idx)
                                              }
                                              className="h-5 gap-1 px-1.5 text-[10px]"
                                            >
                                              {copiedIndexDdl === idx ? (
                                                <>
                                                  <Check className="text-success size-3" />
                                                  <span>
                                                    {t("ai.indexCopied")}
                                                  </span>
                                                </>
                                              ) : (
                                                <>
                                                  <Copy className="size-3" />
                                                  <span>
                                                    {t("ai.copyIndex")}
                                                  </span>
                                                </>
                                              )}
                                            </Button>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                              </div>
                            )}

                            <div className="max-h-[calc(100vh-380px)] min-h-40 overflow-auto p-3 font-mono text-xs">
                              <PlanTreeNode
                                value={activeTab.explainResult.plan}
                                expandAll={planExpandAll}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* Empty State: No Execution Plan Yet */
                        <div className="border-border dark:border-border flex h-56 flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
                          <FileSearch className="text-muted-foreground mb-2.5 h-9 w-9 opacity-60" />
                          <h3 className="text-foreground text-sm font-semibold">
                            {t(
                              "console.explain.no_plan_title",
                              "No Execution Plan Yet",
                            )}
                          </h3>
                          <p className="text-muted-foreground mt-1 max-w-sm text-xs">
                            {t(
                              "console.explain.no_plan_desc",
                              "Click the Explain button to analyze and visualize the query execution plan.",
                            )}
                          </p>
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleExplain}
                            disabled={
                              connection.type !== "postgres" ||
                              isExplaining ||
                              isRunning ||
                              !query.trim()
                            }
                            title={
                              connection.type !== "postgres"
                                ? "Explain is available for PostgreSQL connections only."
                                : t("console.explain.tooltip")
                            }
                            className="bg-warning hover:bg-warning mt-3.5 h-7 cursor-pointer gap-1.5 text-xs font-semibold text-white"
                          >
                            {isExplaining ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>{t("console.explain.explaining")}</span>
                              </>
                            ) : (
                              <>
                                <FileSearch className="h-3.5 w-3.5" />
                                <span>{t("console.explain.button")}</span>
                              </>
                            )}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2 p-3">
                      <h3 className="text-foreground text-xs font-semibold">
                        Execution output
                      </h3>
                      {activeTab.outputEntries?.length ? (
                        activeTab.outputEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="border-border rounded border p-2 font-mono text-xs"
                          >
                            <div
                              className={
                                entry.status === "error"
                                  ? "text-destructive"
                                  : entry.status === "success"
                                    ? "text-success"
                                    : "text-muted-foreground"
                              }
                            >
                              {entry.message}
                            </div>
                            {entry.statement && (
                              <pre className="text-muted-foreground mt-1 overflow-x-auto whitespace-pre-wrap">
                                {entry.statement}
                              </pre>
                            )}
                          </div>
                        ))
                      ) : (
                        <p className="text-muted-foreground text-xs">
                          No query output yet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* End: Editor + Results column + Library flex wrapper */}

      <Dialog open={switchToAutoOpen} onOpenChange={setSwitchToAutoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("console.transaction.switchTitle")}</DialogTitle>
            <DialogDescription>
              {t("console.transaction.switchDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={isFinishingTransaction}
              onClick={() => setSwitchToAutoOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isFinishingTransaction}
              onClick={() => void finishActiveTransaction("rollback", true)}
            >
              {t("console.transaction.switchAction")}
            </Button>
            <Button
              disabled={isFinishingTransaction || transaction.aborted}
              onClick={() => void finishActiveTransaction("commit", true)}
            >
              {t("console.transaction.commitSwitch")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Tab Close Confirmation Dialog */}
      <Dialog
        open={Boolean(closingTabId)}
        onOpenChange={(open) => !open && setClosingTabId(null)}
      >
        <DialogContent className="border-border bg-background dark:border-border dark:bg-background rounded-xl border shadow-xl sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-warning h-4 w-4 shrink-0" />
              <DialogTitle className="text-foreground text-sm font-semibold">
                {t("console.tab.close")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-muted-foreground dark:text-muted-foreground pt-2 text-xs">
              {transactionStates[closingTabId ?? ""]?.sessionId
                ? t("console.transaction.closeWarning")
                : t("console.tab.unsaved_warning")}
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setClosingTabId(null)}
              className="h-7 text-xs font-medium"
            >
              {t("console.tab.cancel", "Cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                if (closingTabId) {
                  handleConfirmCloseTab(closingTabId);
                }
              }}
              className="h-7 text-xs font-semibold"
            >
              {t("console.tab.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Query Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="border-border bg-background text-foreground dark:border-border dark:bg-background dark:text-foreground max-w-sm overflow-hidden rounded-xl border p-0 shadow-2xl">
          {/* Dialog header with gradient */}
          <div className="border-border bg-card/75 dark:border-border dark:bg-card/50 border-b px-5 pt-5 pb-4">
            <div className="mb-1 flex items-center gap-3">
              <div className="border-primary/30 bg-success/15 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
                <Save className="text-success dark:text-success h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-foreground text-sm leading-tight font-semibold">
                  {t("savedQuery.saveQuery")}
                </DialogTitle>
                <DialogDescription className="text-muted-foreground mt-0.5 text-[10px]">
                  Save to your personal query library
                </DialogDescription>
              </div>
            </div>

            {/* SQL snippet preview */}
            <div className="border-border bg-muted/80 text-muted-foreground dark:border-border dark:bg-card dark:text-muted-foreground mt-3 truncate rounded-md border px-2.5 py-2 font-mono text-[10px]">
              {query.trim().split("\n")[0]?.slice(0, 60) ?? ""}
              {(query.trim().split("\n")[0]?.length ?? 0) > 60 ? "…" : ""}
            </div>
          </div>

          <div className="space-y-4 px-5 py-4">
            {/* Title field */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground dark:text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t("savedQuery.title")} <span className="text-red-500">*</span>
              </label>
              <Input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder={t("savedQuery.titlePlaceholder")}
                className="focus-visible:border-primary focus-visible:ring-primary/40 border-border bg-background text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground text-sm focus-visible:ring-1"
                onKeyDown={(e) => e.key === "Enter" && handleSaveQuery()}
                autoFocus
              />
            </div>

            {/* Folder field */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground dark:text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t("savedQuery.folder")}
              </label>
              <Input
                value={saveFolder}
                onChange={(e) => setSaveFolder(e.target.value)}
                placeholder={t("savedQuery.folderPlaceholder")}
                className="focus-visible:border-primary focus-visible:ring-primary/40 border-border bg-background text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground text-sm focus-visible:ring-1"
              />
            </div>

            {/* Tags field */}
            <div className="space-y-1.5">
              <label className="text-muted-foreground dark:text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t("savedQuery.tags")}
              </label>
              <Input
                value={saveTags}
                onChange={(e) => setSaveTags(e.target.value)}
                placeholder={t("savedQuery.tagsPlaceholder")}
                className="focus-visible:border-primary focus-visible:ring-primary/40 border-border bg-background text-foreground placeholder:text-muted-foreground dark:border-border dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground text-sm focus-visible:ring-1"
              />
              <p className="text-muted-foreground text-[9px]">
                Separate multiple tags with commas
              </p>
            </div>

            {/* Favorite toggle */}
            <button
              type="button"
              onClick={() => setSaveIsFavorite((v) => !v)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-all",
                saveIsFavorite
                  ? "border-warning/30 bg-warning/10 text-warning dark:text-warning"
                  : "border-border bg-card/50 text-muted-foreground hover:bg-muted hover:text-foreground dark:border-border dark:bg-card/50 dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground",
              )}
            >
              <Star
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  saveIsFavorite ? "fill-warning text-warning" : "",
                )}
              />
              <span className="text-xs font-medium">
                {t("savedQuery.favorite")}
              </span>
              <span className="ml-auto text-[10px] opacity-70">
                {saveIsFavorite ? "Starred" : "Click to star"}
              </span>
            </button>
          </div>

          {/* Footer */}
          <div className="border-border bg-card/50 dark:border-border dark:bg-card/50 flex justify-end gap-2 border-t px-5 py-3.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSaveDialogOpen(false)}
              className="border-border text-foreground hover:bg-muted dark:border-border dark:text-foreground dark:hover:bg-muted text-xs"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveQuery}
              disabled={!saveTitle.trim()}
              className="bg-primary hover:bg-primary/90 gap-1.5 text-xs text-white shadow-xs disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" />
              {t("savedQuery.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="border-border bg-background dark:border-border dark:bg-background flex max-h-[85vh] flex-col overflow-hidden rounded-xl border p-0 shadow-2xl sm:max-w-xl">
          <DialogHeader className="border-border bg-card dark:border-border dark:bg-card/50 flex flex-row items-center justify-between space-y-0 border-b py-3 pr-12 pl-5">
            <div className="flex items-center gap-2">
              <Clock className="text-success dark:text-success h-4 w-4" />
              <DialogTitle className="text-foreground text-sm font-semibold">
                {t("console.historyTitle")}
              </DialogTitle>
              <Badge
                variant="outline"
                className="h-4 px-1.5 py-0 font-mono text-[10px]"
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
                className="text-destructive hover:bg-destructive/10 hover:text-destructive dark:hover:bg-destructive/40 h-7 px-2 text-xs"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {t("console.clearHistory")}
              </Button>
            )}
          </DialogHeader>

          <div className="border-border bg-card/50 dark:border-border dark:bg-card/30 border-b p-3">
            <div className="relative flex items-center">
              <Search className="text-muted-foreground pointer-events-none absolute left-2.5 h-3.5 w-3.5" />
              <Input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder={t("console.searchHistory")}
                className="h-8 pr-8 pl-8 font-mono text-xs"
              />
              {historySearch && (
                <button
                  type="button"
                  onClick={() => setHistorySearch("")}
                  className="text-muted-foreground hover:text-muted-foreground dark:hover:text-foreground absolute right-2 rounded p-1"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          <div className="custom-scrollbar max-h-96 flex-1 space-y-2.5 overflow-y-auto p-3">
            {filteredHistory.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center font-mono text-xs">
                {historySearch
                  ? t("console.noHistoryMatch", { term: historySearch })
                  : t("console.noHistory")}
              </div>
            ) : (
              filteredHistory.map((item) => (
                <div
                  key={item.id}
                  className="group hover:border-primary/40 border-border bg-card/60 dark:border-border dark:bg-card/40 flex items-start justify-between gap-3 rounded-lg border p-3 shadow-xs transition-all"
                >
                  <div className="min-w-0 flex-1">
                    <pre
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        handleQueryChange(item.query);
                        setIsHistoryOpen(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleQueryChange(item.query);
                          setIsHistoryOpen(false);
                        }
                      }}
                      className="border-border/60 bg-muted/70 text-foreground dark:border-border/60 dark:bg-background/60 dark:text-foreground line-clamp-3 cursor-pointer rounded border p-2 font-mono text-xs break-all whitespace-pre-wrap"
                    >
                      {item.query}
                    </pre>
                    <div className="text-muted-foreground mt-2 flex items-center gap-2 font-mono text-[10px]">
                      <span>{connection.name}</span>
                      <span>{new Date(item.timestamp).toLocaleString()}</span>
                      {item.execution_time_ms !== undefined && (
                        <Badge
                          variant="outline"
                          title={
                            item.round_trip_ms
                              ? `Query: ${formatLatency(item.execution_time_ms)}ms | Total: ${formatLatency(item.round_trip_ms)}ms`
                              : `Query execution: ${formatLatency(item.execution_time_ms)}ms`
                          }
                          className="border-primary/30 bg-success/10 text-success dark:text-success h-4 cursor-help gap-0.5 px-1.5 py-0 font-mono text-[10px]"
                        >
                          <Zap className="h-2.5 w-2.5 fill-current" />
                          <span>{formatLatency(item.execution_time_ms)}ms</span>
                        </Badge>
                      )}
                      {item.row_count !== undefined && !item.error && (
                        <Badge
                          variant="outline"
                          className="border-border text-muted-foreground dark:border-border dark:text-muted-foreground h-4 px-1.5 py-0 font-mono text-[10px]"
                        >
                          {item.row_count} rows
                        </Badge>
                      )}
                      {!item.error && (
                        <Badge variant="outline">
                          {t("console.historySuccess")}
                        </Badge>
                      )}
                      {item.error && (
                        <Badge
                          variant="outline"
                          className="border-destructive/30 bg-destructive/10 text-destructive dark:text-destructive h-4 gap-0.5 px-1.5 py-0 font-mono text-[10px]"
                        >
                          <AlertCircle className="h-2.5 w-2.5" />
                          <span>{item.error}</span>
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleCopyHistory(item.id, item.query)}
                      title={t("console.copyQuery")}
                      className="text-muted-foreground hover:text-foreground dark:hover:text-foreground h-7 w-7"
                    >
                      {copiedHistoryId === item.id ? (
                        <Check className="text-success h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleQueryChange(item.query);
                        setIsHistoryOpen(false);
                      }}
                      className="hover:bg-primary/20 border-border bg-success/10 text-success dark:border-border dark:text-success h-7 gap-1 px-2.5 font-mono text-xs"
                    >
                      <Terminal className="h-3 w-3" />
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
