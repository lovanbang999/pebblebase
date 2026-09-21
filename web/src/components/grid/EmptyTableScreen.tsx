import type { FC } from "react";
import { Layers } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

interface EmptyTableScreenProps {
  connectionName?: string;
  hasTables: boolean;
  onReintrospect: () => void;
}

export const EmptyTableScreen: FC<EmptyTableScreenProps> = ({
  connectionName,
  hasTables,
  onReintrospect,
}) => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-zinc-50/50 dark:bg-zinc-950">
      <div className="flex h-11 items-center gap-2.5 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900/30">
        <SidebarTrigger className="-ml-1 cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" />
        <Separator
          orientation="vertical"
          className="h-4 self-center bg-zinc-200 dark:bg-zinc-800"
        />
        <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {connectionName}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <Layers className="mb-4 h-12 w-12 text-zinc-300 dark:text-zinc-800" />
        <h3 className="mb-1 font-mono text-base font-semibold text-zinc-800 dark:text-zinc-200">
          {connectionName}
        </h3>
        <p className="mb-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {hasTables ? t("app.selectTablePrompt") : t("app.noTablesFound")}
        </p>
        {!hasTables && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReintrospect}
            className="text-xs"
          >
            {t("app.reintrospect")}
          </Button>
        )}
      </div>
    </div>
  );
};
