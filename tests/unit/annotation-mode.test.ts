import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { AnnotationMode } from "../../src/widget/annotation-mode";

describe("AnnotationMode", () => {
  let mode: AnnotationMode | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    mode?.destroy();
    mode = null;
    document.body.innerHTML = "";
  });

  it("starts inactive and toggles active when start is called", () => {
    mode = new AnnotationMode({
      onPicked: () => undefined,
      onCancel: () => undefined,
    });
    expect(mode.isActive()).toBe(false);
    mode.start();
    expect(mode.isActive()).toBe(true);
  });

  it("mounts the picker overlay on start", () => {
    mode = new AnnotationMode({
      onPicked: () => undefined,
      onCancel: () => undefined,
    });
    mode.start();
    expect(
      document.querySelector("[data-obvious-feedback-pick-overlay]"),
    ).not.toBeNull();
  });

  it("calls onCancel when ESC is pressed", () => {
    let cancels = 0;
    mode = new AnnotationMode({
      onPicked: () => undefined,
      onCancel: () => {
        cancels += 1;
      },
    });
    mode.start();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancels).toBe(1);
    expect(mode.isActive()).toBe(false);
  });

  it("removes the overlay after stop", () => {
    mode = new AnnotationMode({
      onPicked: () => undefined,
      onCancel: () => undefined,
    });
    mode.start();
    mode.stop("cancel");
    expect(
      document.querySelector("[data-obvious-feedback-pick-overlay]"),
    ).toBeNull();
  });

  it("destroy removes listeners and overlay", () => {
    let cancels = 0;
    mode = new AnnotationMode({
      onPicked: () => undefined,
      onCancel: () => {
        cancels += 1;
      },
    });
    mode.start();
    mode.destroy();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(cancels).toBe(1);
  });
});
