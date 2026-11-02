import { useTranslation } from "react-i18next";
import { X, ChevronRight, ChevronLeft, Check, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import { SPOTLIGHT_PADDING } from "./constants";
import type { TourOverlayProps } from "./types";

export function TourOverlay({
  currentStep,
  totalSteps,
  step,
  targetRect,
  tooltipStyle,
  onPrev,
  onNext,
  onSkip,
}: TourOverlayProps) {
  const { t } = useTranslation();
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      role="region"
      aria-label="Product onboarding tour"
      className="pointer-events-auto fixed inset-0 z-50"
    >
      {/* Spotlight cutout mask */}
      {targetRect ? (
        <div
          className="pointer-events-none absolute transition-all duration-300 ease-out"
          style={{
            top: `${Math.max(0, targetRect.top - SPOTLIGHT_PADDING)}px`,
            left: `${Math.max(0, targetRect.left - SPOTLIGHT_PADDING)}px`,
            width: `${targetRect.width + SPOTLIGHT_PADDING * 2}px`,
            height: `${targetRect.height + SPOTLIGHT_PADDING * 2}px`,
            borderRadius: "8px",
            boxShadow: "0 0 0 9999px rgba(9, 9, 11, 0.68)",
            border: "2px solid rgba(16, 185, 129, 0.85)",
          }}
        />
      ) : (
        <div className="bg-code/70 absolute inset-0 backdrop-blur-xs transition-opacity duration-200" />
      )}

      {/* Tour Tooltip Card */}
      <div
        role="dialog"
        aria-modal="false"
        style={tooltipStyle}
        className="animate-in fade-in zoom-in-95 border-border bg-background text-foreground dark:border-border dark:bg-card rounded-xl border p-4 shadow-2xl duration-200 select-none"
      >
        {/* Header: step badge and skip button */}
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <span className="border-primary/20 bg-success/10 text-success inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold">
            {t("onboarding.stepOf", {
              current: currentStep + 1,
              total: totalSteps,
            })}
          </span>
          <button
            type="button"
            onClick={onSkip}
            aria-label={t("onboarding.skip")}
            title={t("onboarding.skip")}
            className="text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer rounded-md p-1 transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Step Title & Description */}
        <h3 className="text-foreground text-sm font-bold dark:text-white">
          {t(step.titleKey)}
        </h3>
        <p className="text-muted-foreground mt-1.5 text-xs leading-relaxed">
          {t(step.descKey)}
        </p>

        {/* Tip callout */}
        {step.tipKey && (
          <div className="border-success/50 bg-success/60 text-success dark:border-success/30 dark:bg-success/30 mt-2.5 flex items-start gap-1.5 rounded-lg border p-2 font-mono text-[11px]">
            <Lightbulb className="text-success mt-0.5 size-3 shrink-0" />
            <span className="leading-tight">{t(step.tipKey)}</span>
          </div>
        )}

        {/* Footer Navigation Bar */}
        <div className="border-border dark:border-border/80 mt-4 flex items-center justify-between border-t pt-3">
          {/* Dots Progress */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: totalSteps }).map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  idx === currentStep ? "bg-success w-4" : "bg-muted w-1.5",
                )}
              />
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1.5">
            {!isFirstStep && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onPrev}
                className="text-muted-foreground hover:text-foreground h-7 cursor-pointer px-2 text-xs"
              >
                <ChevronLeft className="mr-0.5 size-3.5" />
                <span>{t("onboarding.back")}</span>
              </Button>
            )}

            <Button
              type="button"
              size="xs"
              onClick={onNext}
              className="bg-primary hover:bg-primary/90 flex h-7 cursor-pointer items-center gap-1 px-2.5 text-xs font-medium text-white shadow-xs"
            >
              {isLastStep ? (
                <>
                  <Check className="size-3" />
                  <span>{t("onboarding.finish")}</span>
                </>
              ) : (
                <>
                  <span>{t("onboarding.next")}</span>
                  <ChevronRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
