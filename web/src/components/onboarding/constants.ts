import { Database, Table2, Terminal, Workflow } from "lucide-react";
import type { TourStep, WelcomeFeature } from "./types";

export const SPOTLIGHT_PADDING = 4;
export const TOOLTIP_WIDTH = 360;
export const ESTIMATED_TOOLTIP_HEIGHT = 240;
export const VIEWPORT_PADDING = 16;
export const REPOSITION_DELAY_MS = 100;

export const TOUR_STEPS: TourStep[] = [
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

export const WELCOME_FEATURES: WelcomeFeature[] = [
  {
    icon: Database,
    titleKey: "onboarding.features.explorerTitle",
    descKey: "onboarding.features.explorerDesc",
  },
  {
    icon: Table2,
    titleKey: "onboarding.features.gridTitle",
    descKey: "onboarding.features.gridDesc",
  },
  {
    icon: Terminal,
    titleKey: "onboarding.features.queryTitle",
    descKey: "onboarding.features.queryDesc",
  },
  {
    icon: Workflow,
    titleKey: "onboarding.features.erdTitle",
    descKey: "onboarding.features.erdDesc",
  },
];
