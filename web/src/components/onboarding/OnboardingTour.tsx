import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Database,
  Table2,
  Terminal,
  Workflow,
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { STORAGE_KEYS } from "@/constants";

export interface OnboardingTourProps {
  userId?: string;
  isWelcomeOpen: boolean;
  onCloseWelcome: () => void;
  isTourActive: boolean;
  onStartTour: () => void;
  onCloseTour: () => void;
}

interface TourStep {
  targetSelector: string;
  titleKey: string;
  descKey: string;
  tipKey?: string;
  placement: "right" | "bottom" | "left" | "top";
}

const TOUR_STEPS: TourStep[] = [
  {
    targetSelector: '[data-tour="sidebar-tables"]',
    titleKey: "onboarding.steps.tables.title",
    descKey: "onboarding.steps.tables.description",
    tipKey: "onboarding.steps.tables.tip",
    placement: "right",
  },
  {
    targetSelector: '[data-tour="datagrid-view"]',
    titleKey: "onboarding.steps.datagrid.title",
    descKey: "onboarding.steps.datagrid.description",
    tipKey: "onboarding.steps.datagrid.tip",
    placement: "bottom",
  },
  {
    targetSelector: '[data-tour="nav-query-console"]',
    titleKey: "onboarding.steps.queryConsole.title",
    descKey: "onboarding.steps.queryConsole.description",
    tipKey: "onboarding.steps.queryConsole.tip",
    placement: "right",
  },
  {
    targetSelector: '[data-tour="nav-erd"]',
    titleKey: "onboarding.steps.erd.title",
    descKey: "onboarding.steps.erd.description",
    tipKey: "onboarding.steps.erd.tip",
    placement: "right",
  },
  {
    targetSelector: '[data-tour="grid-toolbar"]',
    titleKey: "onboarding.steps.toolbar.title",
    descKey: "onboarding.steps.toolbar.description",
    tipKey: "onboarding.steps.toolbar.tip",
    placement: "bottom",
  },
];

export function OnboardingTour({
  userId = "guest",
  isWelcomeOpen,
  onCloseWelcome,
  isTourActive,
  onStartTour,
  onCloseTour,
}: OnboardingTourProps) {
  const { t } = useTranslation();
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const storageKey = STORAGE_KEYS.onboarding(userId);

  // Mark completion in localStorage
  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // Ignore localStorage errors in private modes
    }
  }, [storageKey]);

  // Handle dismiss from welcome modal
  const handleDismissWelcome = (startTourNow = false) => {
    if (dontShowAgain) {
      markCompleted();
    }
    onCloseWelcome();
    if (startTourNow) {
      setCurrentStep(0);
      onStartTour();
    }
  };

  // Find target element coordinates for current step
  const updateTargetRect = useCallback(() => {
    if (!isTourActive) return;
    const step = TOUR_STEPS[currentStep];
    if (!step) return;

    const el = document.querySelector(step.targetSelector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isTourActive, currentStep]);

  // Update rect on step change, window resize, or scroll
  useEffect(() => {
    if (!isTourActive) return;
    updateTargetRect();

    const handleResize = () => updateTargetRect();
    const handleScroll = () => updateTargetRect();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    const timer = setTimeout(updateTargetRect, 100);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      clearTimeout(timer);
    };
  }, [isTourActive, currentStep, updateTargetRect]);

  // Keyboard navigation for tour
  useEffect(() => {
    if (!isTourActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        markCompleted();
        onCloseTour();
      } else if (e.key === "ArrowRight") {
        if (currentStep < TOUR_STEPS.length - 1) {
          setCurrentStep((s) => s + 1);
        } else {
          markCompleted();
          onCloseTour();
        }
      } else if (e.key === "ArrowLeft") {
        if (currentStep > 0) {
          setCurrentStep((s) => s - 1);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTourActive, currentStep, markCompleted, onCloseTour]);

  // Step transitions
  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      markCompleted();
      onCloseTour();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSkip = () => {
    markCompleted();
    onCloseTour();
  };

  // Tooltip position calculation
  const calculateTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 9999,
      };
    }

    const step = TOUR_STEPS[currentStep];
    const tooltipWidth = 360;
    const padding = 16;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    switch (step.placement) {
      case "right":
        left = targetRect.right + padding;
        top = Math.min(
          Math.max(padding, targetRect.top),
          viewportHeight - 240 - padding,
        );
        // Fallback if overflowing right edge
        if (left + tooltipWidth > viewportWidth - padding) {
          left = Math.max(padding, targetRect.left - tooltipWidth - padding);
        }
        break;

      case "bottom":
        left = Math.min(
          Math.max(
            padding,
            targetRect.left + (targetRect.width - tooltipWidth) / 2,
          ),
          viewportWidth - tooltipWidth - padding,
        );
        top = targetRect.bottom + padding;
        // Fallback if overflowing bottom edge
        if (top + 240 > viewportHeight - padding) {
          top = Math.max(padding, targetRect.top - 240 - padding);
        }
        break;

      case "left":
        left = Math.max(padding, targetRect.left - tooltipWidth - padding);
        top = Math.min(
          Math.max(padding, targetRect.top),
          viewportHeight - 240 - padding,
        );
        break;

      case "top":
      default:
        left = Math.min(
          Math.max(
            padding,
            targetRect.left + (targetRect.width - tooltipWidth) / 2,
          ),
          viewportWidth - tooltipWidth - padding,
        );
        top = Math.max(padding, targetRect.top - 240 - padding);
        break;
    }

    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      zIndex: 9999,
      width: `${tooltipWidth}px`,
    };
  };

  return (
    <>
      {/* 1. Welcome Modal */}
      {isWelcomeOpen && (
        <div className="animate-in fade-in fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-xs duration-200">
          <div className="animate-in zoom-in-95 relative w-full max-w-2xl overflow-hidden rounded-2xl border border-zinc-200/80 bg-white text-zinc-900 shadow-2xl duration-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
            {/* Close button */}
            <button
              type="button"
              onClick={() => handleDismissWelcome(false)}
              className="absolute top-4 right-4 cursor-pointer rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              title={t("common.close", "Close")}
            >
              <X className="size-4" />
            </button>

            {/* Header Content */}
            <div className="p-6 pb-4">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-[10px] font-bold tracking-tight text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
                  PB
                </div>
                <span className="font-mono text-[11px] font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-400">
                  Pebblebase Studio
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {t("onboarding.welcomeTitle")}
              </h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                {t("onboarding.welcomeSubtitle")}
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="grid grid-cols-1 gap-3 px-6 py-2 sm:grid-cols-2">
              {/* Feature 1 */}
              <div className="group flex items-start gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-3.5 transition-all duration-150 hover:border-zinc-300 dark:border-zinc-800/70 dark:bg-zinc-800/40 dark:hover:border-zinc-700/80">
                <div className="shrink-0 rounded-lg border border-zinc-200/60 bg-zinc-100 p-2 text-zinc-600 transition-colors group-hover:border-emerald-500/30 group-hover:text-emerald-600 dark:border-zinc-700/50 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:text-emerald-400">
                  <Database className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.explorerTitle")}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {t("onboarding.features.explorerDesc")}
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group flex items-start gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-3.5 transition-all duration-150 hover:border-zinc-300 dark:border-zinc-800/70 dark:bg-zinc-800/40 dark:hover:border-zinc-700/80">
                <div className="shrink-0 rounded-lg border border-zinc-200/60 bg-zinc-100 p-2 text-zinc-600 transition-colors group-hover:border-emerald-500/30 group-hover:text-emerald-600 dark:border-zinc-700/50 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:text-emerald-400">
                  <Table2 className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.gridTitle")}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {t("onboarding.features.gridDesc")}
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group flex items-start gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-3.5 transition-all duration-150 hover:border-zinc-300 dark:border-zinc-800/70 dark:bg-zinc-800/40 dark:hover:border-zinc-700/80">
                <div className="shrink-0 rounded-lg border border-zinc-200/60 bg-zinc-100 p-2 text-zinc-600 transition-colors group-hover:border-emerald-500/30 group-hover:text-emerald-600 dark:border-zinc-700/50 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:text-emerald-400">
                  <Terminal className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.queryTitle")}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {t("onboarding.features.queryDesc")}
                  </p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="group flex items-start gap-3 rounded-xl border border-zinc-200/70 bg-zinc-50/70 p-3.5 transition-all duration-150 hover:border-zinc-300 dark:border-zinc-800/70 dark:bg-zinc-800/40 dark:hover:border-zinc-700/80">
                <div className="shrink-0 rounded-lg border border-zinc-200/60 bg-zinc-100 p-2 text-zinc-600 transition-colors group-hover:border-emerald-500/30 group-hover:text-emerald-600 dark:border-zinc-700/50 dark:bg-zinc-800 dark:text-zinc-300 dark:group-hover:text-emerald-400">
                  <Workflow className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.erdTitle")}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                    {t("onboarding.features.erdDesc")}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="mt-3 flex flex-col items-center justify-between gap-4 border-t border-zinc-100 bg-zinc-50/50 p-6 pt-4 sm:flex-row dark:border-zinc-800/60 dark:bg-zinc-900/30">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-500 select-none hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="size-3.5 cursor-pointer rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-700"
                />
                <span>{t("onboarding.dontShowAgain")}</span>
              </label>

              <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDismissWelcome(false)}
                  className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  {t("onboarding.exploreOnMyOwn")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleDismissWelcome(true)}
                  className="flex cursor-pointer items-center gap-1.5 bg-emerald-600 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:bg-emerald-700"
                >
                  <span>{t("onboarding.startTour")}</span>
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Interactive Spotlight Tour Overlay */}
      {isTourActive && (
        <div className="pointer-events-auto fixed inset-0 z-50">
          {/* Spotlight cutout mask */}
          {targetRect ? (
            <div
              className="pointer-events-none absolute transition-all duration-300 ease-out"
              style={{
                top: `${Math.max(0, targetRect.top - 4)}px`,
                left: `${Math.max(0, targetRect.left - 4)}px`,
                width: `${targetRect.width + 8}px`,
                height: `${targetRect.height + 8}px`,
                borderRadius: "8px",
                boxShadow: "0 0 0 9999px rgba(9, 9, 11, 0.68)",
                border: "2px solid rgba(16, 185, 129, 0.85)",
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-xs transition-opacity duration-200" />
          )}

          {/* Tour Tooltip Card */}
          <div
            style={calculateTooltipStyle()}
            className="animate-in fade-in zoom-in-95 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-900 shadow-2xl duration-200 select-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {/* Header: step badge and skip button */}
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                {t("onboarding.stepOf", {
                  current: currentStep + 1,
                  total: TOUR_STEPS.length,
                })}
              </span>
              <button
                type="button"
                onClick={handleSkip}
                className="cursor-pointer rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                title={t("onboarding.skip")}
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Step Title & Description */}
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              {t(TOUR_STEPS[currentStep].titleKey)}
            </h3>
            <p className="mt-1.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {t(TOUR_STEPS[currentStep].descKey)}
            </p>

            {/* Tip callout */}
            {TOUR_STEPS[currentStep].tipKey && (
              <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-emerald-200/50 bg-emerald-50/60 p-2 font-mono text-[11px] text-emerald-800 dark:border-emerald-800/30 dark:bg-emerald-950/30 dark:text-emerald-300">
                <Lightbulb className="mt-0.5 size-3 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <span className="leading-tight">
                  {t(TOUR_STEPS[currentStep].tipKey!)}
                </span>
              </div>
            )}

            {/* Footer Navigation Bar */}
            <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
              {/* Dots Progress */}
              <div className="flex items-center gap-1.5">
                {TOUR_STEPS.map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-200 ${
                      idx === currentStep
                        ? "w-4 bg-emerald-500"
                        : "w-1.5 bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  />
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5">
                {currentStep > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={handlePrev}
                    className="h-7 cursor-pointer px-2 text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
                  >
                    <ChevronLeft className="mr-0.5 size-3.5" />
                    <span>{t("onboarding.back")}</span>
                  </Button>
                )}

                <Button
                  type="button"
                  size="xs"
                  onClick={handleNext}
                  className="flex h-7 cursor-pointer items-center gap-1 bg-emerald-600 px-2.5 text-xs font-medium text-white shadow-xs hover:bg-emerald-500"
                >
                  {currentStep === TOUR_STEPS.length - 1 ? (
                    <>
                      <Check className="size-3" />
                      <span>{t("onboarding.finish")}</span>
                    </>
                  ) : (
                    <>
                      <span>{t("onboarding.next")}</span>
                      <ChevronRight className="size-3" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
