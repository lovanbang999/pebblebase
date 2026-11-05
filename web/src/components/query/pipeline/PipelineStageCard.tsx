import { useTranslation } from "react-i18next";
import {
  GripVertical,
  Code2,
  Check,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import type { PipelineStageCardProps, StageConfig } from "./types";
import { generateStageObject, getStageBadgeStyle } from "./utils";
import { MatchStageEditor } from "./MatchStageEditor";
import { GroupStageEditor } from "./GroupStageEditor";
import { SortStageEditor } from "./SortStageEditor";
import { LimitStageEditor } from "./LimitStageEditor";
import { ProjectStageEditor } from "./ProjectStageEditor";
import { LookupStageEditor } from "./LookupStageEditor";
import { UnwindStageEditor } from "./UnwindStageEditor";
import { FacetStageEditor } from "./FacetStageEditor";
import { StageLivePreview } from "./StageLivePreview";

export function PipelineStageCard({
  stageItem,
  index,
  totalStages,
  draggedIndex,
  tables,
  connId,
  collection,
  activeStagesUpToThis,
  onDragStart,
  onDragOver,
  onDrop,
  onToggle,
  onMove,
  onDuplicate,
  onDelete,
  onUpdateStage,
}: PipelineStageCardProps) {
  const { t } = useTranslation();
  const isFirst = index === 0;
  const isLast = index === totalStages - 1;

  const handleToggleMode = () => {
    const currentStage = stageItem.stage;
    if (!("mode" in currentStage.config)) return;

    const newMode = currentStage.config.mode === "visual" ? "raw" : "visual";
    let rawContent = currentStage.config.rawJson;

    if (newMode === "raw") {
      const generated = generateStageObject(currentStage);
      if (generated) {
        const inner = (generated as Record<string, unknown>)[currentStage.type];
        rawContent = JSON.stringify(inner, null, 2);
      }
    }

    onUpdateStage(index, {
      ...currentStage,
      config: {
        ...currentStage.config,
        mode: newMode,
        rawJson: rawContent,
      },
    } as StageConfig);
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, index)}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, index)}
      className={cn(
        "group bg-background dark:bg-card relative rounded-lg border shadow-2xs transition-all",
        stageItem.enabled
          ? "border-border"
          : "border-border/50 bg-card dark:border-border/50 dark:bg-card/40 opacity-60",
        draggedIndex === index && "ring-primary opacity-40 ring-2",
      )}
    >
      {/* Card Header */}
      <div className="border-border bg-card/50 dark:border-border/80 dark:bg-card/50 flex items-center justify-between rounded-t-lg border-b px-3 py-2">
        <div className="flex items-center gap-2">
          {/* Drag Handle */}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground dark:hover:text-foreground cursor-grab rounded p-0.5 active:cursor-grabbing"
            title={t("pipeline.stage.drag_handle")}
          >
            <GripVertical className="size-4" />
          </button>

          {/* Stage Index & Badge */}
          <span className="text-muted-foreground font-mono text-[11px] font-semibold">
            #{index + 1}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "px-2 py-0.5 font-mono text-xs font-semibold uppercase",
              getStageBadgeStyle(stageItem.stage.type),
            )}
          >
            {stageItem.stage.type}
          </Badge>

          {/* Active Status Badge */}
          {!stageItem.enabled && (
            <span className="bg-muted/60 text-muted-foreground dark:bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
              {t("pipeline.stage.disabled")}
            </span>
          )}
        </div>

        {/* Card Actions */}
        <div className="flex items-center gap-1">
          {/* Visual / Raw JSON Toggle */}
          {"mode" in stageItem.stage.config && (
            <button
              type="button"
              onClick={handleToggleMode}
              className="border-border text-muted-foreground hover:text-foreground dark:border-border dark:hover:text-foreground flex h-6 cursor-pointer items-center gap-1 rounded border px-1.5 font-mono text-[10px]"
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
            onClick={() => onToggle(index)}
            className={cn(
              "cursor-pointer rounded p-1 transition-colors",
              stageItem.enabled
                ? "text-success hover:bg-success/10 dark:text-success dark:hover:bg-success/30"
                : "text-muted-foreground hover:text-foreground dark:hover:text-foreground",
            )}
            title={t("pipeline.stage.toggle_enable")}
          >
            <Check className="size-3.5" />
          </button>

          {/* Move Up */}
          <button
            type="button"
            disabled={isFirst}
            onClick={() => onMove(index, "up")}
            className="text-muted-foreground hover:text-foreground dark:hover:text-foreground cursor-pointer p-1 disabled:opacity-20"
            title={t("pipeline.stage.move_up")}
          >
            <ArrowUp className="size-3.5" />
          </button>

          {/* Move Down */}
          <button
            type="button"
            disabled={isLast}
            onClick={() => onMove(index, "down")}
            className="text-muted-foreground hover:text-foreground dark:hover:text-foreground cursor-pointer p-1 disabled:opacity-20"
            title={t("pipeline.stage.move_down")}
          >
            <ArrowDown className="size-3.5" />
          </button>

          {/* Duplicate */}
          <button
            type="button"
            onClick={() => onDuplicate(index)}
            className="text-muted-foreground hover:text-foreground dark:hover:text-foreground cursor-pointer p-1"
            title={t("pipeline.stage.duplicate")}
          >
            <Copy className="size-3.5" />
          </button>

          {/* Delete */}
          <button
            type="button"
            onClick={() => onDelete(index)}
            className="text-muted-foreground hover:text-destructive cursor-pointer p-1"
            title={t("pipeline.stage.delete")}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Card Body / Form UI */}
      <div className="p-3">
        {stageItem.stage.type === "$match" && (
          <MatchStageEditor
            config={stageItem.stage.config}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$match", config: newConf })
            }
          />
        )}

        {stageItem.stage.type === "$group" && (
          <GroupStageEditor
            config={stageItem.stage.config}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$group", config: newConf })
            }
          />
        )}

        {stageItem.stage.type === "$sort" && (
          <SortStageEditor
            config={stageItem.stage.config}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$sort", config: newConf })
            }
          />
        )}

        {stageItem.stage.type === "$limit" && (
          <LimitStageEditor
            config={stageItem.stage.config}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$limit", config: newConf })
            }
          />
        )}

        {stageItem.stage.type === "$project" && (
          <ProjectStageEditor
            config={stageItem.stage.config}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$project", config: newConf })
            }
          />
        )}

        {stageItem.stage.type === "$lookup" && (
          <LookupStageEditor
            config={stageItem.stage.config}
            tables={tables}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$lookup", config: newConf })
            }
          />
        )}

        {stageItem.stage.type === "$unwind" && (
          <UnwindStageEditor
            config={stageItem.stage.config}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$unwind", config: newConf })
            }
          />
        )}

        {stageItem.stage.type === "$facet" && (
          <FacetStageEditor
            config={stageItem.stage.config}
            onChange={(newConf) =>
              onUpdateStage(index, { type: "$facet", config: newConf })
            }
          />
        )}
      </div>

      {/* Accordion Live Preview Drawer */}
      <StageLivePreview
        connId={connId}
        collection={collection}
        activeStagesUpToThis={activeStagesUpToThis}
        isStageEnabled={stageItem.enabled}
      />
    </div>
  );
}
