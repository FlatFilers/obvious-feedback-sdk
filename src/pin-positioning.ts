/**
 * Pure positioning helpers for the inline annotation feature.
 *
 * Pins are anchored in document space (or viewport space for fixed-position
 * source elements) so they remain glued to the element they reference as the
 * user scrolls or the page reflows.
 */

import {
  INLINE_POPUP_ELEMENT_GAP_PX,
  INLINE_POPUP_VIEWPORT_MARGIN_PX,
} from "./constants";

export interface PinRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PinAnchor {
  xPct: number;
  yPx: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export interface InlinePopupPlacement {
  /** Absolute left in document space (px). */
  left: number;
  /** Absolute top in document space (px). */
  top: number;
  /** Whether the popup landed above or below the element. */
  placement: "above" | "below";
  /**
   * Horizontal offset of the element's center relative to the popup's left
   * edge, used to position a connector/arrow.
   */
  arrowOffsetX: number;
}

/**
 * Compute the doc-space coordinates for a pin anchored at the center of an
 * element rect.
 *
 * When `isFixed` is true, `yPx` is left in viewport space so the pin layer
 * tracks the source element across scrolls (the pin layer renders fixed
 * pins with `position: fixed`).
 */
export function computePinAnchor(
  rect: PinRect,
  isFixed: boolean,
  innerWidth: number,
  scrollY: number,
): PinAnchor {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const safeWidth = innerWidth > 0 ? innerWidth : 1;
  const xPct = Math.max(0, Math.min(100, (centerX / safeWidth) * 100));
  const yPx = isFixed ? centerY : centerY + scrollY;
  return { xPct, yPx };
}

/**
 * Walk up the DOM detecting whether the element or any ancestor is
 * `position: fixed` (or `sticky` that's currently behaving as fixed). The
 * walk crosses shadow-root boundaries via `getRootNode().host`.
 */
export function isElementFixed(element: Element | null): boolean {
  let current: Element | null = element;
  const visited = new Set<Element>();
  while (current && !visited.has(current)) {
    visited.add(current);
    const view = current.ownerDocument?.defaultView ?? null;
    if (view) {
      const position = view.getComputedStyle(current).position;
      if (position === "fixed" || position === "sticky") {
        return true;
      }
    }
    const parent = current.parentElement;
    if (parent) {
      current = parent;
      continue;
    }
    const root = current.getRootNode();
    if (root instanceof ShadowRoot && root.host instanceof Element) {
      current = root.host;
      continue;
    }
    current = null;
  }
  return false;
}

/**
 * Decide where to render the inline annotation popup relative to an element
 * rect. The popup is centered horizontally over the element, then clamped to
 * the viewport. Vertically it prefers below the element, flipping above
 * when there isn't room.
 *
 * Returned coordinates are in document space (offset by scrollY) so the
 * popup can be positioned with `position: absolute; left; top` inside a
 * doc-anchored layer.
 */
export function computeInlinePopupPlacement(
  rect: PinRect,
  popupWidth: number,
  popupHeight: number,
  viewport: ViewportSize,
  scrollY: number,
  scrollX: number,
): InlinePopupPlacement {
  const elementCenterX = rect.left + rect.width / 2;
  const elementTopVp = rect.top;
  const elementBottomVp = rect.top + rect.height;

  const margin = INLINE_POPUP_VIEWPORT_MARGIN_PX;
  const gap = INLINE_POPUP_ELEMENT_GAP_PX;

  const spaceBelow = viewport.height - elementBottomVp;
  const spaceAbove = elementTopVp;
  const preferBelow = spaceBelow >= popupHeight + gap + margin;
  const preferAbove = spaceAbove >= popupHeight + gap + margin;

  let placement: "above" | "below";
  if (preferBelow) {
    placement = "below";
  } else if (preferAbove) {
    placement = "above";
  } else {
    placement = spaceBelow >= spaceAbove ? "below" : "above";
  }

  const minLeftVp = margin;
  const maxLeftVp = Math.max(margin, viewport.width - popupWidth - margin);
  let leftVp = elementCenterX - popupWidth / 2;
  leftVp = Math.min(maxLeftVp, Math.max(minLeftVp, leftVp));

  let topVp: number;
  if (placement === "below") {
    topVp = elementBottomVp + gap;
    const maxTopVp = viewport.height - popupHeight - margin;
    if (topVp > maxTopVp) {
      topVp = Math.max(margin, maxTopVp);
    }
  } else {
    topVp = elementTopVp - popupHeight - gap;
    if (topVp < margin) {
      topVp = margin;
    }
  }

  const arrowOffsetX = Math.max(
    8,
    Math.min(popupWidth - 8, elementCenterX - leftVp),
  );

  return {
    left: leftVp + scrollX,
    top: topVp + scrollY,
    placement,
    arrowOffsetX,
  };
}

/**
 * Re-resolve a pin's target element by selector, falling back to a cached
 * reference if the selector no longer matches. The fallback covers cases
 * where the host page swapped the element instance but the layout hasn't
 * moved (still a meaningful anchor).
 */
export function resolvePinElement(
  cssSelector: string,
  fallback: HTMLElement | null,
): HTMLElement | null {
  if (!cssSelector) {
    return fallback && fallback.isConnected ? fallback : null;
  }
  try {
    const match = document.querySelector(cssSelector);
    if (match instanceof HTMLElement) {
      return match;
    }
  } catch {
    // Invalid selector — fall through to the fallback.
  }
  return fallback && fallback.isConnected ? fallback : null;
}

/**
 * Walks through shadow roots so callers can find the deepest element under
 * a viewport point. Mirrors the behavior of well-known annotation libraries
 * that need to point at elements inside web-components.
 */
export function deepElementFromPoint(x: number, y: number): Element | null {
  if (typeof document.elementFromPoint !== "function") {
    return null;
  }
  let element: Element | null = document.elementFromPoint(x, y);
  const seen = new Set<Element>();
  while (element && element.shadowRoot && !seen.has(element)) {
    seen.add(element);
    const deeper = element.shadowRoot.elementFromPoint(x, y);
    if (!deeper || deeper === element) {
      break;
    }
    element = deeper;
  }
  return element;
}

/**
 * Same as `computePinAnchor` but driven by a viewport-space click point so
 * pins can be placed precisely where the user pointed rather than at the
 * element center.
 */
export function computePinAnchorFromPoint(
  clientX: number,
  clientY: number,
  isFixed: boolean,
  innerWidth: number,
  scrollY: number,
): PinAnchor {
  const safeWidth = innerWidth > 0 ? innerWidth : 1;
  const xPct = Math.max(0, Math.min(100, (clientX / safeWidth) * 100));
  const yPx = isFixed ? clientY : clientY + scrollY;
  return { xPct, yPx };
}
