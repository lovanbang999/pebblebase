import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MatchFilterRule, MatchStageEditorProps } from "./types";

export function MatchStageEditor({ config, onChange }: MatchStageEditorProps) {
  const { t } = useTranslation();

  if (config.mode === "raw") {
    return (
      <textarea
        value={config.rawJson}
        onChange={(e) => onChange({ ...config, rawJson: e.target.value })}
        rows={4}
        className="focus:ring-primary border-border bg-muted text-foreground dark:bg-background w-full rounded border p-2 font-mono text-xs focus:ring-1 focus:outline-hidden"
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
            onChange={(e) =>
              handleUpdateRule(rule.id, { field: e.target.value })
            }
            placeholder={t("pipeline.field")}
            className="h-7 w-1/3 font-mono text-xs"
          />
          <select
            value={rule.operator}
            onChange={(e) =>
              handleUpdateRule(rule.id, {
                operator: e.target.value as MatchFilterRule["operator"],
              })
            }
            className="border-border bg-background text-foreground dark:bg-card h-7 rounded border px-2 font-mono text-xs"
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
            onChange={(e) =>
              handleUpdateRule(rule.id, { value: e.target.value })
            }
            placeholder={t("pipeline.value")}
            className="h-7 flex-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={() => handleDeleteRule(rule.id)}
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
        onClick={handleAddRule}
        className="text-success hover:bg-success/10 dark:hover:bg-success/20 h-6 px-2 font-mono text-[11px]"
      >
        <Plus className="mr-1 size-3" />
        <span>{t("pipeline.add_rule")}</span>
      </Button>
    </div>
  );
}
