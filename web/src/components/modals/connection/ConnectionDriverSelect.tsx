import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatabaseEngineIcon } from "@/components/icons";
import { DATABASE_ENGINES, ENGINE_CATEGORIES } from "@/constants";
import type { DatabaseType } from "@/lib/types";
import { driverSelectTriggerVariants } from "./connection-utils";

interface ConnectionDriverSelectProps {
  dbType: DatabaseType;
  onDbTypeChange: (type: DatabaseType) => void;
  disabled?: boolean;
}

export function ConnectionDriverSelect({
  dbType,
  onDbTypeChange,
  disabled = false,
}: ConnectionDriverSelectProps) {
  const { t } = useTranslation();

  const currentEngine =
    DATABASE_ENGINES.find((e) => e.type === dbType) || DATABASE_ENGINES[0];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t("connection.driver")}
        </label>
        <span className="text-muted-foreground font-mono text-[11px]">
          {t("connection.selectDriverHelp")}
        </span>
      </div>

      <Select
        value={dbType}
        onValueChange={(val) => {
          if (val && typeof val === "string") {
            onDbTypeChange(val as DatabaseType);
          }
        }}
      >
        <SelectTrigger
          disabled={disabled}
          className={driverSelectTriggerVariants({ disabled })}
        >
          <SelectValue className="flex w-full min-w-0 flex-1 items-center overflow-visible">
            {() => (
              <div className="mr-2 flex w-full items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="border-border/80 bg-muted flex size-8.5 shrink-0 items-center justify-center rounded-lg border p-1 shadow-2xs">
                    <DatabaseEngineIcon
                      type={currentEngine.type}
                      className="size-5"
                    />
                  </div>
                  <div className="flex flex-col text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm font-semibold">
                        {currentEngine.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="border-border/90 bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                      >
                        {currentEngine.tag}
                      </Badge>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {currentEngine.category}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-muted-foreground font-mono text-xs font-medium">
                    :{currentEngine.defaultPort}
                  </span>
                </div>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>

        <SelectContent
          side="bottom"
          align="start"
          className="border-border bg-background dark:bg-card z-50 max-h-80 w-(--anchor-width) min-w-90 rounded-xl border p-1.5 shadow-xl"
        >
          {ENGINE_CATEGORIES.filter((c) => c.key !== "all").map((cat, idx) => {
            const engines = DATABASE_ENGINES.filter(
              (e) => e.categoryKey === cat.key,
            );
            if (engines.length === 0) return null;
            return (
              <SelectGroup key={cat.key}>
                {idx > 0 && (
                  <SelectSeparator className="border-border dark:border-border/60 my-1" />
                )}
                <SelectLabel className="text-muted-foreground px-2.5 pt-2 pb-1 font-mono text-[10px] font-semibold tracking-wider uppercase">
                  {t(cat.labelKey, cat.fallbackLabel)}
                </SelectLabel>
                {engines.map((engine) => (
                  <SelectItem
                    key={engine.type}
                    value={engine.type}
                    className="data-highlighted:bg-muted/90 dark:data-highlighted:bg-muted/80 cursor-pointer rounded-lg py-2 pr-8 pl-2.5 font-sans transition-colors **:data-[slot=select-item-text]:block **:data-[slot=select-item-text]:w-full"
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="border-border/80 bg-muted flex size-8 shrink-0 items-center justify-center rounded-lg border p-1 shadow-2xs">
                          <DatabaseEngineIcon
                            type={engine.type}
                            className="size-4.5"
                          />
                        </div>
                        <div className="flex flex-col truncate text-left">
                          <span className="text-foreground text-xs font-semibold">
                            {engine.name}
                          </span>
                          <span className="text-muted-foreground truncate text-[11px]">
                            {engine.category}
                          </span>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge
                          variant="outline"
                          className="border-border/90 bg-muted text-muted-foreground dark:border-border dark:bg-muted dark:text-muted-foreground h-4 px-1.5 py-0 font-mono text-[10px] font-semibold uppercase"
                        >
                          {engine.tag}
                        </Badge>
                        <span className="text-muted-foreground font-mono text-xs font-medium">
                          :{engine.defaultPort}
                        </span>
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}
