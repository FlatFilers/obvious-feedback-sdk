import {
  DEFAULT_TRIGGER_SIZE_PX,
  FEEDBACK_CARD_MAX_WIDTH_PX,
  FEEDBACK_CARD_VIEWPORT_MARGIN_PX,
  TRIGGER_DOCK_OVERSCROLL_PX,
  TRIGGER_HIDDEN_PEEK_PX,
  TRIGGER_POSITION_STORAGE_KEY,
  TRIGGER_VIEWPORT_MARGIN_PX,
} from "../constants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type FeedbackTriggerCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type FeedbackTriggerDockSide = "left" | "right" | "top" | "bottom";

export interface FeedbackTriggerPosition {
  corner: FeedbackTriggerCorner;
  offsetX: number;
  offsetY: number;
  hidden?: boolean;
  dockSide?: FeedbackTriggerDockSide;
  dockOffset?: number;
}

export interface FeedbackTriggerDragState {
  initialPosition: FeedbackTriggerPosition;

  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLeft: number;
  startTop: number;
  moved: boolean;
}

export function parseFeedbackTriggerCorner(
  value: unknown,
): FeedbackTriggerCorner | null {
  if (
    value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
  ) {
    return value;
  }
  return null;
}

export function parseFeedbackTriggerDockSide(
  value: unknown,
): FeedbackTriggerDockSide | null {
  if (
    value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom"
  ) {
    return value;
  }
  return null;
}

export function createFeedbackTriggerCorner(
  verticalCorner: "top" | "bottom",
  horizontalCorner: "left" | "right",
): FeedbackTriggerCorner {
  if (verticalCorner === "top") {
    return horizontalCorner === "left" ? "top-left" : "top-right";
  }
  return horizontalCorner === "left" ? "bottom-left" : "bottom-right";
}

export function createFeedbackCardDirection(
  opensDown: boolean,
  opensRight: boolean,
): FeedbackCardPlacement["direction"] {
  if (opensDown) {
    return opensRight ? "down-right" : "down-left";
  }
  return opensRight ? "up-right" : "up-left";
}

interface FeedbackViewportBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function getViewportBounds(): FeedbackViewportBounds {
  // Use the layout viewport (clientWidth/clientHeight) for trigger positioning.
  // Unlike visualViewport.width/height, layout viewport dimensions are stable across
  // browser zoom levels (Ctrl+/Ctrl-), preventing the button from drifting on zoom.
  // visualViewport offsets are preserved for mobile pinch-zoom scenarios.
  const visualViewport = window.visualViewport;
  const width = Math.max(
    document.documentElement?.clientWidth ?? window.innerWidth ?? 0,
    DEFAULT_TRIGGER_SIZE_PX + TRIGGER_VIEWPORT_MARGIN_PX * 2,
  );
  const height = Math.max(
    document.documentElement?.clientHeight ?? window.innerHeight ?? 0,
    DEFAULT_TRIGGER_SIZE_PX + TRIGGER_VIEWPORT_MARGIN_PX * 2,
  );
  return {
    left: visualViewport?.offsetLeft ?? 0,
    top: visualViewport?.offsetTop ?? 0,
    width,
    height,
  };
}

export function getViewportSize(): { width: number; height: number } {
  const viewport = getViewportBounds();
  return { width: viewport.width, height: viewport.height };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getFallbackTriggerPosition(
  assistantPosition: FeedbackTriggerCorner,
): FeedbackTriggerPosition {
  return {
    corner: assistantPosition,
    offsetX: 20,
    offsetY: 96,
  };
}

export function parseStoredTriggerPosition(): FeedbackTriggerPosition | null {
  try {
    const rawValue = window.localStorage?.getItem(TRIGGER_POSITION_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }
    const parsed = JSON.parse(rawValue);
    if (!isRecord(parsed)) {
      return null;
    }
    const corner = parseFeedbackTriggerCorner(parsed.corner);
    if (!corner) {
      return null;
    }
    const offsetX = Number(parsed.offsetX);
    const offsetY = Number(parsed.offsetY);
    if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY)) {
      return null;
    }
    const dockSide =
      parseFeedbackTriggerDockSide(parsed.dockSide) ??
      (parsed.hidden === true
        ? corner.endsWith("left")
          ? "left"
          : "right"
        : null);
    const dockOffset = Number(parsed.dockOffset);
    return {
      corner,
      offsetX,
      offsetY,
      hidden: parsed.hidden === true || dockSide !== null,
      dockSide: dockSide ?? undefined,
      dockOffset: dockSide
        ? Number.isFinite(dockOffset)
          ? dockOffset
          : offsetY
        : undefined,
    };
  } catch {
    return null;
  }
}

export function persistTriggerPosition(position: FeedbackTriggerPosition): void {
  try {
    window.localStorage?.setItem(
      TRIGGER_POSITION_STORAGE_KEY,
      JSON.stringify(position),
    );
  } catch {
    // localStorage may be unavailable in embedded or privacy-restricted contexts.
  }
}

export function clampTriggerPosition(
  position: FeedbackTriggerPosition,
): FeedbackTriggerPosition {
  const viewport = getViewportSize();
  return {
    corner: position.corner,
    offsetX: clamp(
      position.offsetX,
      TRIGGER_VIEWPORT_MARGIN_PX,
      viewport.width - DEFAULT_TRIGGER_SIZE_PX - TRIGGER_VIEWPORT_MARGIN_PX,
    ),
    offsetY: clamp(
      position.offsetY,
      TRIGGER_VIEWPORT_MARGIN_PX,
      viewport.height - DEFAULT_TRIGGER_SIZE_PX - TRIGGER_VIEWPORT_MARGIN_PX,
    ),
    hidden: position.hidden,
    dockSide: position.dockSide,
    dockOffset:
      typeof position.dockOffset === "number"
        ? clamp(
            position.dockOffset,
            0,
            position.dockSide === "top" || position.dockSide === "bottom"
              ? viewport.width - DEFAULT_TRIGGER_SIZE_PX
              : viewport.height - DEFAULT_TRIGGER_SIZE_PX,
          )
        : undefined,
  };
}

export function positionToViewportPoint(position: FeedbackTriggerPosition): {
  left: number;
  top: number;
} {
  const viewport = getViewportSize();
  const clamped = clampTriggerPosition(position);
  return {
    left: clamped.corner.endsWith("left")
      ? clamped.offsetX
      : viewport.width - DEFAULT_TRIGGER_SIZE_PX - clamped.offsetX,
    top: clamped.corner.startsWith("top")
      ? clamped.offsetY
      : viewport.height - DEFAULT_TRIGGER_SIZE_PX - clamped.offsetY,
  };
}

export function viewportPointToNearestCorner(
  left: number,
  top: number,
): FeedbackTriggerPosition {
  const viewport = getViewportSize();
  const clampedLeft = clamp(
    left,
    TRIGGER_VIEWPORT_MARGIN_PX,
    viewport.width - DEFAULT_TRIGGER_SIZE_PX - TRIGGER_VIEWPORT_MARGIN_PX,
  );
  const clampedTop = clamp(
    top,
    TRIGGER_VIEWPORT_MARGIN_PX,
    viewport.height - DEFAULT_TRIGGER_SIZE_PX - TRIGGER_VIEWPORT_MARGIN_PX,
  );
  const horizontalCorner =
    clampedLeft + DEFAULT_TRIGGER_SIZE_PX / 2 <= viewport.width / 2
      ? "left"
      : "right";
  const verticalCorner =
    clampedTop + DEFAULT_TRIGGER_SIZE_PX / 2 <= viewport.height / 2
      ? "top"
      : "bottom";
  return {
    corner: createFeedbackTriggerCorner(verticalCorner, horizontalCorner),
    offsetX:
      horizontalCorner === "left"
        ? clampedLeft
        : viewport.width - DEFAULT_TRIGGER_SIZE_PX - clampedLeft,
    offsetY:
      verticalCorner === "top"
        ? clampedTop
        : viewport.height - DEFAULT_TRIGGER_SIZE_PX - clampedTop,
  };
}

export function createTriggerDragPoint(left: number, top: number): {
  left: number;
  top: number;
} {
  const viewport = getViewportSize();
  return {
    left: clamp(
      left,
      -TRIGGER_DOCK_OVERSCROLL_PX,
      viewport.width - DEFAULT_TRIGGER_SIZE_PX + TRIGGER_DOCK_OVERSCROLL_PX,
    ),
    top: clamp(
      top,
      -TRIGGER_DOCK_OVERSCROLL_PX,
      viewport.height - DEFAULT_TRIGGER_SIZE_PX + TRIGGER_DOCK_OVERSCROLL_PX,
    ),
  };
}

export function getDockSideForRect(
  rect: FeedbackAnchorRect,
  preferredSide?: FeedbackTriggerDockSide,
): FeedbackTriggerDockSide | null {
  const viewport = getViewportSize();
  const candidates: Array<{ side: FeedbackTriggerDockSide; distance: number }> =
    [
      { side: "left", distance: Math.max(0, -rect.left) },
      {
        side: "right",
        distance: Math.max(0, rect.left + rect.width - viewport.width),
      },
      { side: "top", distance: Math.max(0, -rect.top) },
      {
        side: "bottom",
        distance: Math.max(0, rect.top + rect.height - viewport.height),
      },
    ];
  let best: { side: FeedbackTriggerDockSide; distance: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.distance <= 0) {
      continue;
    }
    if (
      best &&
      preferredSide === candidate.side &&
      best.distance - candidate.distance <= TRIGGER_DOCK_OVERSCROLL_PX / 4
    ) {
      best = candidate;
      continue;
    }
    if (!best || candidate.distance > best.distance) {
      best = candidate;
    }
  }
  return best?.side ?? null;
}

export function createDockedTriggerPosition(
  rect: FeedbackAnchorRect,
  dockSide: FeedbackTriggerDockSide,
): FeedbackTriggerPosition {
  const viewport = getViewportSize();
  const dockOffset =
    dockSide === "top" || dockSide === "bottom"
      ? clamp(rect.left, 0, viewport.width - DEFAULT_TRIGGER_SIZE_PX)
      : clamp(rect.top, 0, viewport.height - DEFAULT_TRIGGER_SIZE_PX);
  const visibleLeft =
    dockSide === "left"
      ? TRIGGER_VIEWPORT_MARGIN_PX
      : dockSide === "right"
        ? viewport.width - DEFAULT_TRIGGER_SIZE_PX - TRIGGER_VIEWPORT_MARGIN_PX
        : dockOffset;
  const visibleTop =
    dockSide === "top"
      ? TRIGGER_VIEWPORT_MARGIN_PX
      : dockSide === "bottom"
        ? viewport.height - DEFAULT_TRIGGER_SIZE_PX - TRIGGER_VIEWPORT_MARGIN_PX
        : dockOffset;
  const base = viewportPointToNearestCorner(visibleLeft, visibleTop);
  return {
    corner: base.corner,
    offsetX: base.offsetX,
    offsetY: base.offsetY,
    hidden: true,
    dockSide,
    dockOffset,
  };
}

export function isPointerInTriggerPeekZone(
  point: { x: number; y: number },
  position: FeedbackTriggerPosition,
): boolean {
  if (!position.dockSide || typeof position.dockOffset !== "number") {
    return false;
  }
  const viewport = getViewportSize();
  const edgeSize = DEFAULT_TRIGGER_SIZE_PX * 2;
  const axisHalfSize = DEFAULT_TRIGGER_SIZE_PX;
  if (position.dockSide === "left" || position.dockSide === "right") {
    const centerY = position.dockOffset + DEFAULT_TRIGGER_SIZE_PX / 2;
    const inHorizontalZone =
      position.dockSide === "left"
        ? point.x <= edgeSize
        : point.x >= viewport.width - edgeSize;
    return inHorizontalZone && Math.abs(point.y - centerY) <= axisHalfSize;
  }
  const centerX = position.dockOffset + DEFAULT_TRIGGER_SIZE_PX / 2;
  const inVerticalZone =
    position.dockSide === "top"
      ? point.y <= edgeSize
      : point.y >= viewport.height - edgeSize;
  return inVerticalZone && Math.abs(point.x - centerX) <= axisHalfSize;
}

export interface FeedbackAnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface FeedbackCardPlacement {
  direction: "down-left" | "down-right" | "up-left" | "up-right";
  style: string;
}

export function getFallbackTriggerRect(
  position: FeedbackTriggerPosition,
): FeedbackAnchorRect {
  const point = positionToViewportPoint(position);
  return {
    left: point.left,
    top: point.top,
    width: DEFAULT_TRIGGER_SIZE_PX,
    height: DEFAULT_TRIGGER_SIZE_PX,
  };
}

export function getTriggerAnchorRect(
  trigger: Element | null,
  position: FeedbackTriggerPosition,
): FeedbackAnchorRect {
  const rect =
    typeof trigger?.getBoundingClientRect === "function"
      ? trigger.getBoundingClientRect()
      : null;
  if (
    rect &&
    Number.isFinite(rect.left) &&
    Number.isFinite(rect.top) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    rect.width > 0 &&
    rect.height > 0
  ) {
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }
  return getFallbackTriggerRect(position);
}

export function createFeedbackCardPlacement(
  trigger: Element | null,
  position: FeedbackTriggerPosition,
  estimatedHeight: number,
  measuredSize?: { width: number; height: number },
): FeedbackCardPlacement {
  const viewport = getViewportBounds();
  const triggerRect = getTriggerAnchorRect(trigger, position);
  const viewportLeft = viewport.left + FEEDBACK_CARD_VIEWPORT_MARGIN_PX;
  const viewportTop = viewport.top + FEEDBACK_CARD_VIEWPORT_MARGIN_PX;
  const viewportRight =
    viewport.left + viewport.width - FEEDBACK_CARD_VIEWPORT_MARGIN_PX;
  const viewportBottom =
    viewport.top + viewport.height - FEEDBACK_CARD_VIEWPORT_MARGIN_PX;
  const cardWidth = Math.min(
    measuredSize?.width && measuredSize.width > 0
      ? measuredSize.width
      : FEEDBACK_CARD_MAX_WIDTH_PX,
    Math.max(1, viewport.width - FEEDBACK_CARD_VIEWPORT_MARGIN_PX * 2),
  );
  const cardHeight = Math.min(
    measuredSize?.height && measuredSize.height > 0
      ? measuredSize.height
      : estimatedHeight,
    Math.max(1, viewport.height - FEEDBACK_CARD_VIEWPORT_MARGIN_PX * 2),
  );
  // Card anchors one of its corners to the trigger's bounding rect so that
  // the trigger physically sits at the corner of the card (acting as the
  // close X). spaceRight/spaceLeft/spaceBelow/spaceAbove are measured from the
  // trigger anchor edges instead of subtracting a gap.
  const spaceRight = viewportRight - triggerRect.left;
  const spaceLeft = triggerRect.left + triggerRect.width - viewportLeft;
  const spaceBelow = viewportBottom - triggerRect.top;
  const spaceAbove = triggerRect.top + triggerRect.height - viewportTop;
  const opensRight = spaceRight >= cardWidth || spaceRight >= spaceLeft;
  const opensDown = spaceBelow >= cardHeight || spaceBelow >= spaceAbove;
  const rawLeft = opensRight
    ? triggerRect.left
    : triggerRect.left + triggerRect.width - cardWidth;
  const rawTop = opensDown
    ? triggerRect.top
    : triggerRect.top + triggerRect.height - cardHeight;
  const maxLeft = Math.max(viewportLeft, viewportRight - cardWidth);
  const maxTop = Math.max(viewportTop, viewportBottom - cardHeight);
  const left = clamp(rawLeft, viewportLeft, maxLeft);
  const top = clamp(rawTop, viewportTop, maxTop);
  const direction = createFeedbackCardDirection(opensDown, opensRight);

  return {
    direction,
    style: `left: ${Math.round(left)}px; top: ${Math.round(top)}px; right: auto; bottom: auto;`,
  };
}

export function createTriggerPositionStyle(position: FeedbackTriggerPosition): string {
  if (position.hidden && position.dockSide) {
    const viewport = getViewportSize();
    const dockOffset =
      typeof position.dockOffset === "number" ? position.dockOffset : 0;
    const left =
      position.dockSide === "left"
        ? TRIGGER_HIDDEN_PEEK_PX - DEFAULT_TRIGGER_SIZE_PX
        : position.dockSide === "right"
          ? viewport.width - TRIGGER_HIDDEN_PEEK_PX
          : clamp(dockOffset, 0, viewport.width - DEFAULT_TRIGGER_SIZE_PX);
    const top =
      position.dockSide === "top"
        ? TRIGGER_HIDDEN_PEEK_PX - DEFAULT_TRIGGER_SIZE_PX
        : position.dockSide === "bottom"
          ? viewport.height - TRIGGER_HIDDEN_PEEK_PX
          : clamp(dockOffset, 0, viewport.height - DEFAULT_TRIGGER_SIZE_PX);
    return `left: ${Math.round(left)}px; top: ${Math.round(top)}px; right: auto; bottom: auto;`;
  }
  const point = positionToViewportPoint(position);
  return `left: ${Math.round(point.left)}px; top: ${Math.round(point.top)}px; right: auto; bottom: auto;`;
}

