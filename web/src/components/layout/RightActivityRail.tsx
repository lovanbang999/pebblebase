import { Bell, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface RightActivityRailProps {
  aiOpen: boolean;
  notificationsOpen: boolean;
  unreadCount: number;
  onToggleAI: () => void;
  onToggleNotifications: () => void;
}

export function RightActivityRail({
  aiOpen,
  notificationsOpen,
  unreadCount,
  onToggleAI,
  onToggleNotifications,
}: RightActivityRailProps) {
  const { t } = useTranslation();
  const aiLabel = t("operations.aiAssistant", "AI query assistant");
  const notificationsLabel = t("operations.notifications", "Notifications");

  return (
    <nav
      aria-label={t("studio.auxiliaryTools", "Auxiliary tools")}
      className="bg-card border-border z-20 flex w-[36px] shrink-0 flex-col items-center gap-1 border-l py-1.5"
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              id="ai-assistant-trigger"
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={aiLabel}
              aria-pressed={aiOpen}
              onClick={onToggleAI}
              className="text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-sidebar-accent aria-pressed:text-foreground"
            >
              <Sparkles aria-hidden="true" className="size-4" />
            </Button>
          }
        />
        <TooltipContent side="left">{aiLabel}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              id="notifications-trigger"
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={notificationsLabel}
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              onClick={onToggleNotifications}
              className="text-muted-foreground hover:bg-accent hover:text-foreground aria-expanded:bg-sidebar-accent aria-expanded:text-foreground relative"
            >
              <Bell aria-hidden="true" className="size-4" />
              {unreadCount > 0 && (
                <span className="bg-destructive absolute -top-0.5 -right-0.5 min-w-3.5 rounded-full px-0.5 text-center text-[9px] leading-3.5 text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          }
        />
        <TooltipContent side="left">{notificationsLabel}</TooltipContent>
      </Tooltip>
    </nav>
  );
}
