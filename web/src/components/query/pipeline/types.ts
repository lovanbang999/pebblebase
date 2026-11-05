import type { Connection, TableSchema, RawQueryResult } from "@/lib/types";

export type StageType =
  | "$match"
  | "$group"
  | "$sort"
  | "$limit"
  | "$project"
  | "$lookup"
  | "$unwind"
  | "$facet";

export interface MatchFilterRule {
  id: string;
  field: string;
  operator:
    | "$eq"
    | "$ne"
    | "$gt"
    | "$gte"
    | "$lt"
    | "$lte"
    | "$in"
    | "$regex"
    | "$exists";
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
  operator:
    "$sum" | "$avg" | "$min" | "$max" | "$count" | "$first" | "$last" | "$push";
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

export interface FacetStageConfig {
  mode: "visual" | "raw";
  rawJson: string;
}

export type StageConfig =
  | { type: "$match"; config: MatchStageConfig }
  | { type: "$group"; config: GroupStageConfig }
  | { type: "$sort"; config: SortStageConfig }
  | { type: "$limit"; config: LimitStageConfig }
  | { type: "$project"; config: ProjectStageConfig }
  | { type: "$lookup"; config: LookupStageConfig }
  | { type: "$unwind"; config: UnwindStageConfig }
  | { type: "$facet"; config: FacetStageConfig };

export interface PipelineStageItem {
  id: string;
  enabled: boolean;
  stage: StageConfig;
}

export interface PipelineBuilderProps {
  connection: Connection;
  tables: TableSchema[];
  onOpenInConsole?: (query: string) => void;
}

export interface MatchStageEditorProps {
  config: MatchStageConfig;
  onChange: (conf: MatchStageConfig) => void;
}

export interface GroupStageEditorProps {
  config: GroupStageConfig;
  onChange: (conf: GroupStageConfig) => void;
}

export interface SortStageEditorProps {
  config: SortStageConfig;
  onChange: (conf: SortStageConfig) => void;
}

export interface LimitStageEditorProps {
  config: LimitStageConfig;
  onChange: (conf: LimitStageConfig) => void;
}

export interface ProjectStageEditorProps {
  config: ProjectStageConfig;
  onChange: (conf: ProjectStageConfig) => void;
}

export interface LookupStageEditorProps {
  config: LookupStageConfig;
  tables: TableSchema[];
  onChange: (conf: LookupStageConfig) => void;
}

export interface UnwindStageEditorProps {
  config: UnwindStageConfig;
  onChange: (conf: UnwindStageConfig) => void;
}

export interface FacetStageEditorProps {
  config: FacetStageConfig;
  onChange: (conf: FacetStageConfig) => void;
}

export interface PipelineStageCardProps {
  stageItem: PipelineStageItem;
  index: number;
  totalStages: number;
  draggedIndex: number | null;
  tables: TableSchema[];
  connId?: string;
  collection?: string;
  activeStagesUpToThis?: Record<string, unknown>[];
  onDragStart: (e: React.DragEvent<HTMLDivElement>, index: number) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, targetIndex: number) => void;
  onToggle: (index: number) => void;
  onMove: (index: number, direction: "up" | "down") => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
  onUpdateStage: (index: number, newStage: StageConfig) => void;
}

export interface PipelineResultsPanelProps {
  results: RawQueryResult | null;
  isRunning: boolean;
  error: string | null;
  collection: string;
}

export interface PipelinePreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  command: string;
  onOpenInConsole?: (query: string) => void;
}
