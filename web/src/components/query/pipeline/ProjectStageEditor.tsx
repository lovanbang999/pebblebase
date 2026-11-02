import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectFieldRule, ProjectStageEditorProps } from "./types";

export function ProjectStageEditor({
  config,
  onChange,
}: ProjectStageEditorProps) {
  const { t } = useTranslation();

  if (config.mode === "raw") {
    return (
      <textarea
        value={config.rawJson}
        onChange={(e) => onChange({ ...config, rawJson: e.target.value })}
        rows={4}
        className="focus:ring-primary border-border bg-muted text-foreground dark:border-border dark:bg-background dark:text-foreground w-full rounded border p-2 font-mono text-xs focus:ring-1 focus:outline-hidden"
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
            onChange={(e) =>
              handleUpdateField(rule.id, { field: e.target.value })
            }
            placeholder={t("pipeline.field")}
            className="h-7 flex-1 font-mono text-xs"
          />
          <select
            value={rule.mode}
            onChange={(e) =>
              handleUpdateField(rule.id, {
                mode: e.target.value as ProjectFieldRule["mode"],
              })
            }
            className="border-border bg-background text-foreground dark:border-border dark:bg-card dark:text-foreground h-7 rounded border px-2 font-mono text-xs"
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
              className="h-7 flex-1 font-mono text-xs"
            />
          )}
          <button
            type="button"
            onClick={() => handleDeleteField(rule.id)}
            className="text-muted-foreground hover:text-destructive cursor-pointer p-1"
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
        className="text-success hover:bg-success/10 dark:text-success dark:hover:bg-success/20 h-6 px-2 font-mono text-[11px]"
      >
        <Plus className="mr-1 size-3" />
        <span>{t("pipeline.add_project_field")}</span>
      </Button>
    </div>
  );
}
