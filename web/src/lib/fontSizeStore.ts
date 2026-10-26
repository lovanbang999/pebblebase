import { create } from "zustand";
import { STORAGE_KEYS } from "@/constants";

export type FontSize = "sm" | "md" | "lg" | "xl";

export const FONT_SIZES: {
  id: FontSize;
  scale: string;
  labelKey: string;
  defaultLabel: string;
}[] = [
  {
    id: "sm",
    scale: "87.5%",
    labelKey: "fontSize.small",
    defaultLabel: "Small",
  },
  {
    id: "md",
    scale: "100%",
    labelKey: "fontSize.default",
    defaultLabel: "Default",
  },
  {
    id: "lg",
    scale: "112.5%",
    labelKey: "fontSize.large",
    defaultLabel: "Large",
  },
  {
    id: "xl",
    scale: "125%",
    labelKey: "fontSize.extraLarge",
    defaultLabel: "Extra Large",
  },
];

const ORDER: FontSize[] = ["sm", "md", "lg", "xl"];

function getInitialFontSize(): FontSize {
  if (typeof window === "undefined") return "md";
  const stored = localStorage.getItem(STORAGE_KEYS.FONT_SIZE);
  if (stored && ORDER.includes(stored as FontSize)) {
    return stored as FontSize;
  }
  return "md";
}

export function applyFontSizeToDom(size: FontSize) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-font-size", size);
}

interface FontSizeState {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  resetFontSize: () => void;
}

export const useFontSizeStore = create<FontSizeState>((set, get) => ({
  fontSize: getInitialFontSize(),

  setFontSize: (size: FontSize) => {
    try {
      localStorage.setItem(STORAGE_KEYS.FONT_SIZE, size);
    } catch {
      /* ignore storage errors */
    }
    applyFontSizeToDom(size);
    set({ fontSize: size });
  },

  increaseFontSize: () => {
    const current = get().fontSize;
    const currentIndex = ORDER.indexOf(current);
    if (currentIndex < ORDER.length - 1) {
      const next = ORDER[currentIndex + 1];
      get().setFontSize(next);
    }
  },

  decreaseFontSize: () => {
    const current = get().fontSize;
    const currentIndex = ORDER.indexOf(current);
    if (currentIndex > 0) {
      const prev = ORDER[currentIndex - 1];
      get().setFontSize(prev);
    }
  },

  resetFontSize: () => {
    get().setFontSize("md");
  },
}));

// Apply on initial module load
if (typeof window !== "undefined") {
  applyFontSizeToDom(getInitialFontSize());
}
