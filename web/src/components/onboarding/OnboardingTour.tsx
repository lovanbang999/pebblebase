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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden text-zinc-900 dark:text-zinc-100 animate-in zoom-in-95 duration-200">
            {/* Close button */}
            <button
              type="button"
              onClick={() => handleDismissWelcome(false)}
              className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              title={t("common.close", "Close")}
            >
              <X className="size-4" />
            </button>

            {/* Header Content */}
            <div className="p-6 pb-4">
              <div className="flex items-center gap-2 mb-2.5">
                <div className="w-6 h-6 rounded-md bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-[10px] tracking-tight">
                  PB
                </div>
                <span className="text-[11px] font-mono font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Pebblebase Studio
                </span>
              </div>
              <h2 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">
                {t("onboarding.welcomeTitle")}
              </h2>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed max-w-xl">
                {t("onboarding.welcomeSubtitle")}
              </p>
            </div>

            {/* Feature Highlights Grid */}
            <div className="px-6 py-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Feature 1 */}
              <div className="group flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800/70 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all duration-150">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:border-emerald-500/30 shrink-0 transition-colors">
                  <Database className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.explorerTitle")}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                    {t("onboarding.features.explorerDesc")}
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="group flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800/70 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all duration-150">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:border-emerald-500/30 shrink-0 transition-colors">
                  <Table2 className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.gridTitle")}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                    {t("onboarding.features.gridDesc")}
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="group flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800/70 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all duration-150">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:border-emerald-500/30 shrink-0 transition-colors">
                  <Terminal className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.queryTitle")}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                    {t("onboarding.features.queryDesc")}
                  </p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="group flex items-start gap-3 p-3.5 rounded-xl bg-zinc-50/70 dark:bg-zinc-800/40 border border-zinc-200/70 dark:border-zinc-800/70 hover:border-zinc-300 dark:hover:border-zinc-700/80 transition-all duration-150">
                <div className="p-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 group-hover:border-emerald-500/30 shrink-0 transition-colors">
                  <Workflow className="size-4" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {t("onboarding.features.erdTitle")}
                  </h4>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 leading-snug">
                    {t("onboarding.features.erdDesc")}
                  </p>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 pt-4 mt-3 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/50 dark:bg-zinc-900/30">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(e) => setDontShowAgain(e.target.checked)}
                  className="rounded border-zinc-300 dark:border-zinc-700 text-emerald-600 focus:ring-emerald-500 size-3.5 cursor-pointer"
                />
                <span>{t("onboarding.dontShowAgain")}</span>
              </label>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleDismissWelcome(false)}
                  className="cursor-pointer text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 font-medium"
                >
                  {t("onboarding.exploreOnMyOwn")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleDismissWelcome(true)}
                  className="cursor-pointer text-xs bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold flex items-center gap-1.5 shadow-sm transition-all"
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
        <div className="fixed inset-0 z-50 pointer-events-auto">
          {/* Spotlight cutout mask */}
          {targetRect ? (
            <div
              className="absolute pointer-events-none transition-all duration-300 ease-out"
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
            className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl border border-zinc-200 dark:border-zinc-800 p-4 text-zinc-900 dark:text-zinc-100 animate-in fade-in zoom-in-95 duration-200 select-none"
          >
            {/* Header: step badge and skip button */}
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {t("onboarding.stepOf", {
                  current: currentStep + 1,
                  total: TOUR_STEPS.length,
                })}
              </span>
              <button
                type="button"
                onClick={handleSkip}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title={t("onboarding.skip")}
              >
                <X className="size-3.5" />
              </button>
            </div>

            {/* Step Title & Description */}
            <h3 className="text-sm font-bold text-zinc-900 dark:text-white">
              {t(TOUR_STEPS[currentStep].titleKey)}
            </h3>
            <p className="mt-1.5 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {t(TOUR_STEPS[currentStep].descKey)}
            </p>

            {/* Tip callout */}
            {TOUR_STEPS[currentStep].tipKey && (
              <div className="mt-2.5 flex items-start gap-1.5 p-2 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/50 dark:border-emerald-800/30 text-[11px] text-emerald-800 dark:text-emerald-300 font-mono">
                <Lightbulb className="size-3 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-tight">
                  {t(TOUR_STEPS[currentStep].tipKey!)}
                </span>
              </div>
            )}

            {/* Footer Navigation Bar */}
            <div className="mt-4 pt-3 flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800/80">
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
                    className="text-xs h-7 px-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    <ChevronLeft className="size-3.5 mr-0.5" />
                    <span>{t("onboarding.back")}</span>
                  </Button>
                )}

                <Button
                  type="button"
                  size="xs"
                  onClick={handleNext}
                  className="text-xs h-7 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center gap-1 shadow-xs cursor-pointer"
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
