export type PageZoomEventType =
  | "wheel"
  | "gesturestart"
  | "gesturechange"
  | "gestureend"
  | "touchstart"
  | "touchmove"
  | "keydown";

export interface ZoomEventTarget {
  closest?: (selector: string) => unknown;
}

const ALLOW_ZOOM_SELECTOR = "[data-allow-zoom], .react-flow";

export interface EventHost {
  addEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListener,
    options?: boolean | EventListenerOptions,
  ): void;
}

let installedCleanup: (() => void) | null = null;

export function shouldPreventPageZoom(
  type: PageZoomEventType,
  ctrlKey: boolean,
  metaKey: boolean,
  target: ZoomEventTarget | null,
  options?: { touchesCount?: number; key?: string },
): boolean {
  if (target?.closest?.(ALLOW_ZOOM_SELECTOR)) return false;

  if (type === "wheel") {
    return ctrlKey || metaKey;
  }

  if (type === "touchstart" || type === "touchmove") {
    // Multi-touch gestures (e.g. 2-finger pinch-to-zoom on touchscreen or trackpad touch layer)
    return (options?.touchesCount ?? 0) > 1;
  }

  if (type === "keydown") {
    // Prevent browser zoom shortcuts like Ctrl/Cmd + Plus, Minus, Equals, 0
    if (!ctrlKey && !metaKey) return false;
    const key = options?.key;
    return (
      key === "+" ||
      key === "-" ||
      key === "=" ||
      key === "0" ||
      key === "NumpadAdd" ||
      key === "NumpadSubtract"
    );
  }

  // gesturestart, gesturechange, gestureend (Safari/WebKit)
  return true;
}

export function installPageZoomGuards(
  windowTarget: EventHost = window,
  documentTarget: EventHost = document,
): () => void {
  if (installedCleanup) return installedCleanup;

  const wheel: EventListener = (event) => {
    const wheelEvent = event as WheelEvent;
    if (
      shouldPreventPageZoom(
        "wheel",
        wheelEvent.ctrlKey,
        wheelEvent.metaKey,
        wheelEvent.target as ZoomEventTarget | null,
      )
    ) {
      event.preventDefault();
    }
  };

  const gesture: EventListener = (event) => {
    if (
      shouldPreventPageZoom(
        event.type as PageZoomEventType,
        false,
        false,
        event.target as ZoomEventTarget | null,
      )
    ) {
      event.preventDefault();
    }
  };

  const touch: EventListener = (event) => {
    const touchEvent = event as TouchEvent;
    const touchesCount = touchEvent.touches ? touchEvent.touches.length : 0;
    if (
      shouldPreventPageZoom(
        event.type as PageZoomEventType,
        false,
        false,
        event.target as ZoomEventTarget | null,
        { touchesCount },
      )
    ) {
      event.preventDefault();
    }
  };

  const keydown: EventListener = (event) => {
    const keyEvent = event as KeyboardEvent;
    if (
      shouldPreventPageZoom(
        "keydown",
        keyEvent.ctrlKey,
        keyEvent.metaKey,
        keyEvent.target as ZoomEventTarget | null,
        { key: keyEvent.key },
      )
    ) {
      event.preventDefault();
    }
  };

  const eventOptions = { passive: false, capture: true };

  windowTarget.addEventListener("wheel", wheel, eventOptions);
  documentTarget.addEventListener("wheel", wheel, eventOptions);
  windowTarget.addEventListener("gesturestart", gesture, eventOptions);
  documentTarget.addEventListener("gesturestart", gesture, eventOptions);
  windowTarget.addEventListener("gesturechange", gesture, eventOptions);
  documentTarget.addEventListener("gesturechange", gesture, eventOptions);
  windowTarget.addEventListener("gestureend", gesture, eventOptions);
  documentTarget.addEventListener("gestureend", gesture, eventOptions);
  windowTarget.addEventListener("touchstart", touch, eventOptions);
  documentTarget.addEventListener("touchstart", touch, eventOptions);
  windowTarget.addEventListener("touchmove", touch, eventOptions);
  documentTarget.addEventListener("touchmove", touch, eventOptions);
  windowTarget.addEventListener("keydown", keydown, eventOptions);
  documentTarget.addEventListener("keydown", keydown, eventOptions);

  let active = true;
  installedCleanup = () => {
    if (!active) return;
    active = false;
    windowTarget.removeEventListener("wheel", wheel, true);
    documentTarget.removeEventListener("wheel", wheel, true);
    windowTarget.removeEventListener("gesturestart", gesture, true);
    documentTarget.removeEventListener("gesturestart", gesture, true);
    windowTarget.removeEventListener("gesturechange", gesture, true);
    documentTarget.removeEventListener("gesturechange", gesture, true);
    windowTarget.removeEventListener("gestureend", gesture, true);
    documentTarget.removeEventListener("gestureend", gesture, true);
    windowTarget.removeEventListener("touchstart", touch, true);
    documentTarget.removeEventListener("touchstart", touch, true);
    windowTarget.removeEventListener("touchmove", touch, true);
    documentTarget.removeEventListener("touchmove", touch, true);
    windowTarget.removeEventListener("keydown", keydown, true);
    documentTarget.removeEventListener("keydown", keydown, true);
    installedCleanup = null;
  };
  return installedCleanup;
}
