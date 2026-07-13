/**
 * Reusable drag controller for SDK overlays. Tracks pointer down/move/up on a
 * drag surface, applies translate3d to a target element, clamps the result
 * to stay inside the viewport, and optionally persists the final position to
 * localStorage so the user's choice survives reloads.
 */

export interface DraggablePosition {
  x: number;
  y: number;
}

/** The viewport corner a persisted position is measured from. */
export type AnchorCorner =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

/**
 * Persisted position model. Instead of absolute translate offsets from the
 * top-left origin (which strand the element mid-screen when the viewport grows),
 * we store the distance from the element's *nearest* corner. On resize we
 * recompute the absolute position from this anchor so the element keeps its
 * distance from that corner, then clamp it on-screen.
 */
export interface StoredAnchorPosition {
  anchorCorner: AnchorCorner;
  /** Distance in px from the anchored corner's horizontal (left/right) edge. */
  offsetX: number;
  /** Distance in px from the anchored corner's vertical (top/bottom) edge. */
  offsetY: number;
}

export interface DraggableOptions {
  /** The element that will be moved. */
  target: HTMLElement;
  /** The element that captures pointerdown to start the drag. */
  handle: HTMLElement;
  /** Optional initial position; otherwise the element keeps its current rect. */
  initialPosition?: DraggablePosition;
  /** Pixels to keep between the target and the viewport edges when clamping. */
  viewportMargin?: number;
  /** localStorage key to persist final position. Omit to disable persistence. */
  storageKey?: string;
  /** Drag threshold in pixels before a click is treated as a drag. */
  dragThreshold?: number;
  /** Called when the drag begins (after threshold is exceeded). */
  onDragStart?: () => void;
  /** Called continuously during drag with the live clamped position. */
  onDragMove?: (position: DraggablePosition, info: DraggableMoveInfo) => void;
  /** Called when the pointer is released and the position is committed. */
  onDragEnd?: (position: DraggablePosition, info: DraggableMoveInfo) => void;
}

export interface DraggableMoveInfo {
  /** Unclamped position implied by pointer movement. */
  rawPosition: DraggablePosition;
  /** Positive when the pointer has dragged below the clamped viewport edge. */
  overflowY: number;
}

export interface DraggableHandle {
  /** Programmatically set the position and clamp it. */
  setPosition: (position: DraggablePosition) => void;
  /** Returns the current applied position. */
  getPosition: () => DraggablePosition;
  /** Re-applies clamp against the current viewport (call from a resize listener). */
  reclamp: () => void;
  /** Returns true if a drag is currently in progress. */
  isDragging: () => boolean;
  /**
   * Replace the handle element. Useful when the host re-renders the toolbar's
   * shadow DOM and the previous drag handle node has been detached. The
   * controller cancels any in-flight drag and rebinds listeners to the new
   * handle.
   */
  setHandle: (nextHandle: HTMLElement) => void;
  /** Tear down all listeners. */
  destroy: () => void;
}

interface DragState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startPosition: DraggablePosition;
  lastRawPosition: DraggablePosition;
  hasMovedPastThreshold: boolean;
  captureTarget: HTMLElement;
}

const DEFAULT_VIEWPORT_MARGIN_PX = 12;
const DEFAULT_DRAG_THRESHOLD_PX = 4;

export function createDraggable(options: DraggableOptions): DraggableHandle {
  const viewportMargin = options.viewportMargin ?? DEFAULT_VIEWPORT_MARGIN_PX;
  const dragThreshold = options.dragThreshold ?? DEFAULT_DRAG_THRESHOLD_PX;

  // Persistence source of truth: the corner anchor the user committed to. It is
  // established here (from storage, a migrated legacy value, or the caller's
  // default) and recomputed on every user-driven commit (drag-end/setPosition).
  let anchor: StoredAnchorPosition | null = null;
  let position: DraggablePosition = initializePosition();

  function initializePosition(): DraggablePosition {
    const stored = parseStoredPosition(options.storageKey);
    // A stored corner anchor always wins over the caller's default so a
    // persisted position is actually restored on reload (previously dead code:
    // initialPosition was always passed, so the stored branch never ran).
    if (stored?.kind === "anchor") {
      anchor = stored.anchor;
      return clampPositionForElement(
        resolvePositionFromAnchor(anchor, options.target),
        options.target,
        viewportMargin,
      );
    }
    // Otherwise seed from a migrated legacy absolute value, else the caller's
    // default placement, else the origin. Either way we derive an anchor so
    // future resizes keep the element's distance from its nearest corner.
    const seed =
      stored?.kind === "legacy"
        ? stored.position
        : options.initialPosition ?? { x: 0, y: 0 };
    const next = clampPositionForElement(seed, options.target, viewportMargin);
    anchor = resolveAnchorFromPosition(next, options.target);
    if (stored?.kind === "legacy") {
      // Upgrade the persisted value from the old absolute format in place.
      writeStoredAnchor(options.storageKey, anchor);
    }
    return next;
  }

  let dragState: DragState | null = null;
  let isDestroyed = false;
  let handle = options.handle;
  let suppressNextClick = false;

  applyPosition(options.target, position);

  function handlePointerDown(event: PointerEvent): void {
    if (isDestroyed || event.button !== 0) {
      return;
    }
    if (!event.isPrimary) {
      return;
    }
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: { ...position },
      lastRawPosition: { ...position },
      hasMovedPastThreshold: false,
      captureTarget: handle,
    };
    attachWindowDragListeners();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (isDestroyed || !dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const deltaX = event.clientX - dragState.startClientX;
    const deltaY = event.clientY - dragState.startClientY;
    if (
      !dragState.hasMovedPastThreshold &&
      (Math.abs(deltaX) > dragThreshold || Math.abs(deltaY) > dragThreshold)
    ) {
      dragState.hasMovedPastThreshold = true;
      dragState.captureTarget.setPointerCapture?.(event.pointerId);
      options.onDragStart?.();
    }
    if (!dragState.hasMovedPastThreshold) {
      return;
    }
    event.preventDefault();
    const rawPosition = {
      x: dragState.startPosition.x + deltaX,
      y: dragState.startPosition.y + deltaY,
    };
    dragState.lastRawPosition = rawPosition;
    const next = clampPositionForElement(rawPosition, options.target, viewportMargin);
    position = next;
    applyPosition(options.target, position);
    options.onDragMove?.(position, getMoveInfo(rawPosition, position));
  }

  function handlePointerUp(event: PointerEvent): void {
    if (isDestroyed || !dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const wasDragging = dragState.hasMovedPastThreshold;
    const captureTarget = dragState.captureTarget;
    const lastRawPosition = dragState.lastRawPosition;
    dragState = null;
    detachWindowDragListeners();
    captureTarget.releasePointerCapture?.(event.pointerId);
    if (wasDragging) {
      suppressNextClick = true;
      window.setTimeout(() => {
        suppressNextClick = false;
      }, 0);
      // Re-derive the anchor from where the user dropped it (nearest corner +
      // edge offsets) and persist that, so a resize re-anchors instead of
      // stranding the element at stale absolute coordinates.
      anchor = resolveAnchorFromPosition(position, options.target);
      writeStoredAnchor(options.storageKey, anchor);
      options.onDragEnd?.(position, getMoveInfo(lastRawPosition, position));
    }
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const captureTarget = dragState.captureTarget;
    dragState = null;
    detachWindowDragListeners();
    captureTarget.releasePointerCapture?.(event.pointerId);
  }

  function handleClick(event: MouseEvent): void {
    if (!suppressNextClick) {
      return;
    }
    suppressNextClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function attachHandleListeners(target: HTMLElement): void {
    target.addEventListener("pointerdown", handlePointerDown);
    target.addEventListener("click", handleClick, { capture: true });
  }

  function detachHandleListeners(target: HTMLElement): void {
    target.removeEventListener("pointerdown", handlePointerDown);
    target.removeEventListener("click", handleClick, { capture: true });
  }

  function attachWindowDragListeners(): void {
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
  }

  function detachWindowDragListeners(): void {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    window.removeEventListener("pointercancel", handlePointerCancel);
  }

  attachHandleListeners(handle);

  return {
    setPosition(next) {
      position = clampPositionForElement(next, options.target, viewportMargin);
      anchor = resolveAnchorFromPosition(position, options.target);
      applyPosition(options.target, position);
      writeStoredAnchor(options.storageKey, anchor);
    },
    getPosition() {
      return { ...position };
    },
    reclamp() {
      // Recompute the absolute position from the committed corner anchor so the
      // element keeps its distance from that corner as the viewport changes
      // size (fixes the grow case where it used to be stranded mid-screen),
      // then clamp to stay fully on-screen (preserves the shrink case). The
      // anchor itself is the user's intent and is left untouched, so growing
      // back restores the original placement.
      const target = anchor
        ? resolvePositionFromAnchor(anchor, options.target)
        : position;
      const next = clampPositionForElement(target, options.target, viewportMargin);
      if (next.x !== position.x || next.y !== position.y) {
        position = next;
        applyPosition(options.target, position);
      }
    },
    isDragging() {
      return dragState?.hasMovedPastThreshold === true;
    },
    setHandle(nextHandle) {
      if (isDestroyed || nextHandle === handle) {
        return;
      }
      detachHandleListeners(handle);
      detachWindowDragListeners();
      dragState = null;
      handle = nextHandle;
      attachHandleListeners(handle);
    },
    destroy() {
      if (isDestroyed) {
        return;
      }
      isDestroyed = true;
      dragState = null;
      detachWindowDragListeners();
      detachHandleListeners(handle);
    },
  };
}

function applyPosition(target: HTMLElement, position: DraggablePosition): void {
  target.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
}

function getMoveInfo(
  rawPosition: DraggablePosition,
  clampedPosition: DraggablePosition,
): DraggableMoveInfo {
  return {
    rawPosition: { ...rawPosition },
    overflowY: Math.max(0, rawPosition.y - clampedPosition.y),
  };
}

function clampPositionForElement(
  position: DraggablePosition,
  element: HTMLElement,
  viewportMargin: number,
): DraggablePosition {
  if (typeof window === "undefined") {
    return position;
  }
  const rect = element.getBoundingClientRect();
  const baseLeft = rect.left - getCurrentTranslateX(element);
  const baseTop = rect.top - getCurrentTranslateY(element);
  const minX = viewportMargin - baseLeft;
  const maxX = window.innerWidth - rect.width - viewportMargin - baseLeft;
  const minY = viewportMargin - baseTop;
  const maxY = window.innerHeight - rect.height - viewportMargin - baseTop;
  return {
    x: clamp(position.x, minX, Math.max(minX, maxX)),
    y: clamp(position.y, minY, Math.max(minY, maxY)),
  };
}

function getCurrentTranslateX(element: HTMLElement): number {
  const match = element.style.transform.match(/translate3d\((-?\d+(?:\.\d+)?)px,/);
  return match ? Number.parseFloat(match[1] ?? "0") : 0;
}

function getCurrentTranslateY(element: HTMLElement): number {
  const match = element.style.transform.match(
    /translate3d\(-?\d+(?:\.\d+)?px,\s*(-?\d+(?:\.\d+)?)px,/,
  );
  return match ? Number.parseFloat(match[1] ?? "0") : 0;
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
}

interface ElementGeometry {
  /** Viewport left of the element when its translate offset is (0, 0). */
  baseLeft: number;
  /** Viewport top of the element when its translate offset is (0, 0). */
  baseTop: number;
  width: number;
  height: number;
}

/**
 * Measure the element's layout origin independent of its current transform, so
 * a translate position `p` places its top-left viewport corner at
 * `(baseLeft + p.x, baseTop + p.y)`.
 */
function getElementGeometry(element: HTMLElement): ElementGeometry {
  const rect = element.getBoundingClientRect();
  return {
    baseLeft: rect.left - getCurrentTranslateX(element),
    baseTop: rect.top - getCurrentTranslateY(element),
    width: rect.width,
    height: rect.height,
  };
}

/** Pick the nearest corner for a translate position and measure edge offsets. */
function resolveAnchorFromPosition(
  position: DraggablePosition,
  element: HTMLElement,
): StoredAnchorPosition {
  if (typeof window === "undefined") {
    return { anchorCorner: "bottom-right", offsetX: 0, offsetY: 0 };
  }
  const geo = getElementGeometry(element);
  const left = geo.baseLeft + position.x;
  const top = geo.baseTop + position.y;
  const distanceFromRight = window.innerWidth - (left + geo.width);
  const distanceFromBottom = window.innerHeight - (top + geo.height);
  const anchorLeft = left <= distanceFromRight;
  const anchorTop = top <= distanceFromBottom;
  return {
    anchorCorner: `${anchorTop ? "top" : "bottom"}-${
      anchorLeft ? "left" : "right"
    }` as AnchorCorner,
    offsetX: anchorLeft ? left : distanceFromRight,
    offsetY: anchorTop ? top : distanceFromBottom,
  };
}

/** Recompute a translate position from a stored corner anchor. */
function resolvePositionFromAnchor(
  anchor: StoredAnchorPosition,
  element: HTMLElement,
): DraggablePosition {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }
  const geo = getElementGeometry(element);
  const anchorLeft =
    anchor.anchorCorner === "top-left" || anchor.anchorCorner === "bottom-left";
  const anchorTop =
    anchor.anchorCorner === "top-left" || anchor.anchorCorner === "top-right";
  const left = anchorLeft
    ? anchor.offsetX
    : window.innerWidth - geo.width - anchor.offsetX;
  const top = anchorTop
    ? anchor.offsetY
    : window.innerHeight - geo.height - anchor.offsetY;
  return { x: left - geo.baseLeft, y: top - geo.baseTop };
}

const ANCHOR_CORNERS: readonly AnchorCorner[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];

type ParsedStoredPosition =
  | { kind: "anchor"; anchor: StoredAnchorPosition }
  | { kind: "legacy"; position: DraggablePosition }
  | null;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Read the persisted position. Returns the new corner-anchored format when
 * present, a legacy absolute `{x, y}` value for migration, or null when nothing
 * usable is stored (missing, malformed, or storage blocked).
 */
function parseStoredPosition(storageKey: string | undefined): ParsedStoredPosition {
  if (!storageKey || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (
        typeof record.anchorCorner === "string" &&
        ANCHOR_CORNERS.includes(record.anchorCorner as AnchorCorner) &&
        isFiniteNumber(record.offsetX) &&
        isFiniteNumber(record.offsetY)
      ) {
        return {
          kind: "anchor",
          anchor: {
            anchorCorner: record.anchorCorner as AnchorCorner,
            offsetX: record.offsetX,
            offsetY: record.offsetY,
          },
        };
      }
      // Legacy format written by earlier SDK versions: absolute translate offsets.
      if (isFiniteNumber(record.x) && isFiniteNumber(record.y)) {
        return { kind: "legacy", position: { x: record.x, y: record.y } };
      }
    }
  } catch {
    // Storage may be blocked or hold malformed JSON; fall back to default.
  }
  return null;
}

function writeStoredAnchor(
  storageKey: string | undefined,
  anchor: StoredAnchorPosition,
): void {
  if (!storageKey || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(anchor));
  } catch {
    // Storage may be blocked; non-critical.
  }
}
