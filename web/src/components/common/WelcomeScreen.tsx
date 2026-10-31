import type { FC } from "react";
import { Plus, ShieldCheck, Terminal, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

interface WelcomeScreenProps {
  onOpenNewConnection: () => void;
}

export const WelcomeScreen: FC<WelcomeScreenProps> = ({
  onOpenNewConnection,
}) => {
  const { t } = useTranslation();

  return (
    <div className="bg-background dark:bg-card flex h-full flex-1 flex-col overflow-hidden">
      <div className="border-border bg-background dark:border-border dark:bg-card/30 flex h-9 shrink-0 items-center gap-2.5 border-b px-3">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground dark:hover:text-foreground -ml-1 cursor-pointer" />
        <Separator
          orientation="vertical"
          className="bg-muted dark:bg-muted h-4 self-center"
        />
        <span className="text-muted-foreground dark:text-muted-foreground font-mono text-xs font-medium">
          {t("sidebar.pebblebaseStudio")}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-auto p-5 text-center select-none">
        <div className="border-border bg-card dark:border-border dark:bg-card mb-4 flex h-10 w-10 items-center justify-center rounded-md border p-1.5">
          <img
            src="/favicon.svg"
            alt="Pebblebase Logo"
            className="h-full w-full object-contain"
          />
        </div>

        <h1 className="text-foreground dark:text-foreground mb-2 font-sans text-lg font-semibold tracking-tight">
          {t("app.welcomeTitle")}
        </h1>
        <p className="text-muted-foreground dark:text-muted-foreground mb-5 max-w-md text-sm leading-relaxed">
          {t("app.welcomeSubtitle")}
        </p>

        <Button
          type="button"
          size="lg"
          onClick={onOpenNewConnection}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          {t("app.addFirstConnection")}
        </Button>

        {/* Feature Badges */}
        <div className="border-border dark:border-border mt-8 grid max-w-xl grid-cols-1 gap-3 border-t pt-5 text-left sm:grid-cols-3">
          <div className="border-border/80 bg-card dark:border-border dark:bg-card/40 rounded border p-3">
            <ShieldCheck className="text-success dark:text-success mb-1.5 h-4 w-4" />
            <h4 className="text-foreground dark:text-foreground text-xs font-semibold">
              {t("app.featureAesTitle")}
            </h4>
            <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-[11px]">
              {t("app.featureAesDesc")}
            </p>
          </div>

          <div className="border-border/80 bg-card dark:border-border dark:bg-card/40 rounded border p-3">
            <Terminal className="mb-1.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h4 className="text-foreground dark:text-foreground text-xs font-semibold">
              {t("app.featureDatagripTitle")}
            </h4>
            <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-[11px]">
              {t("app.featureDatagripDesc")}
            </p>
          </div>

          <div className="border-border/80 bg-card dark:border-border dark:bg-card/40 rounded border p-3">
            <Zap className="text-warning dark:text-warning mb-1.5 h-4 w-4" />
            <h4 className="text-foreground dark:text-foreground text-xs font-semibold">
              {t("app.featureVirtualTitle")}
            </h4>
            <p className="text-muted-foreground dark:text-muted-foreground mt-0.5 text-[11px]">
              {t("app.featureVirtualDesc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
