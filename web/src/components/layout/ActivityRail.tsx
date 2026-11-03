import {
  Database,
  Folder,
  History,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WORKSPACE_COMMANDS } from "./workspaceCommands";
import { isMac } from "@/lib/platform";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ActivityRailProps {
  activeToolWindow: "database" | "scripts" | null;
  outputOpen: boolean;
  onToggleDatabase: () => void;
  onToggleScripts: () => void;
  onToggleOutput: () => void;
  onOpenHistory?: () => void;
}

export function ActivityRail({
  activeToolWindow,
  outputOpen,
  onToggleDatabase,
  onToggleScripts,
  onToggleOutput,
  onOpenHistory,
}: ActivityRailProps) {
  const { t } = useTranslation();

  const topActions = [
    {
      id: "toggle_database" as const,
      icon: Database,
      onClick: onToggleDatabase,
      pressed: activeToolWindow === "database",
      buttonId: undefined,
    },
    {
      id: "toggle_scripts" as const,
      icon: Folder,
      onClick: onToggleScripts,
      pressed: activeToolWindow === "scripts",
      buttonId: undefined,
    },
  ];

  const bottomActions = [
    {
      id: "toggle_output" as const,
      icon: SquareTerminal,
      onClick: onToggleOutput,
      pressed: outputOpen,
      buttonId: "output-trigger",
    },
    {
      id: "query_history" as const,
      icon: History,
      onClick: onOpenHistory,
      pressed: false,
      buttonId: "query-history-trigger",
    },
  ];

  const renderButton = (item: {
    id:
      "toggle_database" | "toggle_scripts" | "toggle_output" | "query_history";
    icon: LucideIcon;
    onClick?: () => void;
    pressed: boolean;
    buttonId?: string;
  }) => {
    const command = WORKSPACE_COMMANDS[item.id];
    const label = t(command.labelKey, command.fallback);
    const shortcut = command.shortcut;

    return (
      <Tooltip key={item.id}>
        <TooltipTrigger
          render={
            <Button
              id={item.buttonId}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              aria-pressed={item.pressed}
              onClick={item.onClick}
              className="text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-foreground"
            >
              <item.icon aria-hidden="true" className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="right">
          {label}
          {shortcut && (
            <kbd className="border-border ml-2 rounded border px-1 font-mono text-[10px]">
              {isMac
                ? shortcut.replace("Alt+", "Cmd+").replace("Ctrl+", "Cmd+")
                : shortcut}
            </kbd>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <nav
      aria-label={t("studio.tools")}
      className="bg-card border-border z-20 flex h-full w-9 shrink-0 flex-col items-center gap-1 border-r py-1.5"
    >
      <div className="flex flex-col items-center gap-1">
        {topActions.map(renderButton)}
      </div>
      <div className="flex-1" />
      <div className="flex flex-col items-center gap-1">
        {bottomActions.map(renderButton)}
      </div>
    </nav>
  );
}
