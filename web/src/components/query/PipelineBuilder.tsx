import {
  useState,
  useMemo,
  type FC,
  type DragEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Loader2,
  Plus,
  Trash2,
  Copy,
  Eye,
  Layers,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  GripVertical,
  Check,
  AlertCircle,
  Sparkles,
  Filter,
  Group,
  ArrowUpDown,
  Hash,
  EyeIcon,
  GitMerge,
  FileCode,
  Download,
  Terminal,
  Code2,
} from "lucide-react";
import type { Connection, TableSchema, RawQueryResult } from "@/lib/types";
import { executeRawQuery } from "@/lib/api";
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
import { cn } from "cn";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------
export type StageType =
  | "$match"
  | "$group"
  | "$sort"
  | "$limit"
  | "$project"
  | "$lookup"
  | "$unwind";

export interface MatchFilterRule {
  id: string;
  field: string;
  operator: "$eq" | "$ne" | "$gt" | "$gte" | "$lt" | "$lte" | "$in" | "$regex" | "$exists";
  value: string;
}

export interface MatchStageConfig {
  mode: "visual" | "raw";
  rules: MatchFilterRule[];
  rawJson: string;
}

export interface GroupAccumulator {
  id: string;
  outputField: string;
  operator: "$sum" | "$avg" | "$min" | "$max" | "$count" | "$first" | "$last" | "$push";
  expression: string;
}

export interface GroupStageConfig {
  mode: "visual" | "raw";
  groupByField: string;
  accumulators: GroupAccumulator[];
  rawJson: string;
}

export interface SortFieldRule {
  id: string;
  field: string;
  direction: 1 | -1;
}

export interface SortStageConfig {
  mode: "visual" | "raw";
  fields: SortFieldRule[];
  rawJson: string;
}

export interface LimitStageConfig {
  limit: number;
}

export interface ProjectFieldRule {
  id: string;
  field: string;
  mode: "include" | "exclude" | "expr";
  expression?: string;
}

export interface ProjectStageConfig {
  mode: "visual" | "raw";
  fields: ProjectFieldRule[];
  rawJson: string;
}

export interface LookupStageConfig {
  from: string;
  localField: string;
  foreignField: string;
  as: string;
}

export interface UnwindStageConfig {
  path: string;
  preserveNullAndEmptyArrays: boolean;
}

export type StageConfig =
  | { type: "$match"; config: MatchStageConfig }
  | { type: "$group"; config: GroupStageConfig }
  | { type: "$sort"; config: SortStageConfig }
  | { type: "$limit"; config: LimitStageConfig }
  | { type: "$project"; config: ProjectStageConfig }
  | { type: "$lookup"; config: LookupStageConfig }
  | { type: "$unwind"; config: UnwindStageConfig };

export interface PipelineStageItem {
  id: string;
  enabled: boolean;
  stage: StageConfig;
}

interface PipelineBuilderProps {
  connection: Connection;
  tables: TableSchema[];
  onOpenInConsole?: (query: string) => void;
}

// --------------------------------------------------------------------------
// Helper: Smart Parse Value
// --------------------------------------------------------------------------
function parseSmartValue(val: string): unknown {
  const trimmed = val.trim();
  if (trimmed === "") return "";
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (!isNaN(Number(trimmed)) && !trimmed.startsWith("0x")) {
    return Number(trimmed);
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

// --------------------------------------------------------------------------
// Stage Defaults Creator
// --------------------------------------------------------------------------
function createDefaultStage(type: StageType): StageConfig {
  const idGen = () => Math.random().toString(36).substring(2, 9);
  switch (type) {
    case "$match":
      return {
        type: "$match",
        config: {
          mode: "visual",
          rules: [{ id: idGen(), field: "status", operator: "$eq", value: "active" }],
          rawJson: '{\n  "status": "active"\n}',
        },
      };
    case "$group":
      return {
        type: "$group",
        config: {
          mode: "visual",
          groupByField: "$country",
          accumulators: [
            {
              id: idGen(),
              outputField: "count",
              operator: "$sum",
              expression: "1",
            },
          ],
          rawJson: '{\n  "_id": "$country",\n  "count": { "$sum": 1 }\n}',
        },
      };
    case "$sort":
      return {
        type: "$sort",
        config: {
          mode: "visual",
          fields: [{ id: idGen(), field: "count", direction: -1 }],
          rawJson: '{\n  "count": -1\n}',
        },
      };
    case "$limit":
      return {
        type: "$limit",
        config: { limit: 50 },
      };
    case "$project":
      return {
        type: "$project",
        config: {
          mode: "visual",
          fields: [
            { id: idGen(), field: "_id", mode: "include" },
            { id: idGen(), field: "name", mode: "include" },
          ],
          rawJson: '{\n  "_id": 1,\n  "name": 1\n}',
        },
      };
    case "$lookup":
      return {
        type: "$lookup",
        config: {
          from: "",
          localField: "_id",
          foreignField: "userId",
          as: "joinedData",
        },
      };
    case "$unwind":
      return {
        type: "$unwind",
        config: {
          path: "$tags",
          preserveNullAndEmptyArrays: false,
        },
      };
  }
}

// --------------------------------------------------------------------------
// Generate Stage Object
// --------------------------------------------------------------------------
function generateStageObject(stageConfig: StageConfig): Record<string, unknown> | null {
  switch (stageConfig.type) {
    case "$match": {
      const { mode, rules, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $match: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const matchObj: Record<string, unknown> = {};
      for (const rule of rules) {
        const field = rule.field.trim();
        if (!field) continue;
        const parsed = parseSmartValue(rule.value);
        if (rule.operator === "$eq") {
          matchObj[field] = parsed;
        } else if (rule.operator === "$in") {
          if (Array.isArray(parsed)) {
            matchObj[field] = { $in: parsed };
          } else if (typeof parsed === "string") {
            matchObj[field] = {
              $in: parsed.split(",").map((s) => parseSmartValue(s.trim())),
            };
          } else {
            matchObj[field] = { $in: [parsed] };
          }
        } else {
          matchObj[field] = { [rule.operator]: parsed };
        }
      }
      return { $match: matchObj };
    }

    case "$group": {
      const { mode, groupByField, accumulators, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $group: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const groupObj: Record<string, unknown> = {};
      const trimmedGroup = groupByField.trim();
      if (!trimmedGroup || trimmedGroup === "null") {
        groupObj["_id"] = null;
      } else if (trimmedGroup.startsWith("{")) {
        try {
          groupObj["_id"] = JSON.parse(trimmedGroup);
        } catch {
          groupObj["_id"] = trimmedGroup;
        }
      } else if (trimmedGroup.startsWith("$")) {
        groupObj["_id"] = trimmedGroup;
      } else {
        groupObj["_id"] = "$" + trimmedGroup;
      }

      for (const acc of accumulators) {
        const outField = acc.outputField.trim();
        if (!outField) continue;
        const parsedExpr = parseSmartValue(acc.expression);
        groupObj[outField] = { [acc.operator]: parsedExpr };
      }
      return { $group: groupObj };
    }

    case "$sort": {
      const { mode, fields, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $sort: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const sortObj: Record<string, number> = {};
      for (const f of fields) {
        const fieldName = f.field.trim();
        if (fieldName) {
          sortObj[fieldName] = f.direction;
        }
      }
      return { $sort: sortObj };
    }

    case "$limit": {
      const num = Number(stageConfig.config.limit);
      return { $limit: isNaN(num) || num <= 0 ? 50 : Math.floor(num) };
    }

    case "$project": {
      const { mode, fields, rawJson } = stageConfig.config;
      if (mode === "raw") {
        try {
          return { $project: JSON.parse(rawJson) };
        } catch {
          return null;
        }
      }
      const projObj: Record<string, unknown> = {};
      for (const f of fields) {
        const fieldName = f.field.trim();
        if (!fieldName) continue;
        if (f.mode === "include") {
          projObj[fieldName] = 1;
        } else if (f.mode === "exclude") {
          projObj[fieldName] = 0;
        } else {
          projObj[fieldName] = parseSmartValue(f.expression || "");
        }
      }
      return { $project: projObj };
    }

    case "$lookup": {
      const { from, localField, foreignField, as } = stageConfig.config;
      return {
        $lookup: {
          from: from.trim(),
          localField: localField.trim(),
          foreignField: foreignField.trim(),
          as: as.trim() || "joinedData",
        },
      };
    }

    case "$unwind": {
      const { path, preserveNullAndEmptyArrays } = stageConfig.config;
      const cleanPath = path.trim();
      const formattedPath = cleanPath.startsWith("$") ? cleanPath : "$" + cleanPath;
      if (preserveNullAndEmptyArrays) {
        return {
          $unwind: {
            path: formattedPath,
            preserveNullAndEmptyArrays: true,
          },
        };
      }
      return { $unwind: formattedPath };
    }
  }
}

// --------------------------------------------------------------------------
// Component
// --------------------------------------------------------------------------
export const PipelineBuilder: FC<PipelineBuilderProps> = ({
  connection,
  tables,
  onOpenInConsole,
}) => {
  const { t } = useTranslation();

  // Selected Collection
  const [collection, setCollection] = useState<string>(() => {
    return tables.length > 0 ? tables[0].name : "records";
  });

  // Pipeline Stages
  const [stages, setStages] = useState<PipelineStageItem[]>(() => [
    {
      id: "stage-1",
      enabled: true,
      stage: createDefaultStage("$match"),
    },
    {
      id: "stage-2",
      enabled: true,
      stage: createDefaultStage("$group"),
    },
    {
      id: "stage-3",
      enabled: true,
      stage: createDefaultStage("$sort"),
    },
  ]);

  // Drag & drop state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<RawQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Preview Dialog
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [copiedPreview, setCopiedPreview] = useState(false);

  // Filter text for results table
  const [resultsFilter, setResultsFilter] = useState("");
  const [activeResultsView, setActiveResultsView] = useState<"table" | "json">("table");

  // Construct active pipeline array
  const pipelineArray = useMemo(() => {
    const pipeline: Record<string, unknown>[] = [];
    for (const item of stages) {
      if (!item.enabled) continue;
      const obj = generateStageObject(item.stage);
      if (obj) {
        pipeline.push(obj);
      }
    }
    return pipeline;
  }, [stages]);

  // Formatted MongoDB command
  const generatedShellCommand = useMemo(() => {
    const target = collection.trim() || "collection";
    return `db.${target}.aggregate(${JSON.stringify(pipelineArray, null, 2)})`;
  }, [collection, pipelineArray]);

  // --------------------------------------------------------------------------
  // Stage Operations
  // --------------------------------------------------------------------------
  const handleAddStage = (type: StageType) => {
    const newStage: PipelineStageItem = {
      id: "stage-" + Math.random().toString(36).substring(2, 9),
      enabled: true,
      stage: createDefaultStage(type),
    };
    setStages((prev) => [...prev, newStage]);
  };

  const handleDuplicateStage = (index: number) => {
    const target = stages[index];
    if (!target) return;
    const duplicated: PipelineStageItem = {
      id: "stage-" + Math.random().toString(36).substring(2, 9),
      enabled: true,
      stage: JSON.parse(JSON.stringify(target.stage)),
    };
    setStages((prev) => [
      ...prev.slice(0, index + 1),
      duplicated,
      ...prev.slice(index + 1),
    ]);
  };

  const handleDeleteStage = (index: number) => {
    setStages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleToggleStage = (index: number) => {
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s)),
    );
  };

  const handleMoveStage = (index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= stages.length) return;
    setStages((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next;
    });
  };

  const handleClearAll = () => {
    setStages([]);
    setResults(null);
    setError(null);
  };

  const handleLoadCheckpointSample = () => {
    setStages([
      {
        id: "sample-1",
        enabled: true,
        stage: {
          type: "$match",
          config: {
            mode: "visual",
            rules: [{ id: "r1", field: "status", operator: "$eq", value: "active" }],
            rawJson: '{\n  "status": "active"\n}',
          },
        },
      },
      {
        id: "sample-2",
        enabled: true,
        stage: {
          type: "$group",
          config: {
            mode: "visual",
            groupByField: "$country",
            accumulators: [
              { id: "a1", outputField: "count", operator: "$sum", expression: "1" },
            ],
            rawJson: '{\n  "_id": "$country",\n  "count": { "$sum": 1 }\n}',
          },
        },
      },
      {
        id: "sample-3",
        enabled: true,
        stage: {
          type: "$sort",
          config: {
            mode: "visual",
            fields: [{ id: "s1", field: "count", direction: -1 }],
            rawJson: '{\n  "count": -1\n}',
          },
        },
      },
    ]);
  };

  // --------------------------------------------------------------------------
  // Drag and Drop
  // --------------------------------------------------------------------------
  const handleDragStart = (e: DragEvent<HTMLDivElement>, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      return;
    }
    setStages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(draggedIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
    setDraggedIndex(null);
  };

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------
  const handleRunPipeline = async () => {
    if (!collection.trim()) {
      setError(t("pipeline.missing_collection"));
      return;
    }
    setIsRunning(true);
    setError(null);
    try {
      const res = await executeRawQuery(connection.id, generatedShellCommand);
      setResults(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      setResults(null);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(generatedShellCommand);
    setCopiedPreview(true);
    setTimeout(() => setCopiedPreview(false), 2000);
  };

  const handleExportCSV = () => {
    if (!results || !results.rows || results.rows.length === 0) return;
    const cols = results.columns;
    const headerRow = cols.map((c) => `"${c.replace(/"/g, '""')}"`).join(",");
    const bodyRows = results.rows.map((row) =>
      cols
        .map((c) => {
          const val = row[c];
          if (val === null || val === undefined) return "";
          const str = typeof val === "object" ? JSON.stringify(val) : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(","),
    );
    const csvContent = [headerRow, ...bodyRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `pipeline_${collection || "results"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered rows for Results table
  const displayedRows = useMemo(() => {
    if (!results || !results.rows) return [];
    if (!resultsFilter.trim()) return results.rows;
    const term = resultsFilter.toLowerCase();
    return results.rows.filter((row) =>
      Object.values(row).some((v) =>
        v !== null && v !== undefined
          ? String(typeof v === "object" ? JSON.stringify(v) : v)
              .toLowerCase()
              .includes(term)
          : false,
      ),
    );
  }, [results, resultsFilter]);

  // Stage Badge Colors
  const getStageBadgeStyle = (type: StageType) => {
    switch (type) {
      case "$match":
        return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
      case "$group":
        return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
      case "$sort":
        return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30";
      case "$limit":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/30";
      case "$project":
        return "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/30";
      case "$lookup":
        return "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30";
      case "$unwind":
        return "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden font-sans">
      {/* -------------------------------------------------------------------- */}
      {/* Top Action Bar */}
      {/* -------------------------------------------------------------------- */}
      <div className="h-12 px-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {/* Collection Selector */}
          <div className="flex items-center gap-1.5 text-xs font-mono">
            <span className="text-zinc-500 font-medium">
              {t("pipeline.collection")}:
            </span>
            <div className="relative">
              <input
                list="mongo-collections-list"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder={t("pipeline.select_collection")}
                className="h-7 w-44 px-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
              />
              <datalist id="mongo-collections-list">
                {tables.map((tbl) => (
                  <option key={tbl.name} value={tbl.name} />
                ))}
              </datalist>
            </div>
          </div>

          <span className="text-zinc-300 dark:text-zinc-700">|</span>

          {/* Add Stage Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs font-semibold gap-1.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer"
                >
                  <Plus className="size-3.5" />
                  <span>{t("pipeline.stage.add")}</span>
                  <ChevronDown className="size-3 opacity-60 ml-0.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="start" className="w-56 font-mono text-xs">
              <DropdownMenuItem
                onClick={() => handleAddStage("$match")}
                className="cursor-pointer gap-2"
              >
                <Filter className="size-3.5 text-amber-500" />
                <span>{t("pipeline.stage.match")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$group")}
                className="cursor-pointer gap-2"
              >
                <Group className="size-3.5 text-emerald-500" />
                <span>{t("pipeline.stage.group")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$sort")}
                className="cursor-pointer gap-2"
              >
                <ArrowUpDown className="size-3.5 text-sky-500" />
                <span>{t("pipeline.stage.sort")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$limit")}
                className="cursor-pointer gap-2"
              >
                <Hash className="size-3.5 text-purple-500" />
                <span>{t("pipeline.stage.limit")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$project")}
                className="cursor-pointer gap-2"
              >
                <EyeIcon className="size-3.5 text-indigo-500" />
                <span>{t("pipeline.stage.project")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$lookup")}
                className="cursor-pointer gap-2"
              >
                <GitMerge className="size-3.5 text-rose-500" />
                <span>{t("pipeline.stage.lookup")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$unwind")}
                className="cursor-pointer gap-2"
              >
                <Layers className="size-3.5 text-orange-500" />
                <span>{t("pipeline.stage.unwind")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sample Checkpoint Preset */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLoadCheckpointSample}
            className="h-7 text-xs font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 gap-1.5"
            title={t("pipeline.load_sample")}
          >
            <Sparkles className="size-3.5 text-amber-500" />
            <span className="hidden sm:inline">{t("pipeline.load_sample")}</span>
          </Button>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
          {/* Clear All */}
          {stages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-7 text-xs font-mono text-zinc-400 hover:text-rose-500"
            >
              <Trash2 className="size-3 mr-1" />
              <span>{t("pipeline.clear")}</span>
            </Button>
          )}

          {/* Preview JSON CTA */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            className="h-7 text-xs font-mono gap-1.5 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 cursor-pointer"
          >
            <Eye className="size-3.5 text-indigo-500" />
            <span>{t("pipeline.preview_json")}</span>
          </Button>

          {/* Run Pipeline CTA */}
          <Button
            type="button"
            size="sm"
            onClick={handleRunPipeline}
            disabled={isRunning || stages.length === 0}
            className="h-7 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold gap-1.5 shadow-2xs cursor-pointer"
          >
            {isRunning ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{t("pipeline.running")}</span>
              </>
            ) : (
              <>
                <Play className="size-3 fill-current" />
                <span>{t("pipeline.run")}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Main Content: Stages List (Top/Left) + Results Panel (Bottom) */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left / Top: Stage Cards List */}
        <div className="flex-1 flex flex-col overflow-y-auto p-4 space-y-3 border-r border-zinc-200 dark:border-zinc-800">
          {stages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400">
              <Layers className="size-10 mb-3 opacity-30 text-emerald-500" />
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300 max-w-md">
                {t("pipeline.empty_stages")}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => handleAddStage("$match")}
                className="mt-4 h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium gap-1.5"
              >
                <Plus className="size-3.5" />
                <span>{t("pipeline.stage.add")}</span>
              </Button>
            </div>
          ) : (
            stages.map((stageItem, index) => {
              const isFirst = index === 0;
              const isLast = index === stages.length - 1;

              return (
                <div
                  key={stageItem.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className={cn(
                    "group relative rounded-lg border bg-white dark:bg-zinc-900 shadow-2xs transition-all",
                    stageItem.enabled
                      ? "border-zinc-200 dark:border-zinc-800"
                      : "border-zinc-200/50 dark:border-zinc-800/50 opacity-60 bg-zinc-50 dark:bg-zinc-900/40",
                    draggedIndex === index && "ring-2 ring-emerald-500 opacity-40",
                  )}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-t-lg">
                    <div className="flex items-center gap-2">
                      {/* Drag Handle */}
                      <button
                        type="button"
                        className="cursor-grab active:cursor-grabbing text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-0.5 rounded"
                        title={t("pipeline.stage.drag_handle")}
                      >
                        <GripVertical className="size-4" />
                      </button>

                      {/* Stage Index & Badge */}
                      <span className="text-[11px] font-mono font-semibold text-zinc-400">
                        #{index + 1}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-mono font-semibold uppercase px-2 py-0.5",
                          getStageBadgeStyle(stageItem.stage.type),
                        )}
                      >
                        {stageItem.stage.type}
                      </Badge>

                      {/* Active Status Badge */}
                      {!stageItem.enabled && (
                        <span className="text-[10px] font-mono text-zinc-400 bg-zinc-200/60 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                          {t("pipeline.stage.disabled")}
                        </span>
                      )}
                    </div>

                    {/* Card Actions */}
                    <div className="flex items-center gap-1">
                      {/* Visual / Raw JSON Toggle (if supported) */}
                      {"mode" in stageItem.stage.config && (
                        <button
                          type="button"
                          onClick={() => {
                            const currentStage = stageItem.stage;
                            if ("mode" in currentStage.config) {
                              const newMode =
                                currentStage.config.mode === "visual"
                                  ? "raw"
                                  : "visual";
                              let rawContent = currentStage.config.rawJson;
                              if (newMode === "raw") {
                                const generated = generateStageObject(currentStage);
                                if (generated) {
                                  const inner = (generated as Record<string, unknown>)[
                                    currentStage.type
                                  ];
                                  rawContent = JSON.stringify(inner, null, 2);
                                }
                              }
                              setStages((prev) =>
                                prev.map((s, idx) =>
                                  idx === index
                                    ? {
                                        ...s,
                                        stage: {
                                          ...currentStage,
                                          config: {
                                            ...currentStage.config,
                                            mode: newMode,
                                            rawJson: rawContent,
                                          },
                                        } as StageConfig,
                                      }
                                    : s,
                                ),
                              );
                            }
                          }}
                          className="h-6 px-1.5 text-[10px] font-mono rounded border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1 cursor-pointer"
                          title={
                            stageItem.stage.config.mode === "visual"
                              ? t("pipeline.raw_mode")
                              : t("pipeline.form_mode")
                          }
                        >
                          <Code2 className="size-3" />
                          <span>
                            {stageItem.stage.config.mode === "visual"
                              ? t("pipeline.raw_mode")
                              : t("pipeline.form_mode")}
                          </span>
                        </button>
                      )}

                      {/* Enable/Disable Toggle */}
                      <button
                        type="button"
                        onClick={() => handleToggleStage(index)}
                        className={cn(
                          "p-1 rounded transition-colors cursor-pointer",
                          stageItem.enabled
                            ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            : "text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200",
                        )}
                        title={t("pipeline.stage.toggle_enable")}
                      >
                        <Check className="size-3.5" />
                      </button>

                      {/* Move Up */}
                      <button
                        type="button"
                        disabled={isFirst}
                        onClick={() => handleMoveStage(index, "up")}
                        className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 cursor-pointer"
                        title={t("pipeline.stage.move_up")}
                      >
                        <ArrowUp className="size-3.5" />
                      </button>

                      {/* Move Down */}
                      <button
                        type="button"
                        disabled={isLast}
                        onClick={() => handleMoveStage(index, "down")}
                        className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-20 cursor-pointer"
                        title={t("pipeline.stage.move_down")}
                      >
                        <ArrowDown className="size-3.5" />
                      </button>

                      {/* Duplicate */}
                      <button
                        type="button"
                        onClick={() => handleDuplicateStage(index)}
                        className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer"
                        title={t("pipeline.stage.duplicate")}
                      >
                        <Copy className="size-3.5" />
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDeleteStage(index)}
                        className="p-1 text-zinc-400 hover:text-rose-500 cursor-pointer"
                        title={t("pipeline.stage.delete")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Card Body / Form UI */}
                  <div className="p-3">
                    {/* Stage $match */}
                    {stageItem.stage.type === "$match" && (
                      <MatchStageEditor
                        config={stageItem.stage.config}
                        onChange={(newConf) => {
                          setStages((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, stage: { type: "$match", config: newConf } }
                                : s,
                            ),
                          );
                        }}
                      />
                    )}

                    {/* Stage $group */}
                    {stageItem.stage.type === "$group" && (
                      <GroupStageEditor
                        config={stageItem.stage.config}
                        onChange={(newConf) => {
                          setStages((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, stage: { type: "$group", config: newConf } }
                                : s,
                            ),
                          );
                        }}
                      />
                    )}

                    {/* Stage $sort */}
                    {stageItem.stage.type === "$sort" && (
                      <SortStageEditor
                        config={stageItem.stage.config}
                        onChange={(newConf) => {
                          setStages((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, stage: { type: "$sort", config: newConf } }
                                : s,
                            ),
                          );
                        }}
                      />
                    )}

                    {/* Stage $limit */}
                    {stageItem.stage.type === "$limit" && (
                      <LimitStageEditor
                        config={stageItem.stage.config}
                        onChange={(newConf) => {
                          setStages((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, stage: { type: "$limit", config: newConf } }
                                : s,
                            ),
                          );
                        }}
                      />
                    )}

                    {/* Stage $project */}
                    {stageItem.stage.type === "$project" && (
                      <ProjectStageEditor
                        config={stageItem.stage.config}
                        onChange={(newConf) => {
                          setStages((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, stage: { type: "$project", config: newConf } }
                                : s,
                            ),
                          );
                        }}
                      />
                    )}

                    {/* Stage $lookup */}
                    {stageItem.stage.type === "$lookup" && (
                      <LookupStageEditor
                        config={stageItem.stage.config}
                        tables={tables}
                        onChange={(newConf) => {
                          setStages((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, stage: { type: "$lookup", config: newConf } }
                                : s,
                            ),
                          );
                        }}
                      />
                    )}

                    {/* Stage $unwind */}
                    {stageItem.stage.type === "$unwind" && (
                      <UnwindStageEditor
                        config={stageItem.stage.config}
                        onChange={(newConf) => {
                          setStages((prev) =>
                            prev.map((s, i) =>
                              i === index
                                ? { ...s, stage: { type: "$unwind", config: newConf } }
                                : s,
                            ),
                          );
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right / Bottom: Live Results Panel */}
        <div className="w-full md:w-1/2 flex flex-col bg-white dark:bg-zinc-950 border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {/* Results Header */}
          <div className="h-10 px-3 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {t("pipeline.results")}
              </span>
              {results && (
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                    {results.rows.length} docs
                  </span>
                  <span>•</span>
                  <span>{results.execution_time_ms.toFixed(1)}ms</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {results && results.rows.length > 0 && (
                <>
                  <input
                    type="text"
                    value={resultsFilter}
                    onChange={(e) => setResultsFilter(e.target.value)}
                    placeholder="Filter results..."
                    className="h-6 w-28 px-1.5 text-[11px] font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100"
                  />
                  <div className="flex items-center border border-zinc-200 dark:border-zinc-800 rounded p-0.5 bg-zinc-100 dark:bg-zinc-800">
                    <button
                      type="button"
                      onClick={() => setActiveResultsView("table")}
                      className={cn(
                        "px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer",
                        activeResultsView === "table"
                          ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-medium shadow-2xs"
                          : "text-zinc-500",
                      )}
                    >
                      Table
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveResultsView("json")}
                      className={cn(
                        "px-1.5 py-0.5 text-[10px] font-mono rounded cursor-pointer",
                        activeResultsView === "json"
                          ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 font-medium shadow-2xs"
                          : "text-zinc-500",
                      )}
                    >
                      JSON
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleExportCSV}
                    className="h-6 text-[11px] font-mono text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 px-1.5"
                    title="Export to CSV"
                  >
                    <Download className="size-3" />
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Results Content */}
          <div className="flex-1 overflow-auto p-3">
            {error && (
              <Alert variant="destructive" className="mb-3">
                <AlertCircle className="size-4" />
                <AlertDescription className="font-mono text-xs">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {isRunning ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 space-y-2">
                <Loader2 className="size-6 animate-spin text-emerald-500" />
                <p className="text-xs font-mono">{t("pipeline.running")}</p>
              </div>
            ) : results ? (
              results.rows.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-400 text-xs font-mono">
                  No documents matched pipeline.
                </div>
              ) : activeResultsView === "json" ? (
                <pre className="p-3 text-xs font-mono bg-zinc-900 text-zinc-100 rounded-md overflow-x-auto select-all leading-relaxed">
                  {JSON.stringify(displayedRows, null, 2)}
                </pre>
              ) : (
                <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-md">
                  <table className="w-full text-xs font-mono text-left">
                    <thead className="bg-zinc-100 dark:bg-zinc-900/80 text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 select-none">
                      <tr>
                        <th className="px-2.5 py-1.5 w-10 text-center text-[10px] text-zinc-400">
                          #
                        </th>
                        {results.columns.map((col) => (
                          <th key={col} className="px-2.5 py-1.5 font-semibold">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                      {displayedRows.map((row, rIdx) => (
                        <tr
                          key={rIdx}
                          className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition-colors"
                        >
                          <td className="px-2.5 py-1.5 text-center text-[10px] text-zinc-400 tabular-nums">
                            {rIdx + 1}
                          </td>
                          {results.columns.map((col) => {
                            const val = row[col];
                            const isObj =
                              val !== null &&
                              val !== undefined &&
                              typeof val === "object";
                            return (
                              <td
                                key={col}
                                className="px-2.5 py-1.5 text-zinc-800 dark:text-zinc-200 whitespace-nowrap"
                              >
                                {val === null ? (
                                  <span className="text-zinc-400 italic">null</span>
                                ) : isObj ? (
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300">
                                    {JSON.stringify(val)}
                                  </span>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-400 p-6 text-center">
                <FileCode className="size-8 mb-2 opacity-30 text-emerald-500" />
                <p className="text-xs font-mono">{t("pipeline.no_results")}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* Preview JSON Dialog */}
      {/* -------------------------------------------------------------------- */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-mono">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Eye className="size-4 text-emerald-500" />
              <span>{t("pipeline.preview_title")}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500">
              {t("pipeline.preview_desc")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div>
              <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider block mb-1">
                Mongo Shell Command
              </span>
              <pre className="p-3 text-xs bg-zinc-950 text-emerald-400 rounded-md overflow-x-auto max-h-72 border border-zinc-800 selection:bg-emerald-800">
                {generatedShellCommand}
              </pre>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyCommand}
                  className="h-8 text-xs font-mono gap-1.5"
                >
                  {copiedPreview ? (
                    <>
                      <Check className="size-3.5 text-emerald-500" />
                      <span>{t("pipeline.copied")}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="size-3.5" />
                      <span>{t("pipeline.copy_command")}</span>
                    </>
                  )}
                </Button>

                {onOpenInConsole && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onOpenInConsole(generatedShellCommand);
                      setIsPreviewOpen(false);
                    }}
                    className="h-8 text-xs font-mono gap-1.5 text-zinc-600 dark:text-zinc-300"
                  >
                    <Terminal className="size-3.5 text-emerald-500" />
                    <span>{t("pipeline.open_in_console")}</span>
                  </Button>
                )}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => setIsPreviewOpen(false)}
                className="h-8 text-xs font-medium"
              >
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// --------------------------------------------------------------------------
// Sub-Editors for Each Stage Type
// --------------------------------------------------------------------------

// 1. $match Editor
const MatchStageEditor: FC<{
  config: MatchStageConfig;
  onChange: (conf: MatchStageConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  if (config.mode === "raw") {
    return (
      <textarea
        value={config.rawJson}
        onChange={(e) => onChange({ ...config, rawJson: e.target.value })}
        rows={4}
        className="w-full p-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
        placeholder='{ "status": "active" }'
      />
    );
  }

  const handleAddRule = () => {
    onChange({
      ...config,
      rules: [
        ...config.rules,
        {
          id: Math.random().toString(36).substring(2, 9),
          field: "",
          operator: "$eq",
          value: "",
        },
      ],
    });
  };

  const handleUpdateRule = (
    ruleId: string,
    fieldUpdates: Partial<MatchFilterRule>,
  ) => {
    onChange({
      ...config,
      rules: config.rules.map((r) =>
        r.id === ruleId ? { ...r, ...fieldUpdates } : r,
      ),
    });
  };

  const handleDeleteRule = (ruleId: string) => {
    onChange({
      ...config,
      rules: config.rules.filter((r) => r.id !== ruleId),
    });
  };

  return (
    <div className="space-y-2">
      {config.rules.map((rule) => (
        <div key={rule.id} className="flex items-center gap-2">
          <Input
            value={rule.field}
            onChange={(e) => handleUpdateRule(rule.id, { field: e.target.value })}
            placeholder={t("pipeline.field")}
            className="h-7 w-1/3 text-xs font-mono"
          />
          <select
            value={rule.operator}
            onChange={(e) =>
              handleUpdateRule(rule.id, {
                operator: e.target.value as MatchFilterRule["operator"],
              })
            }
            className="h-7 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 text-zinc-800 dark:text-zinc-200"
          >
            <option value="$eq">$eq (=)</option>
            <option value="$ne">$ne (≠)</option>
            <option value="$gt">$gt (&gt;)</option>
            <option value="$gte">$gte (&gt;=)</option>
            <option value="$lt">$lt (&lt;)</option>
            <option value="$lte">$lte (&lt;=)</option>
            <option value="$in">$in (in array)</option>
            <option value="$regex">$regex (matches)</option>
            <option value="$exists">$exists</option>
          </select>
          <Input
            value={rule.value}
            onChange={(e) => handleUpdateRule(rule.id, { value: e.target.value })}
            placeholder={t("pipeline.value")}
            className="h-7 flex-1 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => handleDeleteRule(rule.id)}
            className="p-1 text-zinc-400 hover:text-rose-500 cursor-pointer"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAddRule}
        className="h-6 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-2"
      >
        <Plus className="size-3 mr-1" />
        <span>{t("pipeline.add_rule")}</span>
      </Button>
    </div>
  );
};

// 2. $group Editor
const GroupStageEditor: FC<{
  config: GroupStageConfig;
  onChange: (conf: GroupStageConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  if (config.mode === "raw") {
    return (
      <textarea
        value={config.rawJson}
        onChange={(e) => onChange({ ...config, rawJson: e.target.value })}
        rows={5}
        className="w-full p-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
        placeholder='{ "_id": "$country", "count": { "$sum": 1 } }'
      />
    );
  }

  const handleAddAccumulator = () => {
    onChange({
      ...config,
      accumulators: [
        ...config.accumulators,
        {
          id: Math.random().toString(36).substring(2, 9),
          outputField: "count",
          operator: "$sum",
          expression: "1",
        },
      ],
    });
  };

  const handleUpdateAccumulator = (
    accId: string,
    updates: Partial<GroupAccumulator>,
  ) => {
    onChange({
      ...config,
      accumulators: config.accumulators.map((a) =>
        a.id === accId ? { ...a, ...updates } : a,
      ),
    });
  };

  const handleDeleteAccumulator = (accId: string) => {
    onChange({
      ...config,
      accumulators: config.accumulators.filter((a) => a.id !== accId),
    });
  };

  return (
    <div className="space-y-3">
      {/* Group By (_id) */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-500 w-28 shrink-0">
          {t("pipeline.group_by")}:
        </span>
        <Input
          value={config.groupByField}
          onChange={(e) => onChange({ ...config, groupByField: e.target.value })}
          placeholder='$country or null'
          className="h-7 flex-1 text-xs font-mono"
        />
      </div>

      {/* Accumulators */}
      <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
        <span className="text-[11px] font-mono text-zinc-400 block">
          {t("pipeline.accumulators")}
        </span>
        {config.accumulators.map((acc) => (
          <div key={acc.id} className="flex items-center gap-2">
            <Input
              value={acc.outputField}
              onChange={(e) =>
                handleUpdateAccumulator(acc.id, { outputField: e.target.value })
              }
              placeholder="Field name (e.g. count)"
              className="h-7 w-1/3 text-xs font-mono"
            />
            <select
              value={acc.operator}
              onChange={(e) =>
                handleUpdateAccumulator(acc.id, {
                  operator: e.target.value as GroupAccumulator["operator"],
                })
              }
              className="h-7 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 text-zinc-800 dark:text-zinc-200"
            >
              <option value="$sum">$sum</option>
              <option value="$avg">$avg</option>
              <option value="$min">$min</option>
              <option value="$max">$max</option>
              <option value="$count">$count</option>
              <option value="$first">$first</option>
              <option value="$last">$last</option>
              <option value="$push">$push</option>
            </select>
            <Input
              value={acc.expression}
              onChange={(e) =>
                handleUpdateAccumulator(acc.id, { expression: e.target.value })
              }
              placeholder='Expression (1 or $field)'
              className="h-7 flex-1 text-xs font-mono"
            />
            <button
              type="button"
              onClick={() => handleDeleteAccumulator(acc.id)}
              className="p-1 text-zinc-400 hover:text-rose-500 cursor-pointer"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleAddAccumulator}
          className="h-6 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-2"
        >
          <Plus className="size-3 mr-1" />
          <span>{t("pipeline.add_accumulator")}</span>
        </Button>
      </div>
    </div>
  );
};

// 3. $sort Editor
const SortStageEditor: FC<{
  config: SortStageConfig;
  onChange: (conf: SortStageConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  if (config.mode === "raw") {
    return (
      <textarea
        value={config.rawJson}
        onChange={(e) => onChange({ ...config, rawJson: e.target.value })}
        rows={3}
        className="w-full p-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
        placeholder='{ "count": -1 }'
      />
    );
  }

  const handleAddField = () => {
    onChange({
      ...config,
      fields: [
        ...config.fields,
        {
          id: Math.random().toString(36).substring(2, 9),
          field: "",
          direction: -1,
        },
      ],
    });
  };

  const handleUpdateField = (
    fieldId: string,
    updates: Partial<SortFieldRule>,
  ) => {
    onChange({
      ...config,
      fields: config.fields.map((f) =>
        f.id === fieldId ? { ...f, ...updates } : f,
      ),
    });
  };

  const handleDeleteField = (fieldId: string) => {
    onChange({
      ...config,
      fields: config.fields.filter((f) => f.id !== fieldId),
    });
  };

  return (
    <div className="space-y-2">
      {config.fields.map((rule) => (
        <div key={rule.id} className="flex items-center gap-2">
          <Input
            value={rule.field}
            onChange={(e) => handleUpdateField(rule.id, { field: e.target.value })}
            placeholder={t("pipeline.field")}
            className="h-7 flex-1 text-xs font-mono"
          />
          <select
            value={rule.direction}
            onChange={(e) =>
              handleUpdateField(rule.id, {
                direction: Number(e.target.value) as 1 | -1,
              })
            }
            className="h-7 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 text-zinc-800 dark:text-zinc-200"
          >
            <option value={1}>{t("pipeline.sort_asc")}</option>
            <option value={-1}>{t("pipeline.sort_desc")}</option>
          </select>
          <button
            type="button"
            onClick={() => handleDeleteField(rule.id)}
            className="p-1 text-zinc-400 hover:text-rose-500 cursor-pointer"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAddField}
        className="h-6 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-2"
      >
        <Plus className="size-3 mr-1" />
        <span>{t("pipeline.add_sort_field")}</span>
      </Button>
    </div>
  );
};

// 4. $limit Editor
const LimitStageEditor: FC<{
  config: LimitStageConfig;
  onChange: (conf: LimitStageConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-mono text-zinc-500">
        {t("pipeline.limit_count")}:
      </span>
      <Input
        type="number"
        min={1}
        max={10000}
        value={config.limit}
        onChange={(e) => onChange({ limit: Number(e.target.value) || 1 })}
        className="h-7 w-32 text-xs font-mono"
      />
    </div>
  );
};

// 5. $project Editor
const ProjectStageEditor: FC<{
  config: ProjectStageConfig;
  onChange: (conf: ProjectStageConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  if (config.mode === "raw") {
    return (
      <textarea
        value={config.rawJson}
        onChange={(e) => onChange({ ...config, rawJson: e.target.value })}
        rows={4}
        className="w-full p-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded text-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
        placeholder='{ "_id": 0, "name": 1 }'
      />
    );
  }

  const handleAddField = () => {
    onChange({
      ...config,
      fields: [
        ...config.fields,
        {
          id: Math.random().toString(36).substring(2, 9),
          field: "",
          mode: "include",
        },
      ],
    });
  };

  const handleUpdateField = (
    fieldId: string,
    updates: Partial<ProjectFieldRule>,
  ) => {
    onChange({
      ...config,
      fields: config.fields.map((f) =>
        f.id === fieldId ? { ...f, ...updates } : f,
      ),
    });
  };

  const handleDeleteField = (fieldId: string) => {
    onChange({
      ...config,
      fields: config.fields.filter((f) => f.id !== fieldId),
    });
  };

  return (
    <div className="space-y-2">
      {config.fields.map((rule) => (
        <div key={rule.id} className="flex items-center gap-2">
          <Input
            value={rule.field}
            onChange={(e) => handleUpdateField(rule.id, { field: e.target.value })}
            placeholder={t("pipeline.field")}
            className="h-7 flex-1 text-xs font-mono"
          />
          <select
            value={rule.mode}
            onChange={(e) =>
              handleUpdateField(rule.id, {
                mode: e.target.value as ProjectFieldRule["mode"],
              })
            }
            className="h-7 text-xs font-mono bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded px-2 text-zinc-800 dark:text-zinc-200"
          >
            <option value="include">{t("pipeline.mode_include")}</option>
            <option value="exclude">{t("pipeline.mode_exclude")}</option>
            <option value="expr">{t("pipeline.mode_expression")}</option>
          </select>
          {rule.mode === "expr" && (
            <Input
              value={rule.expression || ""}
              onChange={(e) =>
                handleUpdateField(rule.id, { expression: e.target.value })
              }
              placeholder='e.g. "$totalPrice"'
              className="h-7 flex-1 text-xs font-mono"
            />
          )}
          <button
            type="button"
            onClick={() => handleDeleteField(rule.id)}
            className="p-1 text-zinc-400 hover:text-rose-500 cursor-pointer"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleAddField}
        className="h-6 text-[11px] font-mono text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 px-2"
      >
        <Plus className="size-3 mr-1" />
        <span>{t("pipeline.add_project_field")}</span>
      </Button>
    </div>
  );
};

// 6. $lookup Editor
const LookupStageEditor: FC<{
  config: LookupStageConfig;
  tables: TableSchema[];
  onChange: (conf: LookupStageConfig) => void;
}> = ({ config, tables, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <div>
        <span className="text-[11px] font-mono text-zinc-400 block mb-1">
          {t("pipeline.lookup_from")}:
        </span>
        <input
          list="lookup-tables-list"
          value={config.from}
          onChange={(e) => onChange({ ...config, from: e.target.value })}
          placeholder="Foreign collection..."
          className="h-7 w-full px-2 text-xs font-mono bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-zinc-900 dark:text-zinc-100"
        />
        <datalist id="lookup-tables-list">
          {tables.map((t) => (
            <option key={t.name} value={t.name} />
          ))}
        </datalist>
      </div>

      <div>
        <span className="text-[11px] font-mono text-zinc-400 block mb-1">
          {t("pipeline.lookup_local")}:
        </span>
        <Input
          value={config.localField}
          onChange={(e) => onChange({ ...config, localField: e.target.value })}
          placeholder="_id"
          className="h-7 text-xs font-mono"
        />
      </div>

      <div>
        <span className="text-[11px] font-mono text-zinc-400 block mb-1">
          {t("pipeline.lookup_foreign")}:
        </span>
        <Input
          value={config.foreignField}
          onChange={(e) => onChange({ ...config, foreignField: e.target.value })}
          placeholder="userId"
          className="h-7 text-xs font-mono"
        />
      </div>

      <div>
        <span className="text-[11px] font-mono text-zinc-400 block mb-1">
          {t("pipeline.lookup_as")}:
        </span>
        <Input
          value={config.as}
          onChange={(e) => onChange({ ...config, as: e.target.value })}
          placeholder="joinedData"
          className="h-7 text-xs font-mono"
        />
      </div>
    </div>
  );
};

// 7. $unwind Editor
const UnwindStageEditor: FC<{
  config: UnwindStageConfig;
  onChange: (conf: UnwindStageConfig) => void;
}> = ({ config, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-mono text-zinc-500 w-32 shrink-0">
          {t("pipeline.unwind_path")}:
        </span>
        <Input
          value={config.path}
          onChange={(e) => onChange({ ...config, path: e.target.value })}
          placeholder="$tags"
          className="h-7 flex-1 text-xs font-mono"
        />
      </div>

      <label className="flex items-center gap-2 text-xs font-mono text-zinc-600 dark:text-zinc-400 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={config.preserveNullAndEmptyArrays}
          onChange={(e) =>
            onChange({
              ...config,
              preserveNullAndEmptyArrays: e.target.checked,
            })
          }
          className="rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500"
        />
        <span>{t("pipeline.unwind_preserve")}</span>
      </label>
    </div>
  );
};
