import { useState, useEffect, useCallback, useMemo } from "react";
import { STORAGE_KEYS } from "@/constants";
import { TOUR_STEPS, REPOSITION_DELAY_MS } from "./constants";
import { getTooltipCoordinates } from "./positioning";
import { WelcomeModal } from "./WelcomeModal";
import { TourOverlay } from "./TourOverlay";
import type { OnboardingTourProps } from "./types";

export type { OnboardingTourProps } from "./types";

export function OnboardingTour({
  userId = "guest",
  isWelcomeOpen,
  onCloseWelcome,
  isTourActive,
  onStartTour,
  onCloseTour,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const storageKey = STORAGE_KEYS.onboarding(userId);

  const markCompleted = useCallback(() => {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // Ignore localStorage errors in private / sandboxed modes
    }
  }, [storageKey]);

  const handleDismissWelcome = useCallback(
    (startTourNow = false) => {
      if (dontShowAgain) {
        markCompleted();
      }
      onCloseWelcome();
      if (startTourNow) {
        setCurrentStep(0);
        onStartTour();
      }
    },
    [dontShowAgain, markCompleted, onCloseWelcome, onStartTour],
  );

  const updateTargetRect = useCallback(() => {
    if (!isTourActive) return;
    const step = TOUR_STEPS[currentStep];
    if (!step) return;

    const el = document.querySelector(step.targetSelector);
    setTargetRect(el ? el.getBoundingClientRect() : null);
  }, [isTourActive, currentStep]);

  // Recalculate target rect on step change, resize, or scroll
  useEffect(() => {
    if (!isTourActive) return;
    updateTargetRect();

    const handleResize = () => updateTargetRect();
    const handleScroll = () => updateTargetRect();

    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleScroll, true);

    const timer = setTimeout(updateTargetRect, REPOSITION_DELAY_MS);

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleScroll, true);
      clearTimeout(timer);
    };
  }, [isTourActive, updateTargetRect]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      markCompleted();
      onCloseTour();
    }
  }, [currentStep, markCompleted, onCloseTour]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    markCompleted();
    onCloseTour();
  }, [markCompleted, onCloseTour]);

  // Keyboard navigation
  useEffect(() => {
    if (!isTourActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          handleSkip();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "ArrowLeft":
          handlePrev();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTourActive, handleSkip, handleNext, handlePrev]);

  const currentTourStep = TOUR_STEPS[currentStep];

  const tooltipStyle = useMemo(() => {
    if (!isTourActive || !currentTourStep) return {};
    return getTooltipCoordinates(
      currentTourStep.placement,
      targetRect,
      typeof window !== "undefined" ? window.innerWidth : 1024,
      typeof window !== "undefined" ? window.innerHeight : 768,
    );
  }, [isTourActive, currentTourStep, targetRect]);

  return (
    <>
      <WelcomeModal
        isOpen={isWelcomeOpen}
        dontShowAgain={dontShowAgain}
        onToggleDontShowAgain={setDontShowAgain}
        onDismiss={handleDismissWelcome}
      />

      {isTourActive && currentTourStep && (
        <TourOverlay
          currentStep={currentStep}
          totalSteps={TOUR_STEPS.length}
          step={currentTourStep}
          targetRect={targetRect}
          tooltipStyle={tooltipStyle}
          onPrev={handlePrev}
          onNext={handleNext}
          onSkip={handleSkip}
        />
      )}
    </>
  );
}

export default OnboardingTour;
