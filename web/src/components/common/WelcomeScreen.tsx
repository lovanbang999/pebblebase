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
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-zinc-950">
      <div className="h-11 px-3 border-b border-zinc-200 dark:border-zinc-800 flex items-center gap-2.5 bg-white dark:bg-zinc-900/30">
        <SidebarTrigger className="-ml-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer" />
        <Separator
          orientation="vertical"
          className="h-4 bg-zinc-200 dark:bg-zinc-800 self-center"
        />
        <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 font-medium">
          {t("sidebar.pebblebaseStudio")}
        </span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 flex items-center justify-center mb-6 shadow-xl dark:shadow-2xl p-2.5">
          <img
            src="/favicon.svg"
            alt="Pebblebase Logo"
            className="w-full h-full object-contain"
          />
        </div>

        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 mb-2 font-mono">
          {t("app.welcomeTitle")}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-md mb-8 leading-relaxed">
          {t("app.welcomeSubtitle")}
        </p>

        <Button
          type="button"
          size="lg"
          onClick={onOpenNewConnection}
          className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/20 dark:shadow-emerald-950"
        >
          <Plus className="w-4 h-4" />
          {t("app.addFirstConnection")}
        </Button>

        {/* Feature Badges */}
        <div className="grid grid-cols-3 gap-6 max-w-xl mt-16 pt-8 border-t border-zinc-200 dark:border-zinc-900 text-left">
          <div className="p-3 rounded bg-zinc-50 border border-zinc-200/80 dark:bg-zinc-900/40 dark:border-zinc-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mb-1.5" />
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
              {t("app.featureAesTitle")}
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t("app.featureAesDesc")}
            </p>
          </div>

          <div className="p-3 rounded bg-zinc-50 border border-zinc-200/80 dark:bg-zinc-900/40 dark:border-zinc-900">
            <Terminal className="w-4 h-4 text-sky-600 dark:text-sky-400 mb-1.5" />
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
              {t("app.featureDatagripTitle")}
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t("app.featureDatagripDesc")}
            </p>
          </div>

          <div className="p-3 rounded bg-zinc-50 border border-zinc-200/80 dark:bg-zinc-900/40 dark:border-zinc-900">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 mb-1.5" />
            <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-200">
              {t("app.featureVirtualTitle")}
            </h4>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
              {t("app.featureVirtualDesc")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
