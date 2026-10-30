import {
  Database,
  Terminal,
  Workflow,
  GitCompare,
  Plus,
  Search,
  Sparkles,
  Sun,
  Moon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "@/components/ui/sidebar";
import type { DatabaseType } from "@/lib/types";

interface ActivityRailProps {
  theme: "light" | "dark";
  databaseType?: DatabaseType;
  activeView?: string;
  onQuery: () => void;
  onErd: () => void;
  onDiff: () => void;
  onNewConnection: () => void;
  onSearch: () => void;
  onAISettings: () => void;
  onToggleTheme: () => void;
}

export function ActivityRail(props: ActivityRailProps) {
  const { t } = useTranslation();
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const databaseOpen = isMobile ? openMobile : open;
  const canQuery = Boolean(
    props.databaseType && props.databaseType !== "redis",
  );
  const actions = [
    {
      icon: Database,
      label: t("studio.database"),
      action: toggleSidebar,
      pressed: databaseOpen,
    },
    {
      icon: Search,
      label: t("workspace.findAnything"),
      action: props.onSearch,
    },
    {
      icon: Terminal,
      label: t("sidebar.queryConsole"),
      action: props.onQuery,
      disabled: !canQuery,
      pressed: props.activeView === "console",
    },
    {
      icon: Workflow,
      label: t("erd.title"),
      action: props.onErd,
      disabled: !canQuery,
      pressed: props.activeView === "erd",
    },
    {
      icon: GitCompare,
      label: t("diff.title"),
      action: props.onDiff,
      disabled: !canQuery || props.databaseType === "mongodb",
      pressed: props.activeView === "diff",
    },
    {
      icon: Plus,
      label: t("studio.newConnection"),
      action: props.onNewConnection,
    },
  ];
  const renderAction = ({
    icon: Icon,
    label,
    action,
    disabled,
    pressed,
  }: (typeof actions)[number]) => (
    <Tooltip key={label}>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={label}
            aria-pressed={pressed}
            disabled={disabled}
            onClick={action}
            className="text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-foreground"
          />
        }
      >
        <Icon aria-hidden="true" className="size-4" />
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <nav
      aria-label={t("studio.tools")}
      className="bg-card border-border z-20 flex w-[36px] shrink-0 flex-col items-center gap-1 border-r py-1.5"
    >
      {actions.map(renderAction)}
      <div className="flex-1" />
      {renderAction({
        icon: Sparkles,
        label: t("studio.aiSettings"),
        action: props.onAISettings,
      })}
      {renderAction({
        icon: props.theme === "dark" ? Sun : Moon,
        label: t("studio.toggleTheme"),
        action: props.onToggleTheme,
      })}
    </nav>
  );
}
