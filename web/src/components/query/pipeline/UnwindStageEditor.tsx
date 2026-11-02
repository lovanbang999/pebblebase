import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import type { UnwindStageEditorProps } from "./types";

export function UnwindStageEditor({
  config,
  onChange,
}: UnwindStageEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground w-32 shrink-0 font-mono text-xs">
          {t("pipeline.unwind_path")}:
        </span>
        <Input
          value={config.path}
          onChange={(e) => onChange({ ...config, path: e.target.value })}
          placeholder="$tags"
          className="h-7 flex-1 font-mono text-xs"
        />
      </div>

      <label className="text-muted-foreground dark:text-muted-foreground flex cursor-pointer items-center gap-2 font-mono text-xs select-none">
        <input
          type="checkbox"
          checked={config.preserveNullAndEmptyArrays}
          onChange={(e) =>
            onChange({
              ...config,
              preserveNullAndEmptyArrays: e.target.checked,
            })
          }
          className="focus:ring-primary border-border text-success dark:border-border rounded"
        />
        <span>{t("pipeline.unwind_preserve")}</span>
      </label>
    </div>
  );
}
