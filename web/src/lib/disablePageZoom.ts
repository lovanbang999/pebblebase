export type PageZoomEventType =
  "wheel" | "gesturestart" | "gesturechange" | "gestureend";

export interface ZoomEventTarget {
  closest?: (selector: string) => unknown;
}

const ALLOW_ZOOM_SELECTOR = "[data-allow-zoom], .react-flow";
interface EventHost {
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
): boolean {
  if (target?.closest?.(ALLOW_ZOOM_SELECTOR)) return false;
  if (type === "wheel") return ctrlKey || metaKey;
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
    )
      event.preventDefault();
  };
  const gesture: EventListener = (event) => {
    if (
      shouldPreventPageZoom(
        event.type as PageZoomEventType,
        false,
        false,
        event.target as ZoomEventTarget | null,
      )
    )
      event.preventDefault();
  };

  const eventOptions = { passive: false, capture: true };
  windowTarget.addEventListener("wheel", wheel, eventOptions);
  documentTarget.addEventListener("wheel", wheel, eventOptions);
  documentTarget.addEventListener("gesturestart", gesture, eventOptions);
  documentTarget.addEventListener("gesturechange", gesture, eventOptions);
  documentTarget.addEventListener("gestureend", gesture, eventOptions);

  let active = true;
  installedCleanup = () => {
    if (!active) return;
    active = false;
    windowTarget.removeEventListener("wheel", wheel, true);
    documentTarget.removeEventListener("wheel", wheel, true);
    documentTarget.removeEventListener("gesturestart", gesture, true);
    documentTarget.removeEventListener("gesturechange", gesture, true);
    documentTarget.removeEventListener("gestureend", gesture, true);
    installedCleanup = null;
  };
  return installedCleanup;
}
