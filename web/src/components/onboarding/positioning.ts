import type { CSSProperties } from "react";
import type { TourStep } from "./types";
import {
  TOOLTIP_WIDTH,
  ESTIMATED_TOOLTIP_HEIGHT,
  VIEWPORT_PADDING,
} from "./constants";

/**
 * Calculates optimal viewport coordinates for tour tooltip cards.
 */
export function getTooltipCoordinates(
  placement: TourStep["placement"],
  targetRect: DOMRect | null,
  viewportWidth: number,
  viewportHeight: number,
): CSSProperties {
  if (!targetRect) {
    return {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      zIndex: 9999,
      width: `${TOOLTIP_WIDTH}px`,
    };
  }

  let top = 0;
  let left = 0;

  switch (placement) {
    case "right":
      left = targetRect.right + VIEWPORT_PADDING;
      top = Math.min(
        Math.max(VIEWPORT_PADDING, targetRect.top),
        viewportHeight - ESTIMATED_TOOLTIP_HEIGHT - VIEWPORT_PADDING,
      );
      if (left + TOOLTIP_WIDTH > viewportWidth - VIEWPORT_PADDING) {
        left = Math.max(
          VIEWPORT_PADDING,
          targetRect.left - TOOLTIP_WIDTH - VIEWPORT_PADDING,
        );
      }
      break;

    case "bottom":
      left = Math.min(
        Math.max(
          VIEWPORT_PADDING,
          targetRect.left + (targetRect.width - TOOLTIP_WIDTH) / 2,
        ),
        viewportWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING,
      );
      top = targetRect.bottom + VIEWPORT_PADDING;
      if (top + ESTIMATED_TOOLTIP_HEIGHT > viewportHeight - VIEWPORT_PADDING) {
        top = Math.max(
          VIEWPORT_PADDING,
          targetRect.top - ESTIMATED_TOOLTIP_HEIGHT - VIEWPORT_PADDING,
        );
      }
      break;

    case "left":
      left = Math.max(
        VIEWPORT_PADDING,
        targetRect.left - TOOLTIP_WIDTH - VIEWPORT_PADDING,
      );
      top = Math.min(
        Math.max(VIEWPORT_PADDING, targetRect.top),
        viewportHeight - ESTIMATED_TOOLTIP_HEIGHT - VIEWPORT_PADDING,
      );
      break;

    case "top":
    default:
      left = Math.min(
        Math.max(
          VIEWPORT_PADDING,
          targetRect.left + (targetRect.width - TOOLTIP_WIDTH) / 2,
        ),
        viewportWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING,
      );
      top = Math.max(
        VIEWPORT_PADDING,
        targetRect.top - ESTIMATED_TOOLTIP_HEIGHT - VIEWPORT_PADDING,
      );
      break;
  }

  return {
    position: "fixed",
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 9999,
    width: `${TOOLTIP_WIDTH}px`,
  };
}
