import React, { useState, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Search,
  Code2,
  ListTree,
  Minimize2,
  Maximize2,
  AlertTriangle,
} from "lucide-react";

interface JsonTreeViewerProps {
  initialValue: unknown;
  rawString: string;
  isReadOnly?: boolean;
  onValueChange?: (updatedRaw: string, parsedValue: unknown) => void;
}

interface TreeNodeProps {
  keyName?: string;
  value: unknown;
  path: string;
  depth: number;
  searchQuery: string;
  onCopyPath: (path: string) => void;
  expandedMap: Record<string, boolean>;
  onToggleExpand: (path: string) => void;
}

function renderValueBadge(val: unknown) {
  if (val === null) {
    return (
      <span className="font-mono text-zinc-400 italic dark:text-zinc-500">
        null
      </span>
    );
  }
  if (val === undefined) {
    return (
      <span className="font-mono text-zinc-400 italic dark:text-zinc-500">
        undefined
      </span>
    );
  }
  if (typeof val === "boolean") {
    return (
      <span
        className={
          val
            ? "font-mono font-medium text-emerald-600 dark:text-emerald-400"
            : "font-mono font-medium text-rose-600 dark:text-rose-400"
        }
      >
        {String(val)}
      </span>
    );
  }
  if (typeof val === "number") {
    return (
      <span className="font-mono font-medium text-amber-600 dark:text-amber-400">
        {String(val)}
      </span>
    );
  }
  if (typeof val === "string") {
    return (
      <span className="font-mono text-emerald-700 dark:text-emerald-300">
        &quot;{val}&quot;
      </span>
    );
  }
  return (
    <span className="font-mono text-zinc-600 dark:text-zinc-300">
      {String(val)}
    </span>
  );
}

const TreeNode: React.FC<TreeNodeProps> = ({
  keyName,
  value,
  path,
  depth,
  searchQuery,
  onCopyPath,
  expandedMap,
  onToggleExpand,
}) => {
  const isObject = value !== null && typeof value === "object";
  const isArray = Array.isArray(value);
  const isExpanded = expandedMap[path] ?? depth < 2;

  const keys = useMemo(() => {
    if (!isObject) return [];
    return Object.keys(value as Record<string, unknown>);
  }, [isObject, value]);

  const matchesSearch = useMemo(() => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    if (keyName && keyName.toLowerCase().includes(query)) return true;
    if (!isObject && String(value).toLowerCase().includes(query)) return true;
    return false;
  }, [searchQuery, keyName, isObject, value]);

  if (!matchesSearch && !isObject) {
    return null;
  }

  return (
    <div className="font-mono text-xs leading-relaxed">
      <div
        className="group flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {isObject ? (
          <button
            type="button"
            onClick={() => onToggleExpand(path)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="inline-block h-4 w-4 shrink-0" />
        )}

        {keyName !== undefined && (
          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
            {keyName}:
          </span>
        )}

        {isObject ? (
          <span
            onClick={() => onToggleExpand(path)}
            className="cursor-pointer text-zinc-500 hover:underline dark:text-zinc-400"
          >
            {isArray ? `Array(${keys.length}) [` : `Object {${keys.length}}`}
            {!isExpanded && (isArray ? " ... ]" : " ... }")}
          </span>
        ) : (
          <span className="break-all">{renderValueBadge(value)}</span>
        )}

        {/* Action icons on hover */}
        <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title={`Copy JSON path: ${path}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopyPath(path);
            }}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
          >
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Child Nodes */}
      {isObject && isExpanded && (
        <div>
          {keys.map((k) => {
            const childPath = path
              ? isArray
                ? `${path}[${k}]`
                : `${path}.${k}`
              : k;
            const childVal = (value as Record<string, unknown>)[k];
            return (
              <TreeNode
                key={k}
                keyName={k}
                value={childVal}
                path={childPath}
                depth={depth + 1}
                searchQuery={searchQuery}
                onCopyPath={onCopyPath}
                expandedMap={expandedMap}
                onToggleExpand={onToggleExpand}
              />
            );
          })}
          <div
            className="text-zinc-500 dark:text-zinc-400"
            style={{ paddingLeft: `${depth * 16 + 20}px` }}
          >
            {isArray ? "]" : "}"}
          </div>
        </div>
      )}
    </div>
  );
};

export const JsonTreeViewer: React.FC<JsonTreeViewerProps> = ({
  initialValue,
  rawString,
  isReadOnly = false,
  onValueChange,
}) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<"tree" | "code">("tree");
  const [codeValue, setCodeValue] = useState<string>(rawString);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [syntaxError, setSyntaxError] = useState<string | null>(null);

  // Sync code value when external rawString changes
  React.useEffect(() => {
    setCodeValue(rawString);
  }, [rawString]);

  const parsedCurrentValue = useMemo(() => {
    if (viewMode === "tree") {
      if (initialValue !== undefined) return initialValue;
      try {
        return JSON.parse(codeValue);
      } catch {
        return null;
      }
    }
    return null;
  }, [viewMode, initialValue, codeValue]);

  const handleCopyPath = useCallback((path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedPath(path);
    setTimeout(() => setCopiedPath(null), 2000);
  }, []);

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedMap((prev) => ({
      ...prev,
      [path]: prev[path] === undefined ? false : !prev[path],
    }));
  }, []);

  const handleExpandAll = () => {
    // Setting an empty map with inverted default or expanding visible nodes
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((k) => (next[k] = true));
      return next;
    });
  };

  const handleCollapseAll = () => {
    setExpandedMap((prev) => {
      const next: Record<string, boolean> = {};
      Object.keys(prev).forEach((k) => (next[k] = false));
      return next;
    });
  };

  const handleFormatCode = () => {
    try {
      const parsed = JSON.parse(codeValue);
      const formatted = JSON.stringify(parsed, null, 2);
      setCodeValue(formatted);
      setSyntaxError(null);
      onValueChange?.(formatted, parsed);
    } catch (e: any) {
      setSyntaxError(e?.message ?? "Invalid JSON");
    }
  };

  const handleMinifyCode = () => {
    try {
      const parsed = JSON.parse(codeValue);
      const minified = JSON.stringify(parsed);
      setCodeValue(minified);
      setSyntaxError(null);
      onValueChange?.(minified, parsed);
    } catch (e: any) {
      setSyntaxError(e?.message ?? "Invalid JSON");
    }
  };

  const handleCodeChange = (val: string) => {
    setCodeValue(val);
    try {
      const parsed = JSON.parse(val);
      setSyntaxError(null);
      onValueChange?.(val, parsed);
    } catch (e: any) {
      setSyntaxError(e?.message ?? "JSON syntax error");
      // Still propagate text change
      onValueChange?.(val, undefined);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-zinc-950">
      {/* Sub-toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/70 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900/50">
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-md border border-zinc-200 bg-white p-0.5 shadow-2xs dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                viewMode === "tree"
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <ListTree className="h-3.5 w-3.5" />
              <span>{t("cellInspector.treeView")}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("code")}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                viewMode === "code"
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>{t("cellInspector.codeEditor")}</span>
            </button>
          </div>

          {viewMode === "tree" && (
            <div className="flex items-center gap-1 pl-2">
              <button
                type="button"
                onClick={handleExpandAll}
                title={t("cellInspector.expandAll")}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                title={t("cellInspector.collapseAll")}
                className="rounded p-1 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {viewMode === "tree" ? (
          <div className="relative flex items-center">
            <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("cellInspector.searchJsonPlaceholder")}
              className="h-7 w-44 rounded-md border border-zinc-200 bg-white pr-2 pl-8 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-zinc-700"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleFormatCode}
              className="rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t("cellInspector.formatJson")}
            </button>
            <button
              type="button"
              onClick={handleMinifyCode}
              className="rounded border border-zinc-200 bg-white px-2 py-1 font-mono text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t("cellInspector.minify")}
            </button>
          </div>
        )}
      </div>

      {copiedPath && (
        <div className="flex items-center gap-1.5 border-b border-emerald-500/20 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
          <Check className="h-3 w-3" />
          <span>{t("cellInspector.copiedPath", { path: copiedPath })}</span>
        </div>
      )}

      {syntaxError && viewMode === "code" && (
        <div className="flex items-center gap-1.5 border-b border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{syntaxError}</span>
        </div>
      )}

      {/* Main content body */}
      <div className="relative flex-1 overflow-auto p-3">
        {viewMode === "tree" ? (
          parsedCurrentValue !== null ? (
            <TreeNode
              value={parsedCurrentValue}
              path=""
              depth={0}
              searchQuery={searchQuery}
              onCopyPath={handleCopyPath}
              expandedMap={expandedMap}
              onToggleExpand={handleToggleExpand}
            />
          ) : (
            <div className="p-4 text-center text-xs text-zinc-500">
              {t("cellInspector.invalidJsonTreeNotice")}
            </div>
          )
        ) : (
          <div className="h-full rounded border border-zinc-200 dark:border-zinc-800">
            <CodeMirror
              value={codeValue}
              height="100%"
              theme="dark"
              readOnly={isReadOnly}
              extensions={[json()]}
              onChange={handleCodeChange}
              className="h-full font-mono text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
};
