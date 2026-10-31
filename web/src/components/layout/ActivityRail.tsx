import { Database, Folder, ListChecks } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { WORKSPACE_COMMANDS } from "./workspaceCommands";
import { isMac } from "@/lib/platform";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ActivityRailProps {
  activeToolWindow: "database" | "scripts" | null;
  outputOpen: boolean;
  onToggleDatabase: () => void;
  onToggleScripts: () => void;
  onToggleOutput: () => void;
}

export function ActivityRail({
  activeToolWindow,
  outputOpen,
  onToggleDatabase,
  onToggleScripts,
  onToggleOutput,
}: ActivityRailProps) {
  const { t } = useTranslation();
  const actions = (
    [
      {
        id: "toggle_database",
        icon: Database,
        onClick: onToggleDatabase,
        pressed: activeToolWindow === "database",
      },
      {
        id: "toggle_scripts",
        icon: Folder,
        onClick: onToggleScripts,
        pressed: activeToolWindow === "scripts",
      },
      {
        id: "toggle_output",
        icon: ListChecks,
        onClick: onToggleOutput,
        pressed: outputOpen,
      },
    ] as const
  ).map((item) => ({
    ...item,
    label: t(
      WORKSPACE_COMMANDS[item.id].labelKey,
      WORKSPACE_COMMANDS[item.id].fallback,
    ),
  }));

  const renderButton = (item: (typeof actions)[number]) => (
    <Tooltip key={item.id}>
      <TooltipTrigger
        render={
          <Button
            id={item.id === "toggle_output" ? "output-trigger" : undefined}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={item.label}
            aria-pressed={item.pressed}
            onClick={item.onClick}
            className="text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-foreground"
          >
            <item.icon aria-hidden="true" className="size-4" />
          </Button>
        }
      />
      <TooltipContent side="right">
        {item.label}
        {WORKSPACE_COMMANDS[item.id].shortcut && (
          <kbd className="border-border ml-2 rounded border px-1 font-mono text-[10px]">
            {isMac
              ? WORKSPACE_COMMANDS[item.id].shortcut?.replace("Alt+", "Cmd+")
              : WORKSPACE_COMMANDS[item.id].shortcut}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );

  return (
    <nav
      aria-label={t("studio.tools")}
      className="bg-card border-border z-20 flex w-[36px] shrink-0 flex-col items-center gap-1 border-r py-1.5"
    >
      {actions.map(renderButton)}
    </nav>
  );
}
