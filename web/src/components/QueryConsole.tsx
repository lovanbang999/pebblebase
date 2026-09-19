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
import { keymap } from "@codemirror/view";
import { sql, PostgreSQL, MySQL, SQLite } from "@codemirror/lang-sql";
import { json, jsonLanguage } from "@codemirror/lang-json";
import { useVirtualizer } from "@tanstack/react-virtual";
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
} from "../lib/types";
import { executeRawQuery, createSavedQuery, explainQuery } from "../lib/api";
import { PipelineBuilder } from "./PipelineBuilder";

export interface ConsoleTab {
  id: string;
  label: string;
  query: string;
  results: RawQueryResult | null;
  executionTime?: number;
  error?: string | null;
  explainResult?: ExplainResult | null;
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
    let valueColor = "text-emerald-600 dark:text-emerald-400";
    if (typeof value === "number") {
      valueColor = "text-amber-600 dark:text-amber-400 font-semibold";
    } else if (typeof value === "boolean") {
      valueColor = "text-sky-600 dark:text-sky-400 font-semibold";
    } else if (value === null) {
      valueColor = "text-zinc-400 dark:text-zinc-500 italic";
    }

    return (
      <div
        className="flex items-baseline gap-2 py-0.5 font-mono text-xs hover:bg-zinc-100/50 dark:hover:bg-zinc-800/30 rounded px-1"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {keyName && (
          <span className="text-zinc-600 dark:text-zinc-400 shrink-0 font-medium">
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
        className="flex items-center gap-1.5 py-0.5 hover:bg-zinc-100/70 dark:hover:bg-zinc-800/40 rounded px-1 cursor-pointer select-none group"
        style={{ paddingLeft: `${depth * 16}px` }}
      >
        {isOpen ? (
          <ChevronDown className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 shrink-0" />
        )}

        {keyName && (
          <span className="text-indigo-600 dark:text-indigo-400 font-medium shrink-0">
            {keyName}:
          </span>
        )}

        <span className="text-zinc-400 dark:text-zinc-500 text-[11px]">
          {isArray ? `Array(${count})` : `{${count} fields}`}
        </span>

        {!isOpen && !isArray && value && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate ml-1 font-sans">
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
        <div className="border-l border-zinc-200/60 dark:border-zinc-800/60 ml-2">
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
  tables: TableSchema[];
  initialQuery?: string;
  onNavigateToTable?: (tableName: string) => void;
  onQueryChange?: (query: string) => void;
}

export const QueryConsole: FC<QueryConsoleProps> = ({
  connection,
  tables,
  initialQuery,
  onNavigateToTable,
  onQueryChange,
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

  // Validate if initialQuery matches current dialect
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

  const tabsStorageKey = `pebblebase_query_tabs_${connection.id}`;

  const [activeMode, setActiveMode] = useState<"console" | "pipeline">("console");

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
        JSON.stringify({ tabs, activeTabId }),
      );
    } catch {
      // Handle quota exceeded (e.g., large query results)
      try {
        const lightweightTabs = tabs.map((t) => ({
          ...t,
          results: null,
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
  const result = activeTab.results;
  const error = activeTab.error ?? null;
  const [showLimitWarning, setShowLimitWarning] = useState(false);

  // Execution Plan states
  const [isExplaining, setIsExplaining] = useState(false);
  const [activeResultsTab, setActiveResultsTab] = useState<"results" | "plan">("results");
  const [planExpandAll, setPlanExpandAll] = useState<boolean | null>(null);
  const [copiedPlan, setCopiedPlan] = useState(false);

  // Tab management & close warning states
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const checkMissingLimit = useCallback((q: string): boolean => {
    const trimmed = q.trim();
    const isSelect = /^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/|\s)*SELECT\b/i.test(trimmed);
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
    (tabId: string) => {
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
      setClosingTabId(null);
      setResultFilter("");
      setShowLimitWarning(false);
    },
    [activeTabId],
  );

  const handleRequestCloseTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      const tabToClose = tabs.find((t) => t.id === tabId);
      if (!tabToClose) return;

      if (tabToClose.query.trim().length > 0) {
        setClosingTabId(tabId);
      } else {
        handleConfirmCloseTab(tabId);
      }
    },
    [tabs, handleConfirmCloseTab],
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

  const [isRunning, setIsRunning] = useState(false);
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
  const [editorHeight, setEditorHeight] = useState(450);
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDownResizer = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      const startY = e.clientY;
      const startHeight = editorHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = moveEvent.clientY - startY;
        const newHeight = Math.min(Math.max(80, startHeight + deltaY), 750);
        setEditorHeight(newHeight);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [editorHeight],
  );

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

  // Save Query handler
  const handleSaveQuery = async () => {
    const trimmed = query.trim();
    if (!trimmed || !saveTitle.trim()) return;
    const tags = saveTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
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
      // Show a brief toast
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch {
      /* ignore */
    }
  };

  // Core execute query logic
  const executeQuery = useCallback(
    async (queryToRun: string) => {
      const trimmed = queryToRun.trim();
      if (!trimmed || isRunning) return;

      setIsRunning(true);
      setActiveResultsTab("results");
      const targetTabId = activeTab.id;

      setTabs((prev) =>
        prev.map((t) => (t.id === targetTabId ? { ...t, error: null } : t)),
      );
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

        setTabs((prev) =>
          prev.map((t) =>
            t.id === targetTabId
              ? {
                  ...t,
                  results: enrichedResult,
                  executionTime: exactTime,
                  error: null,
                }
              : t,
          ),
        );
        saveHistory({
          query: trimmed,
          execution_time_ms: exactTime,
          round_trip_ms: Number(clientDuration.toFixed(2)),
          is_mutation: res.is_mutation,
          row_count: res.rows.length,
        });
      } catch (err: any) {
        const msg = err.message || "Execution error";
        setTabs((prev) =>
          prev.map((t) => (t.id === targetTabId ? { ...t, error: msg } : t)),
        );
        saveHistory({
          query: trimmed,
          error: msg,
        });
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning, activeTab.id, connection.id, saveHistory],
  );

  // Run Query handler (validates LIMIT for SELECT queries)
  const handleRun = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed || isRunning) return;

    if (checkMissingLimit(trimmed)) {
      setShowLimitWarning(true);
      return;
    }

    setShowLimitWarning(false);
    await executeQuery(trimmed);
  }, [query, isRunning, checkMissingLimit, executeQuery]);

  const handleRunAnyway = useCallback(async () => {
    setShowLimitWarning(false);
    await executeQuery(query);
  }, [query, executeQuery]);

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
    const trimmed = query.trim();
    if (!trimmed || isExplaining || isRunning) return;

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
  }, [query, isExplaining, isRunning, activeTab.id, connection.id]);

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

  const resultsContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library, react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: displayedRows.length,
    getScrollElement: () => resultsContainerRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

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

          {isMongo && (
            <div className="flex items-center bg-zinc-100 dark:bg-zinc-800/80 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-700/60 ml-2">
              <button
                type="button"
                onClick={() => setActiveMode("console")}
                className={cn(
                  "px-2 py-0.5 text-xs font-mono rounded transition-all flex items-center gap-1 cursor-pointer",
                  activeMode === "console"
                    ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                <Terminal className="size-3" />
                <span>Console</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveMode("pipeline")}
                className={cn(
                  "px-2 py-0.5 text-xs font-mono rounded transition-all flex items-center gap-1 cursor-pointer",
                  activeMode === "pipeline"
                    ? "bg-white dark:bg-zinc-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold"
                    : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200",
                )}
              >
                <Layers className="size-3 text-emerald-500" />
                <span>{t("pipeline.title")}</span>
              </button>
            </div>
          )}

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
            onClick={() => {
              handleQueryChange("");
              setShowLimitWarning(false);
            }}
            className="h-7 text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 inline-flex items-center justify-center gap-1.5"
          >
            <Trash2 className="size-3.5 shrink-0" />
            <span className="leading-none translate-y-px">
              {t("console.clear")}
            </span>
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

          {/* Explain Query CTA */}
          <Button
            type="button"
            size="sm"
            onClick={handleExplain}
            disabled={isExplaining || isRunning || !query.trim()}
            title={t("console.explain.tooltip")}
            className="h-7 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold gap-1.5 shadow-xs transition-all cursor-pointer"
          >
            {isExplaining ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t("console.explain.explaining")}</span>
              </>
            ) : (
              <>
                <FileSearch className="w-3.5 h-3.5" />
                <span>{t("console.explain.button")}</span>
              </>
            )}
          </Button>

          {/* Save Query — indigo gradient CTA */}
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
            className="h-7 text-xs font-semibold gap-1.5 bg-indigo-600/90 hover:bg-indigo-500 text-white border-0 shadow-sm shadow-indigo-500/20 transition-all disabled:opacity-40"
          >
            <Save className="w-3 h-3" />
            <span>{t("savedQuery.save")}</span>
          </Button>

          {/* Library Toggle */}
          <Button
            type="button"
            size="sm"
            onClick={() => setIsLibraryOpen((v) => !v)}
            className={cn(
              "h-7 text-xs font-semibold gap-1.5 transition-all border",
              isLibraryOpen
                ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/25"
                : "bg-transparent text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800",
            )}
          >
            <BookOpen
              className={cn("w-3 h-3", isLibraryOpen ? "text-indigo-400" : "")}
            />
            <span>{t("savedQuery.library")}</span>
          </Button>
        </div>
      </div>

      {/* Save toast — bottom-right floating */}
      {saveToast && (
        <div
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-xl
                       bg-[#1c1d2e] border border-indigo-500/30 text-white text-xs font-semibold
                       shadow-2xl shadow-black/40 animate-in fade-in slide-in-from-bottom-2"
        >
          <div className="w-5 h-5 rounded-full bg-indigo-500/20 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div>
            <p className="text-white/90">{t("savedQuery.saved")}</p>
            <p className="text-[10px] text-white/40 font-normal">
              {t("savedQuery.saveSuccess")}
            </p>
          </div>
        </div>
      )}

      {/* Read-Only Safety Notice */}
      {connection.read_only && (
        <div className="px-3 py-1 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/25 flex items-center gap-2 text-[11px] font-mono text-amber-800 dark:text-amber-300">
          <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>{t("console.readOnlyWarn")}</span>
        </div>
      )}

      {/* Missing LIMIT Warning Banner */}
      {showLimitWarning && (
        <div
          role="alert"
          className="px-3 py-1.5 bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/30 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-amber-900 dark:text-amber-200 animate-in fade-in slide-in-from-top-1"
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="leading-snug">{t("query.warn.no_limit")}</span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRunAnyway}
              disabled={isRunning}
              className="h-6 text-[11px] font-medium border-amber-500/40 text-amber-900 dark:text-amber-200 hover:bg-amber-500/20 bg-transparent cursor-pointer"
            >
              {t("query.warn.run_anyway")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAddLimit}
              disabled={isRunning}
              className="h-6 text-[11px] font-semibold bg-amber-600 hover:bg-amber-500 text-white shadow-2xs cursor-pointer"
            >
              {t("query.warn.add_limit")}
            </Button>
            <button
              type="button"
              onClick={() => setShowLimitWarning(false)}
              className="p-0.5 rounded text-amber-700/60 dark:text-amber-400/60 hover:text-amber-900 dark:hover:text-amber-100 hover:bg-amber-500/15 transition-colors cursor-pointer"
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
          <div className="w-60 shrink-0 overflow-hidden border-r border-zinc-200 dark:border-zinc-800">
            <QueryLibraryPanel
              connectionId={connection.id}
              onLoadQuery={(q) => handleQueryChange(q)}
              refreshTrigger={libRefreshKey}
            />
          </div>
        )}

        {/* Editor + Results column */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {/* Query Console Tab Bar */}
          <div className="h-8.5 px-2 bg-zinc-100/90 dark:bg-zinc-900/90 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-1 select-none shrink-0 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar py-0.5">
              {tabs.map((tab) => {
                const isActive = activeMode === "console" && tab.id === activeTab.id;
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
                      "group relative flex items-center gap-1.5 h-7 px-2.5 rounded-t text-xs font-mono transition-all cursor-pointer border-t border-x",
                      isActive
                        ? "bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-medium border-t-2 border-t-emerald-500 border-x-zinc-200 dark:border-x-zinc-800 shadow-2xs z-1"
                        : "bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200 border-transparent border-t-2 border-t-transparent",
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
                        className="w-24 h-4.5 px-1 py-0 text-xs font-mono bg-zinc-100 dark:bg-zinc-900 border border-emerald-500 rounded outline-hidden text-zinc-900 dark:text-zinc-100"
                      />
                    ) : (
                      <span className="truncate max-w-32 select-none">
                        {tab.label}
                      </span>
                    )}

                    {/* Dot indicator if tab has returned rows */}
                    {tab.results && tab.results.rows && tab.results.rows.length > 0 && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"
                        title={`${tab.results.rows.length} rows`}
                      />
                    )}

                    {/* Close Tab Button */}
                    <button
                      type="button"
                      onClick={(e) => handleRequestCloseTab(e, tab.id)}
                      className={cn(
                        "p-0.5 rounded-sm hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors ml-0.5 cursor-pointer",
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
                        className="flex items-center justify-center h-6 w-6 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors ml-0.5 cursor-pointer"
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
                    "group relative flex items-center gap-1.5 h-7 px-2.5 rounded-t text-xs font-mono transition-all cursor-pointer border-t border-x ml-1.5",
                    activeMode === "pipeline"
                      ? "bg-white dark:bg-zinc-950 text-emerald-600 dark:text-emerald-400 font-semibold border-t-2 border-t-emerald-500 border-x-zinc-200 dark:border-x-zinc-800 shadow-2xs z-1"
                      : "bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 hover:text-zinc-800 dark:hover:text-zinc-200 border-transparent border-t-2 border-t-transparent",
                  )}
                  title={t("pipeline.title")}
                >
                  <Layers className="size-3.5 text-emerald-500" />
                  <span className="truncate select-none">{t("pipeline.title")}</span>
                </div>
              )}
            </div>

            {/* Tab Counter */}
            <div className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0 pr-1">
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
              <div
                style={{
              height: isResultsCollapsed ? "100%" : `${editorHeight}px`,
            }}
            className={cn(
              "border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/80 shrink-0 transition-all duration-75 overflow-hidden",
              isResultsCollapsed && "flex-1 border-b-0",
            )}
          >
            <CodeMirror
              value={query}
              height="100%"
              theme={isDark ? "dark" : "light"}
              extensions={extensions}
              onChange={(val) => handleQueryChange(val)}
              placeholder={
                isMongo
                  ? 'db.collection.find({ "status": "active" }).limit(50)'
                  : 'SELECT * FROM "users" WHERE id > 0 ORDER BY id DESC LIMIT 50;'
              }
              className="text-xs font-mono border-0 focus:outline-hidden h-full"
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
              onMouseDown={handleMouseDownResizer}
              className={cn(
                "h-2 w-full bg-zinc-200/80 dark:bg-zinc-800/80 hover:bg-indigo-500/40 dark:hover:bg-indigo-500/50 cursor-row-resize flex items-center justify-center transition-colors group relative z-10 shrink-0 select-none",
                isDragging && "bg-indigo-500/60 dark:bg-indigo-500/60",
              )}
              title="Drag up or down to resize editor and results panel"
            >
              <div className="w-10 h-1 rounded-full bg-zinc-400/80 dark:bg-zinc-600/80 group-hover:bg-indigo-500 transition-colors" />
            </div>
          )}

          {/* Execution Metrics & Results Status Bar */}
          <div className="h-9 px-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-zinc-900/60 flex items-center justify-between text-xs font-mono text-zinc-600 dark:text-zinc-400 shrink-0 select-none">
            <div className="flex items-center gap-3">
              {/* Tab Selector: Results vs Execution Plan */}
              <div className="flex items-center gap-0.5 p-0.5 bg-zinc-200/70 dark:bg-zinc-800/80 rounded-md">
                <button
                  type="button"
                  onClick={() => setActiveResultsTab("results")}
                  className={cn(
                    "px-2.5 py-0.5 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                    activeResultsTab === "results"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200",
                  )}
                >
                  <span>{t("console.explain.results_tab", "Results")}</span>
                  {result && (
                    <span className="px-1 py-0.2 text-[9px] font-mono bg-zinc-100 dark:bg-zinc-800/90 rounded text-zinc-700 dark:text-zinc-300">
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
                    "px-2.5 py-0.5 rounded text-[11px] font-sans font-medium transition-colors cursor-pointer flex items-center gap-1.5",
                    activeResultsTab === "plan"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-xs"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200",
                  )}
                >
                  <FileSearch className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>{t("console.explain.plan", "Execution Plan")}</span>
                  {activeTab.explainResult && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </button>
              </div>

              {activeResultsTab === "results" ? (
                <>
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
                          {t("console.latency", {
                            ms: formatLatency(result.execution_time_ms),
                          })}
                        </span>
                      </div>

                      <span className="text-zinc-300 dark:text-zinc-700">|</span>

                      {result.is_mutation ? (
                        <span className="text-amber-700 dark:text-amber-400 font-medium">
                          {t("console.rowsAffected", {
                            count: result.rows_affected,
                          })}
                        </span>
                      ) : (
                        <span>
                          {t("console.rowsReturned", { count: result.rows.length })}
                        </span>
                      )}

                      {result.columns && result.columns.length > 0 && (
                        <>
                          <span className="text-zinc-300 dark:text-zinc-700">
                            |
                          </span>
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
                </>
              ) : (
                /* Plan tab header metrics */
                <>
                  {activeTab.explainResult && (
                    <>
                      <div className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
                        <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                        <span>
                          {activeTab.explainResult.execution_time_ms
                            ? `${formatLatency(activeTab.explainResult.execution_time_ms)} ms`
                            : "—"}
                        </span>
                      </div>
                      <span className="text-zinc-300 dark:text-zinc-700">|</span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        {activeTab.explainResult.format}
                      </span>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {activeResultsTab === "results" && result && result.rows.length > 0 && (
                <>
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
                      onClick={() => setIsResultsCollapsed(!isResultsCollapsed)}
                      className="h-6 w-6 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-800 cursor-pointer"
                    >
                      {isResultsCollapsed ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
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
            <div className="flex-1 overflow-auto custom-scrollbar p-3">
              {activeResultsTab === "results" ? (
                <>
                  {/* Error Alert */}
                  {error && (
                    <Alert
                      variant="destructive"
                      className="border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300"
                    >
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Mutation Success Notice */}
                  {result?.is_mutation && !error && (
                    <Alert className="border-emerald-300 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
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
                  {result && !result.is_mutation && displayedRows.length > 0 && (
                    <div
                      ref={resultsContainerRef}
                      className="border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-auto max-h-[calc(100vh-380px)] min-h-40 bg-white dark:bg-zinc-900/40"
                    >
                      <Table className="w-full border-collapse text-left">
                        <TableHeader className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                          <TableRow>
                            <TableHead className="w-12 text-center text-xs font-mono text-zinc-400">
                              #
                            </TableHead>
                            {result.columns.map((col) => (
                              <TableHead
                                key={col}
                                className="px-3 py-2 text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-300 border-r border-zinc-200/50 dark:border-zinc-800/50 last:border-r-0"
                              >
                                {col}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rowVirtualizer.getVirtualItems().length > 0 && (
                            <>
                              {rowVirtualizer.getVirtualItems()[0].start > 0 && (
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
                                  const row = displayedRows[virtualRow.index];
                                  const idx = virtualRow.index;
                                  if (!row) return null;
                                  return (
                                    <TableRow
                                      key={idx}
                                      data-index={virtualRow.index}
                                      ref={rowVirtualizer.measureElement}
                                      className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40 transition-colors border-b border-zinc-100 dark:border-zinc-800/60"
                                    >
                                      <TableCell className="text-center text-xs font-mono text-zinc-400 select-none bg-zinc-50/30 dark:bg-zinc-900/30">
                                        {idx + 1}
                                      </TableCell>
                                      {result.columns.map((col) => {
                                        const val = row[col];
                                        const cellKey = `${idx}-${col}`;
                                        const isCopied = copiedCell === cellKey;
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
                                            className="px-3 py-2 text-xs font-mono relative group cursor-pointer border-r border-zinc-100 dark:border-zinc-800/60 last:border-r-0 max-w-xs truncate"
                                          >
                                            {val === null || val === undefined ? (
                                              <span className="text-zinc-400 dark:text-zinc-600 italic">
                                                NULL
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
                                                <Check className="w-2.5 h-2.5" />{" "}
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
                                  rowVirtualizer.getVirtualItems().length - 1
                                ]?.end ?? 0) >
                                0 && (
                                <tr>
                                  <td
                                    colSpan={result.columns.length + 1}
                                    style={{
                                      height: `${
                                        rowVirtualizer.getTotalSize() -
                                        (rowVirtualizer.getVirtualItems()[
                                          rowVirtualizer.getVirtualItems().length -
                                            1
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
                      <div className="h-48 flex flex-col items-center justify-center text-center p-6">
                        <CheckCircle2 className="w-8 h-8 text-zinc-400 mb-2 opacity-50" />
                        <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                          {t("console.noResults")}
                        </h3>
                        <p className="text-xs text-zinc-500 mt-1">
                          Query returned 0 rows in{" "}
                          {formatLatency(result.execution_time_ms)}ms.
                        </p>
                      </div>
                    )}
                </>
              ) : (
                /* Execution Plan Tab */
                <div className="space-y-3">
                  {/* Plan Error Alert */}
                  {error && (
                    <Alert
                      variant="destructive"
                      className="border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300"
                    >
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="font-mono text-xs whitespace-pre-wrap">
                        {error}
                      </AlertDescription>
                    </Alert>
                  )}

                  {activeTab.explainResult ? (
                    <div className="space-y-3">
                      {/* Metric Summary Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        {/* Estimated Rows */}
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 shadow-xs">
                          <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                            {t("console.explain.estimated_rows")}
                          </div>
                          <div className="mt-1 text-base font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            {activeTab.explainResult.estimated_rows !== undefined
                              ? activeTab.explainResult.estimated_rows.toLocaleString()
                              : "—"}
                          </div>
                        </div>

                        {/* Actual Rows */}
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 shadow-xs">
                          <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                            {t("console.explain.actual_rows")}
                          </div>
                          <div className="mt-1 text-base font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            {activeTab.explainResult.actual_rows !== undefined
                              ? activeTab.explainResult.actual_rows.toLocaleString()
                              : "—"}
                          </div>
                        </div>

                        {/* Execution Time */}
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 shadow-xs">
                          <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                            {t("console.explain.execution_time")}
                          </div>
                          <div className="mt-1 text-base font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {activeTab.explainResult.execution_time_ms
                              ? `${formatLatency(activeTab.explainResult.execution_time_ms)} ms`
                              : "—"}
                          </div>
                        </div>

                        {/* Index Used */}
                        <div className="p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-900/60 shadow-xs">
                          <div className="text-[10px] uppercase font-mono tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
                            {t("console.explain.index_used")}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 truncate">
                            {activeTab.explainResult.index_used ? (
                              <Badge
                                variant="outline"
                                className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[11px] font-mono font-semibold truncate max-w-full"
                                title={activeTab.explainResult.index_used}
                              >
                                {activeTab.explainResult.index_used}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[11px] font-mono font-medium truncate"
                              >
                                {t("console.explain.no_index")}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Execution Plan Tree Container */}
                      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-950/60 overflow-hidden shadow-xs">
                        <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileSearch className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 font-mono">
                              {t("console.explain.plan")}
                            </span>
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-mono py-0 px-1.5 uppercase bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
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
                              className="h-6 px-2 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
                            >
                              {t("console.explain.expand_all")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setPlanExpandAll(false)}
                              className="h-6 px-2 text-[11px] font-mono text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-800"
                            >
                              {t("console.explain.collapse_all")}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleCopyPlan}
                              className="h-6 px-2 text-[11px] font-mono gap-1 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800"
                            >
                              {copiedPlan ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span>{t("console.explain.copied")}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{t("console.explain.copy_json")}</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>

                        <div className="p-3 overflow-auto max-h-[calc(100vh-380px)] min-h-40 font-mono text-xs">
                          <PlanTreeNode
                            value={activeTab.explainResult.plan}
                            expandAll={planExpandAll}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Empty State: No Execution Plan Yet */
                    <div className="h-56 flex flex-col items-center justify-center text-center p-6 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-lg">
                      <FileSearch className="w-9 h-9 text-zinc-400 mb-2.5 opacity-60" />
                      <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {t("console.explain.no_plan_title", "No Execution Plan Yet")}
                      </h3>
                      <p className="text-xs text-zinc-500 mt-1 max-w-sm">
                        {t(
                          "console.explain.no_plan_desc",
                          "Click the Explain button to analyze and visualize the query execution plan.",
                        )}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleExplain}
                        disabled={isExplaining || isRunning || !query.trim()}
                        className="mt-3.5 h-7 text-xs font-semibold gap-1.5 bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                      >
                        {isExplaining ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>{t("console.explain.explaining")}</span>
                          </>
                        ) : (
                          <>
                            <FileSearch className="w-3.5 h-3.5" />
                            <span>{t("console.explain.button")}</span>
                          </>
                        )}
                      </Button>
                    </div>
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

      {/* Unsaved Changes Tab Close Confirmation Dialog */}
      <Dialog
        open={Boolean(closingTabId)}
        onOpenChange={(open) => !open && setClosingTabId(null)}
      >
        <DialogContent className="sm:max-w-md bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl rounded-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <DialogTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {t("console.tab.close")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-zinc-600 dark:text-zinc-400 pt-2">
              {t("console.tab.unsaved_warning")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setClosingTabId(null)}
              className="text-xs h-7 font-medium"
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
              className="text-xs h-7 font-semibold"
            >
              {t("console.tab.close")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save Query Dialog */}
      <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <DialogContent className="bg-[#1c1d2e] border-white/10 text-white max-w-sm p-0 overflow-hidden">
          {/* Dialog header with gradient */}
          <div className="px-5 pt-5 pb-4 bg-linear-to-b from-indigo-500/8 to-transparent border-b border-white/6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                <Save className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <DialogTitle className="text-white text-sm font-semibold leading-tight">
                  {t("savedQuery.saveQuery")}
                </DialogTitle>
                <DialogDescription className="text-white/35 text-[10px] mt-0.5">
                  Save to your personal query library
                </DialogDescription>
              </div>
            </div>

            {/* SQL snippet preview */}
            <div className="mt-3 px-2.5 py-2 rounded-md bg-black/20 border border-white/6 font-mono text-[10px] text-white/35 truncate">
              {query.trim().split("\n")[0]?.slice(0, 60) ?? ""}
              {(query.trim().split("\n")[0]?.length ?? 0) > 60 ? "…" : ""}
            </div>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Title field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                {t("savedQuery.title")} <span className="text-red-400">*</span>
              </label>
              <Input
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder={t("savedQuery.titlePlaceholder")}
                className="bg-white/6 border-white/10 text-white text-sm placeholder:text-white/25
                           focus-visible:ring-1 focus-visible:ring-indigo-500/60 focus-visible:border-indigo-500/40"
                onKeyDown={(e) => e.key === "Enter" && handleSaveQuery()}
                autoFocus
              />
            </div>

            {/* Folder field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                {t("savedQuery.folder")}
              </label>
              <Input
                value={saveFolder}
                onChange={(e) => setSaveFolder(e.target.value)}
                placeholder={t("savedQuery.folderPlaceholder")}
                className="bg-white/6 border-white/10 text-white text-sm placeholder:text-white/25
                           focus-visible:ring-1 focus-visible:ring-indigo-500/60 focus-visible:border-indigo-500/40"
              />
            </div>

            {/* Tags field */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                {t("savedQuery.tags")}
              </label>
              <Input
                value={saveTags}
                onChange={(e) => setSaveTags(e.target.value)}
                placeholder={t("savedQuery.tagsPlaceholder")}
                className="bg-white/6 border-white/10 text-white text-sm placeholder:text-white/25
                           focus-visible:ring-1 focus-visible:ring-indigo-500/60 focus-visible:border-indigo-500/40"
              />
              <p className="text-[9px] text-white/20">
                Separate multiple tags with commas
              </p>
            </div>

            {/* Favorite toggle */}
            <button
              type="button"
              onClick={() => setSaveIsFavorite((v) => !v)}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2 rounded-md border transition-all text-left",
                saveIsFavorite
                  ? "bg-yellow-400/10 border-yellow-400/25 text-yellow-300"
                  : "bg-white/4 border-white/8 text-white/40 hover:bg-white/8 hover:text-white/60",
              )}
            >
              <Star
                className={cn(
                  "w-3.5 h-3.5 shrink-0",
                  saveIsFavorite ? "fill-yellow-400 text-yellow-400" : "",
                )}
              />
              <span className="text-xs font-medium">
                {t("savedQuery.favorite")}
              </span>
              <span className="ml-auto text-[9px] opacity-60">
                {saveIsFavorite ? "Starred" : "Click to star"}
              </span>
            </button>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 pb-5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSaveDialogOpen(false)}
              className="text-white/50 hover:text-white hover:bg-white/10 text-xs"
            >
              {t("savedQuery.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleSaveQuery}
              disabled={!saveTitle.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs gap-1.5 shadow-sm shadow-indigo-500/20 disabled:opacity-40"
            >
              <Save className="w-3.5 h-3.5" />
              {t("savedQuery.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                        handleQueryChange(item.query);
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
