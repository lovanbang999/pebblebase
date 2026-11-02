import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import type { LookupStageEditorProps } from "./types";

export function LookupStageEditor({
  config,
  tables,
  onChange,
}: LookupStageEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <div>
        <span className="text-muted-foreground mb-1 block font-mono text-[11px]">
          {t("pipeline.lookup_from")}:
        </span>
        <input
          list="lookup-tables-list"
          value={config.from}
          onChange={(e) => onChange({ ...config, from: e.target.value })}
          placeholder="Foreign collection..."
          className="border-border bg-muted text-foreground dark:border-border dark:bg-muted dark:text-foreground h-7 w-full rounded border px-2 font-mono text-xs"
        />
        <datalist id="lookup-tables-list">
          {tables.map((table) => (
            <option key={table.name} value={table.name} />
          ))}
        </datalist>
      </div>

      <div>
        <span className="text-muted-foreground mb-1 block font-mono text-[11px]">
          {t("pipeline.lookup_local")}:
        </span>
        <Input
          value={config.localField}
          onChange={(e) => onChange({ ...config, localField: e.target.value })}
          placeholder="_id"
          className="h-7 font-mono text-xs"
        />
      </div>

      <div>
        <span className="text-muted-foreground mb-1 block font-mono text-[11px]">
          {t("pipeline.lookup_foreign")}:
        </span>
        <Input
          value={config.foreignField}
          onChange={(e) =>
            onChange({ ...config, foreignField: e.target.value })
          }
          placeholder="userId"
          className="h-7 font-mono text-xs"
        />
      </div>

      <div>
        <span className="text-muted-foreground mb-1 block font-mono text-[11px]">
          {t("pipeline.lookup_as")}:
        </span>
        <Input
          value={config.as}
          onChange={(e) => onChange({ ...config, as: e.target.value })}
          placeholder="joinedData"
          className="h-7 font-mono text-xs"
        />
      </div>
    </div>
  );
}
