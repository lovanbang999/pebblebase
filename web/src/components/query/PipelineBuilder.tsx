import { useState, useMemo, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Play,
  Loader2,
  Plus,
  Trash2,
  Eye,
  Layers,
  ChevronDown,
  Sparkles,
  Filter,
  Group,
  ArrowUpDown,
  Hash,
  EyeIcon,
  GitMerge,
} from "lucide-react";
import type { RawQueryResult } from "@/lib/types";
import { executeRawQuery } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  StageType,
  StageConfig,
  PipelineStageItem,
  PipelineBuilderProps,
} from "./pipeline/types";
import { createDefaultStage, generateStageObject } from "./pipeline/utils";
import { PipelineStageCard } from "./pipeline/PipelineStageCard";
import { PipelineResultsPanel } from "./pipeline/PipelineResultsPanel";
import { PipelinePreviewDialog } from "./pipeline/PipelinePreviewDialog";

export function PipelineBuilder({
  connection,
  tables,
  onOpenInConsole,
}: PipelineBuilderProps) {
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

  // Compute active stages up to a specific index for intermediate preview
  const getStagesUpTo = (idx: number) => {
    const result: Record<string, unknown>[] = [];
    for (let i = 0; i <= idx; i++) {
      const item = stages[i];
      if (item && item.enabled) {
        const obj = generateStageObject(item.stage);
        if (obj) result.push(obj);
      }
    }
    return result;
  };

  // Stage Operations
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

  const handleUpdateStage = (index: number, newStage: StageConfig) => {
    setStages((prev) =>
      prev.map((s, i) => (i === index ? { ...s, stage: newStage } : s)),
    );
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
            rules: [
              { id: "r1", field: "status", operator: "$eq", value: "active" },
            ],
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
              {
                id: "a1",
                outputField: "count",
                operator: "$sum",
                expression: "1",
              },
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

  // Drag and Drop
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

  // Execution
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

  return (
    <div className="bg-card dark:bg-background flex h-full flex-1 flex-col overflow-hidden font-sans">
      {/* Top Action Bar */}
      <div className="border-border bg-background dark:border-border dark:bg-card/50 flex h-12 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="flex min-w-0 items-center gap-3">
          {/* Collection Selector */}
          <div className="flex items-center gap-1.5 font-mono text-xs">
            <span className="text-muted-foreground font-medium">
              {t("pipeline.collection")}:
            </span>
            <div className="relative">
              <input
                list="mongo-collections-list"
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                placeholder={t("pipeline.select_collection")}
                className="focus:ring-primary border-border bg-muted text-foreground dark:border-border dark:bg-muted dark:text-foreground h-7 w-44 rounded-md border px-2 font-mono text-xs focus:ring-1 focus:outline-hidden"
              />
              <datalist id="mongo-collections-list">
                {tables.map((tbl) => (
                  <option key={tbl.name} value={tbl.name} />
                ))}
              </datalist>
            </div>
          </div>

          <span className="text-muted-foreground dark:text-foreground">|</span>

          {/* Add Stage Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-primary/40 hover:bg-primary/10 text-success dark:text-success h-7 cursor-pointer gap-1.5 text-xs font-semibold"
                >
                  <Plus className="size-3.5" />
                  <span>{t("pipeline.stage.add")}</span>
                  <ChevronDown className="ml-0.5 size-3 opacity-60" />
                </Button>
              }
            />
            <DropdownMenuContent
              align="start"
              className="w-56 font-mono text-xs"
            >
              <DropdownMenuItem
                onClick={() => handleAddStage("$match")}
                className="cursor-pointer gap-2"
              >
                <Filter className="text-warning size-3.5" />
                <span>{t("pipeline.stage.match")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$group")}
                className="cursor-pointer gap-2"
              >
                <Group className="text-success size-3.5" />
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
                <Hash className="text-primary size-3.5" />
                <span>{t("pipeline.stage.limit")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$project")}
                className="cursor-pointer gap-2"
              >
                <EyeIcon className="text-primary size-3.5" />
                <span>{t("pipeline.stage.project")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$lookup")}
                className="cursor-pointer gap-2"
              >
                <GitMerge className="text-destructive size-3.5" />
                <span>{t("pipeline.stage.lookup")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$unwind")}
                className="cursor-pointer gap-2"
              >
                <Layers className="size-3.5 text-orange-500" />
                <span>{t("pipeline.stage.unwind")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleAddStage("$facet")}
                className="cursor-pointer gap-2"
              >
                <Sparkles className="size-3.5 text-pink-500" />
                <span>{t("pipeline.stage.facet")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Sample Checkpoint Preset */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleLoadCheckpointSample}
            className="text-muted-foreground hover:text-foreground dark:hover:text-foreground h-7 gap-1.5 font-mono text-xs"
            title={t("pipeline.load_sample")}
          >
            <Sparkles className="text-warning size-3.5" />
            <span className="hidden sm:inline">
              {t("pipeline.load_sample")}
            </span>
          </Button>
        </div>

        {/* Right Action Controls */}
        <div className="flex items-center gap-2">
          {stages.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="text-muted-foreground hover:text-destructive h-7 font-mono text-xs"
            >
              <Trash2 className="mr-1 size-3" />
              <span>{t("pipeline.clear")}</span>
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            className="border-border text-foreground dark:border-border dark:text-foreground h-7 cursor-pointer gap-1.5 font-mono text-xs"
          >
            <Eye className="text-primary size-3.5" />
            <span>{t("pipeline.preview_json")}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleRunPipeline}
            disabled={isRunning || stages.length === 0}
            className="bg-primary hover:bg-primary/90 h-7 cursor-pointer gap-1.5 text-xs font-semibold text-white shadow-2xs"
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

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Left / Top: Stage Cards List */}
        <div className="border-border dark:border-border flex flex-1 flex-col space-y-3 overflow-y-auto border-r p-4">
          {stages.length === 0 ? (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center p-8 text-center">
              <Layers className="text-success mb-3 size-10 opacity-30" />
              <p className="text-muted-foreground dark:text-foreground max-w-md text-sm font-medium">
                {t("pipeline.empty_stages")}
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => handleAddStage("$match")}
                className="bg-primary hover:bg-primary/90 mt-4 h-8 gap-1.5 text-xs font-medium text-white"
              >
                <Plus className="size-3.5" />
                <span>{t("pipeline.stage.add")}</span>
              </Button>
            </div>
          ) : (
            stages.map((stageItem, index) => (
              <PipelineStageCard
                key={stageItem.id}
                stageItem={stageItem}
                index={index}
                totalStages={stages.length}
                draggedIndex={draggedIndex}
                tables={tables}
                connId={connection.id}
                collection={collection}
                activeStagesUpToThis={getStagesUpTo(index)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onToggle={handleToggleStage}
                onMove={handleMoveStage}
                onDuplicate={handleDuplicateStage}
                onDelete={handleDeleteStage}
                onUpdateStage={handleUpdateStage}
              />
            ))
          )}
        </div>

        {/* Right / Bottom: Live Results Panel */}
        <PipelineResultsPanel
          results={results}
          isRunning={isRunning}
          error={error}
          collection={collection}
        />
      </div>

      {/* Preview JSON Dialog */}
      <PipelinePreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        command={generatedShellCommand}
        onOpenInConsole={onOpenInConsole}
      />
    </div>
  );
}

export default PipelineBuilder;
