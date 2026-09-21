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
    <div className="flex h-full flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-950">
      <div className="flex h-11 items-center gap-2.5 border-b border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900/30">
        <SidebarTrigger className="-ml-1 cursor-pointer text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100" />
        <Separator
          orientation="vertical"
          className="h-4 self-center bg-zinc-200 dark:bg-zinc-800"
        />
        <span className="font-mono text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {t("sidebar.pebblebaseStudio")}
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center select-none">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 p-2.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900 dark:shadow-2xl">
          <img
            src="/favicon.svg"
            alt="Pebblebase Logo"
            className="h-full w-full object-contain"
          />
        </div>

        <h1 className="mb-2 font-mono text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          {t("app.welcomeTitle")}
        </h1>
        <p className="mb-8 max-w-md text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t("app.welcomeSubtitle")}
        </p>

        <Button
          type="button"
          size="lg"
          onClick={onOpenNewConnection}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-950/20 transition-all hover:bg-emerald-500 dark:shadow-emerald-950"
        >
          <Plus className="h-4 w-4" />
          {t("app.addFirstConnection")}
        </Button>

        {/* Feature Badges */}
        <div className="mt-16 grid max-w-xl grid-cols-3 gap-6 border-t border-zinc-200 pt-8 text-left dark:border-zinc-900">
          <div className="rounded border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-900 dark:bg-zinc-900/40">
            <ShieldCheck className="mb-1.5 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
              {t("app.featureAesTitle")}
            </h4>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {t("app.featureAesDesc")}
            </p>
          </div>

          <div className="rounded border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-900 dark:bg-zinc-900/40">
            <Terminal className="mb-1.5 h-4 w-4 text-sky-600 dark:text-sky-400" />
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
              {t("app.featureDatagripTitle")}
            </h4>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {t("app.featureDatagripDesc")}
            </p>
          </div>

          <div className="rounded border border-zinc-200/80 bg-zinc-50 p-3 dark:border-zinc-900 dark:bg-zinc-900/40">
            <Zap className="mb-1.5 h-4 w-4 text-amber-600 dark:text-amber-400" />
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
              {t("app.featureVirtualTitle")}
            </h4>
            <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {t("app.featureVirtualDesc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
