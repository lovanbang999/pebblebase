import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
                  className="text-muted-foreground hover:text-foreground dark:hover:text-foreground flex h-6 items-center justify-center gap-1 px-1.5 font-mono text-[10px] font-semibold tracking-wider"
                >
                  <Globe className="text-success dark:text-success size-3.5" />
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
        className="bg-popover border-border dark:border-border w-36 rounded-lg border p-1 shadow-xl"
      >
        <DropdownMenuItem
          onClick={() => handleLanguageChange("vi")}
          className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 font-mono text-xs ${
            currentLang === "vi"
              ? "bg-success/10 text-success dark:text-success font-semibold"
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
          className={`flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 font-mono text-xs ${
            currentLang === "en"
              ? "bg-success/10 text-success dark:text-success font-semibold"
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
