/**
 * Reusable drag controller for SDK overlays. Tracks pointer down/move/up on a
 * dedicated handle, applies translate3d to a target element, clamps the result
 * to stay inside the viewport, and optionally persists the final position to
 * localStorage so the user's choice survives reloads.
 */

export interface DraggablePosition {
  x: number;
  y: number;
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
  onDragMove?: (position: DraggablePosition) => void;
  /** Called when the pointer is released and the position is committed. */
  onDragEnd?: (position: DraggablePosition) => void;
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
  hasMovedPastThreshold: boolean;
}

const DEFAULT_VIEWPORT_MARGIN_PX = 12;
const DEFAULT_DRAG_THRESHOLD_PX = 4;

export function createDraggable(options: DraggableOptions): DraggableHandle {
  const viewportMargin = options.viewportMargin ?? DEFAULT_VIEWPORT_MARGIN_PX;
  const dragThreshold = options.dragThreshold ?? DEFAULT_DRAG_THRESHOLD_PX;

  let position: DraggablePosition = options.initialPosition
    ? clampPositionForElement(options.initialPosition, options.target, viewportMargin)
    : readStoredPosition(options.storageKey) ?? { x: 0, y: 0 };

  let dragState: DragState | null = null;
  let isDestroyed = false;
  let handle = options.handle;

  applyPosition(options.target, position);

  function handlePointerDown(event: PointerEvent): void {
    if (isDestroyed || event.button !== 0) {
      return;
    }
    if (!event.isPrimary) {
      return;
    }
    handle.setPointerCapture?.(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPosition: { ...position },
      hasMovedPastThreshold: false,
    };
    event.preventDefault();
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
      options.onDragStart?.();
    }
    if (!dragState.hasMovedPastThreshold) {
      return;
    }
    const next = clampPositionForElement(
      {
        x: dragState.startPosition.x + deltaX,
        y: dragState.startPosition.y + deltaY,
      },
      options.target,
      viewportMargin,
    );
    position = next;
    applyPosition(options.target, position);
    options.onDragMove?.(position);
  }

  function handlePointerUp(event: PointerEvent): void {
    if (isDestroyed || !dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    const wasDragging = dragState.hasMovedPastThreshold;
    dragState = null;
    handle.releasePointerCapture?.(event.pointerId);
    if (wasDragging) {
      writeStoredPosition(options.storageKey, position);
      options.onDragEnd?.(position);
    }
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }
    dragState = null;
    handle.releasePointerCapture?.(event.pointerId);
  }

  function attachHandleListeners(target: HTMLElement): void {
    target.addEventListener("pointerdown", handlePointerDown);
    target.addEventListener("pointermove", handlePointerMove);
    target.addEventListener("pointerup", handlePointerUp);
    target.addEventListener("pointercancel", handlePointerCancel);
  }

  function detachHandleListeners(target: HTMLElement): void {
    target.removeEventListener("pointerdown", handlePointerDown);
    target.removeEventListener("pointermove", handlePointerMove);
    target.removeEventListener("pointerup", handlePointerUp);
    target.removeEventListener("pointercancel", handlePointerCancel);
  }

  attachHandleListeners(handle);

  return {
    setPosition(next) {
      position = clampPositionForElement(next, options.target, viewportMargin);
      applyPosition(options.target, position);
      writeStoredPosition(options.storageKey, position);
    },
    getPosition() {
      return { ...position };
    },
    reclamp() {
      const next = clampPositionForElement(position, options.target, viewportMargin);
      if (next.x !== position.x || next.y !== position.y) {
        position = next;
        applyPosition(options.target, position);
        writeStoredPosition(options.storageKey, position);
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
      detachHandleListeners(handle);
    },
  };
}

function applyPosition(target: HTMLElement, position: DraggablePosition): void {
  target.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`;
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

function readStoredPosition(storageKey: string | undefined): DraggablePosition | null {
  if (!storageKey || typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y)
    ) {
      return { x: parsed.x, y: parsed.y };
    }
  } catch {
    // Storage may be blocked; fall back to default.
  }
  return null;
}

function writeStoredPosition(
  storageKey: string | undefined,
  position: DraggablePosition,
): void {
  if (!storageKey || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(position));
  } catch {
    // Storage may be blocked; non-critical.
  }
}
