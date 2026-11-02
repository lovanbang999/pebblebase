import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export interface OnboardingTourProps {
  userId?: string;
  isWelcomeOpen: boolean;
  onCloseWelcome: () => void;
  isTourActive: boolean;
  onStartTour: () => void;
  onCloseTour: () => void;
}

export interface TourStep {
  targetSelector: string;
  titleKey: string;
  descKey: string;
  tipKey?: string;
  placement: "right" | "bottom" | "left" | "top";
}

export interface WelcomeFeature {
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
}

export interface WelcomeModalProps {
  isOpen: boolean;
  dontShowAgain: boolean;
  onToggleDontShowAgain: (checked: boolean) => void;
  onDismiss: (startTour: boolean) => void;
}

export interface TourOverlayProps {
  currentStep: number;
  totalSteps: number;
  step: TourStep;
  targetRect: DOMRect | null;
  tooltipStyle: CSSProperties;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
}
