import { useTranslation } from "react-i18next";
import { X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WELCOME_FEATURES } from "./constants";
import type { WelcomeModalProps } from "./types";

export function WelcomeModal({
  isOpen,
  dontShowAgain,
  onToggleDontShowAgain,
  onDismiss,
}: WelcomeModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
      className="animate-in fade-in bg-code/70 fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-xs duration-200"
    >
      <div className="animate-in zoom-in-95 border-border/80 bg-background text-foreground dark:border-border dark:bg-card relative w-full max-w-2xl overflow-hidden rounded-2xl border shadow-2xl duration-200">
        <button
          type="button"
          onClick={() => onDismiss(false)}
          aria-label={t("common.close", "Close")}
          title={t("common.close", "Close")}
          className="text-muted-foreground hover:bg-muted hover:text-foreground absolute top-4 right-4 cursor-pointer rounded-lg p-1.5 transition-colors"
        >
          <X className="size-4" />
        </button>

        {/* Header Content */}
        <div className="p-6 pb-4">
          <div className="mb-2.5 flex items-center gap-2">
            <div className="border-primary/25 bg-success/10 text-success dark:bg-success/15 flex h-6 w-6 items-center justify-center rounded-md border text-[10px] font-bold tracking-tight">
              PB
            </div>
            <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider uppercase">
              Pebblebase Studio
            </span>
          </div>
          <h2
            id="welcome-modal-title"
            className="text-foreground text-xl font-bold tracking-tight dark:text-white"
          >
            {t("onboarding.welcomeTitle")}
          </h2>
          <p className="text-muted-foreground mt-1 max-w-xl text-sm leading-relaxed">
            {t("onboarding.welcomeSubtitle")}
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 gap-3 px-6 py-2 sm:grid-cols-2">
          {WELCOME_FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
            <div
              key={titleKey}
              className="group border-border/70 bg-card/70 hover:border-border dark:border-border/70 dark:bg-muted/40 dark:hover:border-border/80 flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-150"
            >
              <div className="group-hover:border-primary/30 border-border/60 bg-muted text-muted-foreground group-hover:text-success dark:border-border/50 shrink-0 rounded-lg border p-2 transition-colors">
                <Icon className="size-4" />
              </div>
              <div>
                <h4 className="text-foreground text-xs font-semibold">
                  {t(titleKey)}
                </h4>
                <p className="text-muted-foreground mt-0.5 text-[11px] leading-snug">
                  {t(descKey)}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="border-border bg-card/50 dark:border-border/60 dark:bg-card/30 mt-3 flex flex-col items-center justify-between gap-4 border-t p-6 pt-4 sm:flex-row">
          <label className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 text-xs select-none">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => onToggleDontShowAgain(e.target.checked)}
              className="focus:ring-primary border-border text-success size-3.5 cursor-pointer rounded"
            />
            <span>{t("onboarding.dontShowAgain")}</span>
          </label>

          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onDismiss(false)}
              className="text-muted-foreground hover:text-foreground cursor-pointer text-xs font-medium"
            >
              {t("onboarding.exploreOnMyOwn")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onDismiss(true)}
              className="bg-primary hover:bg-primary/90 active:bg-success flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-white shadow-xs transition-all"
            >
              <span>{t("onboarding.startTour")}</span>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
