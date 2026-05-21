import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createDraggable } from "../../src/widget/draggable";

describe("createDraggable", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = "";
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

  it("persists the final position to localStorage when storageKey is provided", () => {
    const target = document.createElement("div");
    target.style.cssText = "position:fixed;width:100px;height:30px;";
    document.body.appendChild(target);
    const handle = document.createElement("button");
    target.appendChild(handle);
    const draggable = createDraggable({
      target,
      handle,
      initialPosition: { x: 0, y: 0 },
      storageKey: "test.position",
    });
    draggable.setPosition({ x: 42, y: 84 });
    const stored = window.localStorage.getItem("test.position");
    expect(stored).not.toBeNull();
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed).toEqual({ x: 42, y: 84 });
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
    secondHandle.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 2,
        clientX: 60,
        clientY: 60,
      }),
    );
    expect(draggable.isDragging()).toBe(true);
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
