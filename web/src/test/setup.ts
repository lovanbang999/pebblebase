import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import i18n from "@/lib/i18n";

// Set English language for deterministic test assertions
i18n.changeLanguage("en");

afterEach(() => {
  cleanup();
});

// Polyfill element dimensions and ResizeObserver for DOM virtualization (TanStack Virtual)
if (typeof window !== "undefined") {
  class MockResizeObserver {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe = (element: Element) => {
      // Immediately inform observer of synthetic element dimensions
      queueMicrotask(() => {
        this.callback(
          [
            {
              target: element,
              contentRect: {
                width: 1000,
                height: 600,
                top: 0,
                left: 0,
                bottom: 600,
                right: 1000,
                x: 0,
                y: 0,
                toJSON: () => {},
              },
              borderBoxSize: [{ inlineSize: 1000, blockSize: 600 }],
              contentBoxSize: [{ inlineSize: 1000, blockSize: 600 }],
              devicePixelContentBoxSize: [],
            } as unknown as ResizeObserverEntry,
          ],
          this,
        );
      });
    };
    unobserve = () => {};
    disconnect = () => {};
  }
  window.ResizeObserver = window.ResizeObserver || MockResizeObserver;

  // Provide synthetic dimensions so virtualizers can compute viewport row slices
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return 600;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get() {
      return 1000;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return 600;
    },
  });

  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get() {
      return 1000;
    },
  });

  Element.prototype.getBoundingClientRect = () => ({
    width: 1000,
    height: 600,
    top: 0,
    left: 0,
    bottom: 600,
    right: 1000,
    x: 0,
    y: 0,
    toJSON: () => {},
  });

  // Polyfill Range for CodeMirror in JSDOM
  if (typeof Range !== "undefined") {
    Range.prototype.getClientRects =
      Range.prototype.getClientRects || (() => [] as unknown as DOMRectList);
    Range.prototype.getBoundingClientRect =
      Range.prototype.getBoundingClientRect ||
      (() => ({
        width: 0,
        height: 0,
        top: 0,
        left: 0,
        bottom: 0,
        right: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      }));
  }

  // Mock matchMedia
  window.matchMedia =
    window.matchMedia ||
    (() => ({
      matches: false,
      media: "",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

  // Mock scrollTo and scrollIntoView
  window.scrollTo = window.scrollTo || (() => {});
  Element.prototype.scrollIntoView =
    Element.prototype.scrollIntoView || (() => {});

  // Mock HTMLAnchorElement click to prevent jsdom navigation error during file downloads
  if (typeof HTMLAnchorElement !== "undefined") {
    HTMLAnchorElement.prototype.click = () => {};
  }

  // Polyfill URL object URL creation for downloads and exports
  if (typeof window.URL.createObjectURL === "undefined") {
    window.URL.createObjectURL = () => "blob:mock-blob-url";
  }
  if (typeof window.URL.revokeObjectURL === "undefined") {
    window.URL.revokeObjectURL = () => {};
  }
}
