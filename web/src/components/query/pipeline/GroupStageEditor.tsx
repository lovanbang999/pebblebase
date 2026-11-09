import { useTranslation } from "react-i18next";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GroupAccumulator, GroupStageEditorProps } from "./types";

export function GroupStageEditor({ config, onChange }: GroupStageEditorProps) {
  const { t } = useTranslation();

  if (config.mode === "raw") {
    return (
      <textarea
        value={config.rawJson}
        onChange={(e) => onChange({ ...config, rawJson: e.target.value })}
        rows={5}
        className="focus:ring-primary border-border bg-muted text-foreground dark:bg-background w-full rounded border p-2 font-mono text-xs focus:ring-1 focus:outline-hidden"
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
        <span className="text-muted-foreground w-28 shrink-0 font-mono text-xs">
          {t("pipeline.group_by")}:
        </span>
        <Input
          value={config.groupByField}
          onChange={(e) =>
            onChange({ ...config, groupByField: e.target.value })
          }
          placeholder="$country or null"
          className="h-7 flex-1 font-mono text-xs"
        />
      </div>

      {/* Accumulators */}
      <div className="border-border dark:border-border/80 space-y-2 border-t pt-1">
        <span className="text-muted-foreground block font-mono text-[11px]">
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
              className="h-7 w-1/3 font-mono text-xs"
            />
            <select
              value={acc.operator}
              onChange={(e) =>
                handleUpdateAccumulator(acc.id, {
                  operator: e.target.value as GroupAccumulator["operator"],
                })
              }
              className="border-border bg-background text-foreground dark:bg-card h-7 rounded border px-2 font-mono text-xs"
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
              placeholder="Expression (1 or $field)"
              className="h-7 flex-1 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => handleDeleteAccumulator(acc.id)}
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
          onClick={handleAddAccumulator}
          className="text-success hover:bg-success/10 dark:text-success dark:hover:bg-success/20 h-6 px-2 font-mono text-[11px]"
        >
          <Plus className="mr-1 size-3" />
          <span>{t("pipeline.add_accumulator")}</span>
        </Button>
      </div>
    </div>
  );
}
