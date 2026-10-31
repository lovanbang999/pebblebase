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
    <div className="bg-card/50 dark:bg-background flex h-full flex-1 flex-col overflow-hidden">
      <div className="border-border bg-background dark:border-border dark:bg-card/30 flex h-11 items-center gap-2.5 border-b px-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground dark:hover:text-foreground -ml-1 cursor-pointer" />
        <Separator
          orientation="vertical"
          className="bg-muted dark:bg-muted h-4 self-center"
        />
        <span className="text-muted-foreground font-mono text-xs font-medium">
          {connectionName}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <Layers className="text-muted-foreground dark:text-foreground mb-4 h-12 w-12" />
        <h3 className="text-foreground mb-1 font-mono text-base font-semibold">
          {connectionName}
        </h3>
        <p className="text-muted-foreground mb-4 font-mono text-xs">
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
