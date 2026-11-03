import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installPageZoomGuards,
  shouldPreventPageZoom,
  type ZoomEventTarget,
} from "../disablePageZoom";

interface Registration {
  type: string;
  listener: EventListener;
  options?: boolean | AddEventListenerOptions;
}

class EventHost {
  registrations: Registration[] = [];

  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ) {
    this.registrations.push({ type, listener, options });
  }

  removeEventListener(type: string, listener: EventListener) {
    this.registrations = this.registrations.filter(
      (registration) =>
        registration.type !== type || registration.listener !== listener,
    );
  }

  dispatch(event: Event) {
    this.registrations
      .filter((registration) => registration.type === event.type)
      .forEach((registration) => registration.listener(event));
  }
}

function makeEvent(
  type: string,
  target: ZoomEventTarget | null,
  values: Record<string, unknown> = {},
) {
  return {
    type,
    target,
    ctrlKey: false,
    metaKey: false,
    preventDefault: vi.fn(),
    ...values,
  } as unknown as Event;
}

describe("page zoom gesture guard", () => {
  const windowHost = new EventHost();
  const documentHost = new EventHost();
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    windowHost.registrations = [];
    documentHost.registrations = [];
  });

  it("registers capture, non-passive wheel, gesture, touch, and keydown listeners on window and document", () => {
    cleanup = installPageZoomGuards(windowHost, documentHost);
    for (const host of [windowHost, documentHost]) {
      const wheel = host.registrations.find((entry) => entry.type === "wheel");
      expect(wheel?.options).toEqual({ passive: false, capture: true });

      const touchStart = host.registrations.find(
        (entry) => entry.type === "touchstart",
      );
      expect(touchStart?.options).toEqual({ passive: false, capture: true });

      const touchMove = host.registrations.find(
        (entry) => entry.type === "touchmove",
      );
      expect(touchMove?.options).toEqual({ passive: false, capture: true });

      const keydown = host.registrations.find(
        (entry) => entry.type === "keydown",
      );
      expect(keydown?.options).toEqual({ passive: false, capture: true });
    }
    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      const docGesture = documentHost.registrations.find(
        (entry) => entry.type === type,
      );
      expect(docGesture?.options).toEqual({ passive: false, capture: true });
      const winGesture = windowHost.registrations.find(
        (entry) => entry.type === type,
      );
      expect(winGesture?.options).toEqual({ passive: false, capture: true });
    }
  });

  it("installs idempotently and removes every listener", () => {
    cleanup = installPageZoomGuards(windowHost, documentHost);
    const secondCleanup = installPageZoomGuards(windowHost, documentHost);
    expect(secondCleanup).toBe(cleanup);
    expect(windowHost.registrations).toHaveLength(7);
    expect(documentHost.registrations).toHaveLength(7);
    cleanup();
    expect(windowHost.registrations).toHaveLength(0);
    expect(documentHost.registrations).toHaveLength(0);
  });

  it("prevents multi-touch pinch zoom and zoom shortcut keys", () => {
    cleanup = installPageZoomGuards(windowHost, documentHost);
    const multiTouch = makeEvent("touchmove", null, { touches: [{}, {}] });
    windowHost.dispatch(multiTouch);
    expect(multiTouch.preventDefault).toHaveBeenCalledOnce();

    const singleTouch = makeEvent("touchmove", null, { touches: [{}] });
    windowHost.dispatch(singleTouch);
    expect(singleTouch.preventDefault).not.toHaveBeenCalled();

    const zoomInKey = makeEvent("keydown", null, { ctrlKey: true, key: "+" });
    windowHost.dispatch(zoomInKey);
    expect(zoomInKey.preventDefault).toHaveBeenCalledOnce();
  });

  it("prevents ctrl/meta wheel and Safari gestures with preventDefault", () => {
    cleanup = installPageZoomGuards(windowHost, documentHost);
    const ctrlWheel = makeEvent("wheel", null, { ctrlKey: true });
    const metaWheel = makeEvent("wheel", null, { metaKey: true });
    windowHost.dispatch(ctrlWheel);
    documentHost.dispatch(metaWheel);
    expect(ctrlWheel.preventDefault).toHaveBeenCalledOnce();
    expect(metaWheel.preventDefault).toHaveBeenCalledOnce();

    for (const type of ["gesturestart", "gesturechange", "gestureend"]) {
      const event = makeEvent(type, null);
      documentHost.dispatch(event);
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
  });

  it("leaves ordinary scroll wheel events alone", () => {
    cleanup = installPageZoomGuards(windowHost, documentHost);
    const event = makeEvent("wheel", null, { ctrlKey: false, metaKey: false });
    documentHost.dispatch(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it.each(["app root", "data grid", "dialog", "admin panel"])(
    "does not allow page zoom over the %s",
    (surface) => {
      const target = {
        surface,
        closest: (selector: string) => {
          expect(selector).toBe("[data-allow-zoom], .react-flow");
          return null;
        },
      };
      expect(target.surface).toBe(surface);
      expect(shouldPreventPageZoom("wheel", true, false, target)).toBe(true);
    },
  );

  it("allows only explicitly marked/canvas targets to handle their own zoom", () => {
    const target = {
      closest: (selector: string) =>
        selector === "[data-allow-zoom], .react-flow" ? {} : null,
    };
    expect(shouldPreventPageZoom("wheel", true, false, target)).toBe(false);
    expect(shouldPreventPageZoom("gesturechange", false, false, target)).toBe(
      false,
    );
  });

  it("resets visual viewport when scale deviates from 1", () => {
    let metaContent = "width=device-width, initial-scale=1";
    const mockMeta = {
      setAttribute: (_name: string, val: string) => {
        metaContent = val;
      },
      getAttribute: () => metaContent,
    };

    const vpHost = new EventHost() as EventHost & { scale: number };
    vpHost.scale = 1.5;

    // Mock document.querySelector for node environment
    const originalDoc = (globalThis as unknown as { document?: unknown })
      .document;
    (globalThis as unknown as { document: unknown }).document = {
      querySelector: (selector: string) =>
        selector === 'meta[name="viewport"]' ? mockMeta : null,
    };

    cleanup = installPageZoomGuards(windowHost, documentHost, vpHost);
    const resizeReg = vpHost.registrations.find(
      (entry) => entry.type === "resize",
    );
    expect(resizeReg).toBeDefined();

    vpHost.dispatch(new Event("resize"));
    expect(metaContent).toContain("1.0001");

    cleanup();
    expect(vpHost.registrations).toHaveLength(0);

    (globalThis as unknown as { document: unknown }).document = originalDoc;
  });
});
