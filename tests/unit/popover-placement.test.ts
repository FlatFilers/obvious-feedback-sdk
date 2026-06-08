import { describe, expect, it } from "bun:test";
import {
  placePopover,
  type PopoverPlacementRect,
  type PinViewport,
} from "../../src/widget/pin-overlay";

const VIEWPORT: PinViewport = {
  scrollX: 0,
  scrollY: 0,
  innerWidth: 1200,
  innerHeight: 800,
};

const POPOVER = {
  popoverWidth: 340,
  popoverHeight: 400,
  gap: 12,
  margin: 12,
} as const;

function rect(
  left: number,
  top: number,
  width: number,
  height: number,
): PopoverPlacementRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
}

describe("placePopover", () => {
  it("places the popover to the right of the element when there is room", () => {
    const placement = placePopover({
      elementRect: rect(200, 200, 100, 40),
      fallbackPoint: { x: 0, y: 0 },
      viewport: VIEWPORT,
      ...POPOVER,
    });
    expect(placement.left).toBe(200 + 100 + POPOVER.gap);
    expect(placement.top).toBe(200);
  });

  it("flips left when the element sits near the right edge", () => {
    const placement = placePopover({
      elementRect: rect(VIEWPORT.innerWidth - 200, 100, 100, 40),
      fallbackPoint: { x: 0, y: 0 },
      viewport: VIEWPORT,
      ...POPOVER,
    });
    expect(placement.left).toBe(
      VIEWPORT.innerWidth - 200 - POPOVER.gap - POPOVER.popoverWidth,
    );
  });

  it("places the popover below when the element fills horizontally", () => {
    const placement = placePopover({
      elementRect: rect(0, 100, VIEWPORT.innerWidth, 80),
      fallbackPoint: { x: 0, y: 0 },
      viewport: VIEWPORT,
      ...POPOVER,
    });
    expect(placement.top).toBe(100 + 80 + POPOVER.gap);
  });

  it("places the popover above when there is no room below or to the sides", () => {
    const placement = placePopover({
      elementRect: rect(
        0,
        VIEWPORT.innerHeight - 200,
        VIEWPORT.innerWidth,
        180,
      ),
      fallbackPoint: { x: 0, y: 0 },
      viewport: VIEWPORT,
      ...POPOVER,
    });
    expect(placement.top).toBe(
      VIEWPORT.innerHeight - 200 - POPOVER.gap - POPOVER.popoverHeight,
    );
  });

  it("falls back to a viewport corner when the element fills the screen", () => {
    const placement = placePopover({
      elementRect: rect(0, 0, VIEWPORT.innerWidth, VIEWPORT.innerHeight),
      fallbackPoint: { x: 0, y: 0 },
      viewport: VIEWPORT,
      ...POPOVER,
    });
    expect(placement.left).toBeGreaterThanOrEqual(POPOVER.margin);
    expect(placement.top).toBeGreaterThanOrEqual(POPOVER.margin);
    const popoverRight = placement.left + POPOVER.popoverWidth;
    const popoverBottom = placement.top + POPOVER.popoverHeight;
    expect(popoverRight).toBeLessThanOrEqual(VIEWPORT.innerWidth);
    expect(popoverBottom).toBeLessThanOrEqual(VIEWPORT.innerHeight);
  });

  it("uses the fallback anchor when no element rect is available", () => {
    const placement = placePopover({
      elementRect: null,
      fallbackPoint: { x: 100, y: 200 },
      viewport: VIEWPORT,
      ...POPOVER,
    });
    expect(placement.left).toBe(100 + POPOVER.gap);
    expect(placement.top).toBe(200 + POPOVER.gap);
  });

  it("never returns a placement that overlaps a normally-sized element", () => {
    const elementRect = rect(400, 300, 200, 80);
    const placement = placePopover({
      elementRect,
      fallbackPoint: { x: 0, y: 0 },
      viewport: VIEWPORT,
      ...POPOVER,
    });
    const popoverRect = {
      left: placement.left,
      top: placement.top,
      right: placement.left + POPOVER.popoverWidth,
      bottom: placement.top + POPOVER.popoverHeight,
    };
    const overlaps =
      popoverRect.left < elementRect.right &&
      popoverRect.right > elementRect.left &&
      popoverRect.top < elementRect.bottom &&
      popoverRect.bottom > elementRect.top;
    expect(overlaps).toBe(false);
  });
});
