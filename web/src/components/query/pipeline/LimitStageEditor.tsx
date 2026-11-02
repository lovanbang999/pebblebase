import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import type { LimitStageEditorProps } from "./types";

export function LimitStageEditor({ config, onChange }: LimitStageEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground font-mono text-xs">
        {t("pipeline.limit_count")}:
      </span>
      <Input
        type="number"
        min={1}
        max={10000}
        value={config.limit}
        onChange={(e) => onChange({ limit: Number(e.target.value) || 1 })}
        className="h-7 w-32 font-mono text-xs"
      />
    </div>
  );
}
