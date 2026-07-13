import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createDraggable } from "../../src/widget/draggable";

const DEFAULT_INNER_WIDTH = window.innerWidth;
const DEFAULT_INNER_HEIGHT = window.innerHeight;

function stubViewport(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: height, configurable: true });
}

function currentTranslate(el: HTMLElement): { x: number; y: number } {
  const match = el.style.transform.match(
    /translate3d\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px,/,
  );
  return match
    ? { x: Number.parseFloat(match[1] ?? "0"), y: Number.parseFloat(match[2] ?? "0") }
    : { x: 0, y: 0 };
}

/**
 * happy-dom has no layout, so getBoundingClientRect returns zeros. Mock it to
 * model a `position:fixed; left:0; top:0` host (base origin 0,0) of the given
 * size whose rect tracks the applied translate — matching the real toolbar host.
 */
function mockRect(el: HTMLElement, width: number, height: number): void {
  Object.defineProperty(el, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      const { x, y } = currentTranslate(el);
      return {
        left: x,
        top: y,
        right: x + width,
        bottom: y + height,
        width,
        height,
        x,
        y,
        toJSON() {},
      } as DOMRect;
    },
  });
}

describe("createDraggable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    stubViewport(DEFAULT_INNER_WIDTH, DEFAULT_INNER_HEIGHT);
  });

  it("applies a translate3d transform reflecting the initial position", () => {
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:200px;height:40px;";
    document.body.appendChild(target);
    const handle = document.createElement("button");
    target.appendChild(handle);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 30, y: 50 },
      viewportMargin: 0,
    });
    expect(target.style.transform).toContain("translate3d(30px, 50px");
    draggable.destroy();
  });

  it("setPosition clamps absurd values back to a finite bounded position", () => {
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:200px;height:40px;";
    document.body.appendChild(target);
    const handle = document.createElement("button");
    target.appendChild(handle);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 0, y: 0 },
      viewportMargin: 8,
    });
    draggable.setPosition({ x: 99999, y: 99999 });
    const position = draggable.getPosition();
    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
    expect(position.x).toBeLessThanOrEqual(window.innerWidth);
    expect(position.y).toBeLessThanOrEqual(window.innerHeight);
    draggable.destroy();
  });

  it("persists the final position to localStorage as a corner anchor", () => {
    stubViewport(1000, 800);
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:100px;height:30px;";
    document.body.appendChild(target);
    mockRect(target, 100, 30);
    const handle = document.createElement("button");
    target.appendChild(handle);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 0, y: 0 },
      storageKey: "test.position",
    });
    // Drop near the top-left corner: 42px from the left, 84px from the top.
    draggable.setPosition({ x: 42, y: 84 });
    const stored = window.localStorage.getItem("test.position");
    expect(stored).not.toBeNull();
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed).toEqual({
      anchorCorner: "top-left",
      offsetX: 42,
      offsetY: 84,
    });
    draggable.destroy();
  });

  it("setHandle rebinds listeners to a new handle node", () => {
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:200px;height:40px;";
    document.body.appendChild(target);
    const firstHandle = document.createElement("button");
    target.appendChild(firstHandle);
    const draggable = createDraggable({
      target,
      handle: firstHandle,
      initialPosition: { x: 0, y: 0 },
      viewportMargin: 0,
    });
    const secondHandle = document.createElement("button");
    target.appendChild(secondHandle);
    draggable.setHandle(secondHandle);
    firstHandle.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        bubbles: true,
        clientX: 0,
        clientY: 0,
      }),
    );
    firstHandle.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 60,
        clientY: 60,
      }),
    );
    expect(draggable.isDragging()).toBe(false);
    secondHandle.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 2,
        button: 0,
        isPrimary: true,
        clientX: 0,
        clientY: 0,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 2,
        clientX: 60,
        clientY: 60,
      }),
    );
    expect(draggable.isDragging()).toBe(true);
    draggable.destroy();
  });

  it("keeps clicks on interactive children when movement stays below the drag threshold", () => {
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:200px;height:40px;";
    document.body.appendChild(target);
    const surface = document.createElement("div");
    surface.style.cssText = "width:100%;height:100%;";
    target.appendChild(surface);
    const actionButton = document.createElement("button");
    actionButton.setAttribute("data-toolbar-action", "comment");
    surface.appendChild(actionButton);
    let clicks = 0;
    actionButton.addEventListener("click", () => {
      clicks += 1;
    });
    const draggable = createDraggable({
      target,
      handle: surface,
      initialPosition: { x: 0, y: 0 },
      viewportMargin: 0,
    });
    actionButton.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        bubbles: true,
        clientX: 0,
        clientY: 0,
      }),
    );
    actionButton.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        bubbles: true,
      }),
    );
    actionButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(clicks).toBe(1);
    expect(draggable.isDragging()).toBe(false);
    draggable.destroy();
  });

  it("suppresses the follow-up click after dragging from an interactive child", () => {
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:200px;height:40px;";
    document.body.appendChild(target);
    const surface = document.createElement("div");
    surface.style.cssText = "width:100%;height:100%;";
    target.appendChild(surface);
    const actionButton = document.createElement("button");
    actionButton.setAttribute("data-toolbar-action", "comment");
    surface.appendChild(actionButton);
    let clicks = 0;
    actionButton.addEventListener("click", () => {
      clicks += 1;
    });
    const draggable = createDraggable({
      target,
      handle: surface,
      initialPosition: { x: 0, y: 0 },
      viewportMargin: 0,
    });
    actionButton.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        bubbles: true,
        clientX: 0,
        clientY: 0,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 80,
        clientY: 80,
      }),
    );
    expect(draggable.isDragging()).toBe(true);
    window.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
      }),
    );
    const wasClickAllowed = actionButton.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(wasClickAllowed).toBe(false);
    expect(clicks).toBe(0);
    draggable.destroy();
  });

  it("destroy removes pointer listeners so subsequent pointerdown is a no-op", () => {
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:100px;height:30px;";
    document.body.appendChild(target);
    const handle = document.createElement("button");
    target.appendChild(handle);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 50, y: 50 },
      viewportMargin: 0,
    });
    const transformBeforeDestroy = target.style.transform;
    draggable.destroy();
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, button: 0 }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 200,
        clientY: 200,
      }),
    );
    expect(target.style.transform).toBe(transformBeforeDestroy);
  });
});

describe("createDraggable corner-anchor positioning", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    stubViewport(DEFAULT_INNER_WIDTH, DEFAULT_INNER_HEIGHT);
  });

  function mountTarget(width: number, height: number): {
    target: HTMLElement;
    handle: HTMLElement;
  } {
    const target = document.createElement("div");
    target.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;`;
    document.body.appendChild(target);
    mockRect(target, width, height);
    const handle = document.createElement("button");
    target.appendChild(handle);
    return { target, handle };
  }

  it("keeps its distance from the anchored corner when the window grows", () => {
    // Docked 20px from the bottom-right corner of an 800x600 viewport.
    stubViewport(800, 600);
    const { target, handle } = mountTarget(200, 40);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 800 - 200 - 20, y: 600 - 40 - 20 },
      viewportMargin: 12,
      storageKey: "grow.position",
    });

    // Grow the viewport; the button must stay 20px from the bottom-right corner
    // rather than being stranded at its old absolute coordinates.
    stubViewport(1600, 1200);
    draggable.reclamp();
    const position = draggable.getPosition();
    expect(position.x).toBe(1600 - 200 - 20);
    expect(position.y).toBe(1200 - 40 - 20);
    draggable.destroy();
  });

  it("stays fully on-screen when the window shrinks", () => {
    stubViewport(1600, 1200);
    const { target, handle } = mountTarget(200, 40);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 1600 - 200 - 20, y: 1200 - 40 - 20 },
      viewportMargin: 12,
      storageKey: "shrink.position",
    });

    stubViewport(400, 300);
    draggable.reclamp();
    const position = draggable.getPosition();
    // Fully visible within the smaller viewport, never off-screen.
    expect(position.x).toBeGreaterThanOrEqual(12);
    expect(position.y).toBeGreaterThanOrEqual(12);
    expect(position.x + 200).toBeLessThanOrEqual(400);
    expect(position.y + 40).toBeLessThanOrEqual(300);
    draggable.destroy();
  });

  it("selects the nearest corner at drag-end", () => {
    stubViewport(1000, 800);
    const { target, handle } = mountTarget(100, 40);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 500, y: 400 },
      viewportMargin: 0,
      storageKey: "dragend.position",
    });

    // Drag from the center toward the top-left corner and release there.
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        bubbles: true,
        clientX: 0,
        clientY: 0,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: -490, clientY: -390 }),
    );
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1 }));

    const stored = window.localStorage.getItem("dragend.position");
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed?.anchorCorner).toBe("top-left");
    expect(parsed?.offsetX).toBe(10);
    expect(parsed?.offsetY).toBe(10);
    draggable.destroy();
  });

  it("restores a stored corner-anchored position on init (reload)", () => {
    stubViewport(1000, 800);
    window.localStorage.setItem(
      "reload.position",
      JSON.stringify({ anchorCorner: "bottom-right", offsetX: 30, offsetY: 40 }),
    );
    const { target, handle } = mountTarget(100, 40);
    const draggable = createDraggable({
      target,
      handle,
      // Default placement is provided but the stored anchor must win.
      initialPosition: { x: 0, y: 0 },
      viewportMargin: 12,
      storageKey: "reload.position",
    });
    const position = draggable.getPosition();
    expect(position.x).toBe(1000 - 100 - 30);
    expect(position.y).toBe(800 - 40 - 40);
    draggable.destroy();
  });

  it("migrates a legacy absolute stored value to the corner-anchored format", () => {
    stubViewport(1000, 800);
    window.localStorage.setItem(
      "legacy.position",
      JSON.stringify({ x: 200, y: 100 }),
    );
    const { target, handle } = mountTarget(100, 40);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 0, y: 0 },
      viewportMargin: 12,
      storageKey: "legacy.position",
    });
    // The legacy position is honored on this load...
    const position = draggable.getPosition();
    expect(position.x).toBe(200);
    expect(position.y).toBe(100);
    // ...and rewritten in the new corner-anchored format.
    const stored = window.localStorage.getItem("legacy.position");
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed?.anchorCorner).toBe("top-left");
    expect(parsed?.offsetX).toBe(200);
    expect(parsed?.offsetY).toBe(100);
    draggable.destroy();
  });

  it("ignores a malformed stored value and falls back to the default placement", () => {
    stubViewport(1000, 800);
    window.localStorage.setItem("malformed.position", "{ not valid json");
    const { target, handle } = mountTarget(100, 40);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 50, y: 60 },
      viewportMargin: 12,
      storageKey: "malformed.position",
    });
    const position = draggable.getPosition();
    expect(position.x).toBe(50);
    expect(position.y).toBe(60);
    draggable.destroy();
  });
});

