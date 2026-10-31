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
      <span className="text-muted-foreground dark:text-muted-foreground font-mono italic">
        null
      </span>
    );
  }
  if (val === undefined) {
    return (
      <span className="text-muted-foreground dark:text-muted-foreground font-mono italic">
        undefined
      </span>
    );
  }
  if (typeof val === "boolean") {
    return (
      <span
        className={
          val
            ? "text-success dark:text-success font-mono font-medium"
            : "text-destructive dark:text-destructive font-mono font-medium"
        }
      >
        {String(val)}
      </span>
    );
  }
  if (typeof val === "number") {
    return (
      <span className="text-warning dark:text-warning font-mono font-medium">
        {String(val)}
      </span>
    );
  }
  if (typeof val === "string") {
    return (
      <span className="text-success dark:text-success font-mono">
        &quot;{val}&quot;
      </span>
    );
  }
  return (
    <span className="text-muted-foreground dark:text-foreground font-mono">
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
        className="group hover:bg-muted dark:hover:bg-muted/60 flex items-center gap-1.5 rounded px-1.5 py-0.5"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
      >
        {isObject ? (
          <button
            type="button"
            aria-expanded={isExpanded}
            aria-label={
              isExpanded
                ? `Collapse ${keyName || "root"}`
                : `Expand ${keyName || "root"}`
            }
            onClick={() => onToggleExpand(path)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-primary dark:text-muted-foreground dark:hover:text-foreground flex h-4 w-4 shrink-0 items-center justify-center rounded focus-visible:ring-2"
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
          <span className="text-foreground font-semibold">{keyName}:</span>
        )}

        {isObject ? (
          <span
            onClick={() => onToggleExpand(path)}
            className="text-muted-foreground dark:text-muted-foreground cursor-pointer hover:underline"
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
            aria-label={`Copy JSON path: ${path}`}
            title={`Copy JSON path: ${path}`}
            onClick={(e) => {
              e.stopPropagation();
              onCopyPath(path);
            }}
            className="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-primary dark:hover:bg-muted dark:hover:text-foreground rounded p-1 focus-visible:ring-2"
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
            className="text-muted-foreground"
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
    <div className="bg-background flex h-full flex-col overflow-hidden">
      {/* Sub-toolbar */}
      <div className="border-border bg-card/70 dark:border-border dark:bg-card/50 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="border-border bg-background dark:border-border dark:bg-card inline-flex rounded-md border p-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors ${
                viewMode === "tree"
                  ? "bg-muted text-foreground dark:bg-muted dark:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
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
                  ? "bg-muted text-foreground dark:bg-muted dark:text-foreground"
                  : "text-muted-foreground hover:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
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
                className="text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground rounded p-1"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleCollapseAll}
                title={t("cellInspector.collapseAll")}
                className="text-muted-foreground hover:bg-muted hover:text-foreground dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground rounded p-1"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {viewMode === "tree" ? (
          <div className="relative flex items-center">
            <Search className="text-muted-foreground absolute left-2.5 h-3.5 w-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("cellInspector.searchJsonPlaceholder")}
              className="border-border bg-background text-foreground placeholder:text-muted-foreground focus:border-border dark:border-border dark:bg-card dark:text-foreground dark:focus:border-border h-7 w-44 rounded-md border pr-2 pl-8 text-xs outline-none"
            />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleFormatCode}
              className="border-border bg-background text-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted rounded border px-2 py-1 font-mono text-[11px] font-medium"
            >
              {t("cellInspector.formatJson")}
            </button>
            <button
              type="button"
              onClick={handleMinifyCode}
              className="border-border bg-background text-foreground hover:bg-muted dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted rounded border px-2 py-1 font-mono text-[11px] font-medium"
            >
              {t("cellInspector.minify")}
            </button>
          </div>
        )}
      </div>

      {copiedPath && (
        <div className="border-primary/20 bg-success/10 text-success dark:text-success flex items-center gap-1.5 border-b px-3 py-1 font-mono text-[11px]">
          <Check className="h-3 w-3" />
          <span>{t("cellInspector.copiedPath", { path: copiedPath })}</span>
        </div>
      )}

      {syntaxError && viewMode === "code" && (
        <div className="border-warning/20 bg-warning/10 text-warning dark:text-warning flex items-center gap-1.5 border-b px-3 py-1 text-[11px]">
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
            <div className="text-muted-foreground p-4 text-center text-xs">
              {t("cellInspector.invalidJsonTreeNotice")}
            </div>
          )
        ) : (
          <div className="border-border h-full rounded border">
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
