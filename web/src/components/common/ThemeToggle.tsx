import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sun, Moon } from "lucide-react";
import { STORAGE_KEYS } from "@/constants";

interface ThemeToggleProps {
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

export function ThemeToggle({
  theme: externalTheme,
  onToggleTheme: externalToggle,
  side = "bottom",
  className,
}: ThemeToggleProps) {
  const { t } = useTranslation();
  const [internalTheme, setInternalTheme] = useState<"dark" | "light">(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
    }
    return (
      (localStorage.getItem(STORAGE_KEYS.THEME) as "dark" | "light") || "dark"
    );
  });

  const currentTheme = externalTheme ?? internalTheme;

  const handleToggle = () => {
    if (externalToggle) {
      externalToggle();
    } else {
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      setInternalTheme(nextTheme);
      localStorage.setItem(STORAGE_KEYS.THEME, nextTheme);
      if (nextTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleToggle}
            className={`text-muted-foreground hover:bg-muted/60 hover:text-foreground dark:hover:bg-muted dark:hover:text-foreground size-6 cursor-pointer rounded transition-colors ${
              className ?? ""
            }`}
          >
            {currentTheme === "dark" ? (
              <Sun className="text-warning size-3.5" />
            ) : (
              <Moon className="text-primary dark:text-primary size-3.5" />
            )}
          </Button>
        }
      />
      <TooltipContent side={side}>
        {currentTheme === "dark"
          ? t("common.themeLight")
          : t("common.themeDark")}
      </TooltipContent>
    </Tooltip>
  );
}
