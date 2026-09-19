import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Globe } from "lucide-react";

interface LanguageSwitcherProps {
  compact?: boolean;
}

export function LanguageSwitcher({ compact = false }: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();

  const currentLang = i18n.language?.startsWith("vi") ? "vi" : "en";

  const handleLanguageChange = (lang: "vi" | "en") => {
    i18n.changeLanguage(lang);
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size={compact ? "icon-xs" : "xs"}
                  className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center justify-center gap-1 font-mono text-[10px] font-semibold tracking-wider h-6 px-1.5"
                >
                  <Globe className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                  {!compact && <span className="uppercase">{currentLang}</span>}
                </Button>
              }
            />
          }
        />
        <TooltipContent side="bottom">{t("common.language")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        side="bottom"
        className="w-36 p-1 bg-popover border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl"
      >
        <DropdownMenuItem
          onClick={() => handleLanguageChange("vi")}
          className={`flex items-center justify-between text-xs font-mono cursor-pointer py-1.5 px-2 rounded-md ${
            currentLang === "vi"
              ? "text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10"
              : ""
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span>🇻🇳</span>
            <span>Tiếng Việt</span>
          </span>
          {currentLang === "vi" && <span className="text-xs">✓</span>}
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => handleLanguageChange("en")}
          className={`flex items-center justify-between text-xs font-mono cursor-pointer py-1.5 px-2 rounded-md ${
            currentLang === "en"
              ? "text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-500/10"
              : ""
          }`}
        >
          <span className="flex items-center gap-1.5">
            <span>🇺🇸</span>
            <span>English</span>
          </span>
          {currentLang === "en" && <span className="text-xs">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
