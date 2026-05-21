import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PinOverlay } from "../../src/widget/pin-overlay";

function makeAnchor(selector = "div.host"): {
  selector: string;
  rect: { left: number; top: number; width: number; height: number };
  pageX: number;
  pageY: number;
} {
  return {
    selector,
    rect: { left: 100, top: 200, width: 100, height: 40 },
    pageX: 150,
    pageY: 220,
  };
}

describe("PinOverlay", () => {
  let overlay: PinOverlay | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    overlay?.destroy();
    overlay = null;
    document.body.innerHTML = "";
  });

  it("addPin creates a numbered marker and increments numbering", () => {
    overlay = new PinOverlay({ theme: "light" });
    const first = overlay.addPin(makeAnchor(), null);
    const second = overlay.addPin(makeAnchor(), null);
    expect(first.number).toBe(1);
    expect(second.number).toBe(2);
    expect(overlay.getPinCount()).toBe(2);
    const host = document.querySelector("[data-obvious-feedback-pin-layer]");
    const markers = host?.shadowRoot?.querySelectorAll(".obv-pin");
    expect(markers?.length).toBe(2);
  });

  it("removePin re-numbers remaining pins", () => {
    overlay = new PinOverlay({ theme: "light" });
    const first = overlay.addPin(makeAnchor(), null);
    const second = overlay.addPin(makeAnchor(), null);
    overlay.addPin(makeAnchor(), null);
    overlay.removePin(first.id);
    const remaining = overlay.getPins();
    expect(remaining[0]?.number).toBe(1);
    expect(remaining[1]?.number).toBe(2);
    expect(remaining.find((pin) => pin.id === second.id)?.number).toBe(1);
  });

  it("subscribeCount fires immediately and on add/remove", () => {
    overlay = new PinOverlay({ theme: "light" });
    const counts: number[] = [];
    const unsubscribe = overlay.subscribeCount((count) => {
      counts.push(count);
    });
    expect(counts[0]).toBe(0);
    const pin = overlay.addPin(makeAnchor(), null);
    overlay.addPin(makeAnchor(), null);
    overlay.removePin(pin.id);
    unsubscribe();
    overlay.addPin(makeAnchor(), null);
    expect(counts).toEqual([0, 1, 2, 1]);
  });

  it("opens a popover when a pin is added", () => {
    overlay = new PinOverlay({ theme: "light" });
    overlay.addPin(makeAnchor(), null);
    const host = document.querySelector("[data-obvious-feedback-pin-layer]");
    expect(host?.shadowRoot?.querySelector(".obv-pin-popover")).not.toBeNull();
  });

  it("clearAll empties all pins and resets numbering", () => {
    overlay = new PinOverlay({ theme: "light" });
    overlay.addPin(makeAnchor(), null);
    overlay.addPin(makeAnchor(), null);
    overlay.clearAll();
    expect(overlay.getPinCount()).toBe(0);
    const next = overlay.addPin(makeAnchor(), null);
    expect(next.number).toBe(1);
  });

  it("updatePinComment persists changes", () => {
    overlay = new PinOverlay({ theme: "light" });
    const pin = overlay.addPin(makeAnchor(), null);
    overlay.updatePinComment(pin.id, "Looks broken here");
    expect(overlay.getPins()[0]?.comment).toBe("Looks broken here");
  });

  describe("visual suggestions", () => {
    it("renders a tweak panel only when a live element is provided", () => {
      overlay = new PinOverlay({ theme: "light" });
      overlay.addPin(makeAnchor(), null);
      const host = document.querySelector("[data-obvious-feedback-pin-layer]");
      const popover = host?.shadowRoot?.querySelector(".obv-pin-popover");
      expect(popover?.querySelector(".obv-pin-popover-tweaks")).toBeNull();

      overlay.clearAll();
      const target = document.createElement("div");
      target.style.padding = "16px";
      target.style.fontSize = "14px";
      document.body.appendChild(target);
      overlay.addPin(makeAnchor(), target);
      const refreshed = host?.shadowRoot?.querySelector(".obv-pin-popover");
      expect(refreshed?.querySelector(".obv-pin-popover-tweaks")).not.toBeNull();
      const rows = refreshed?.querySelectorAll(".obv-pin-tweak-row");
      expect((rows?.length ?? 0) >= 2).toBe(true);
    });

    it("setOverride applies inline styles and surfaces them in the snapshot", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "24px");
      expect(target.style.getPropertyValue("padding")).toBe("24px");
      const overrides = overlay.getPins()[0]?.overrides ?? [];
      expect(overrides.some((entry) => entry.property === "padding" && entry.suggestedValue === "24px")).toBe(true);
    });

    it("clearOverride restores the previous inline style", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "32px");
      overlay.clearOverride(pin.id, "padding");
      expect(target.style.getPropertyValue("padding")).toBe("8px");
      expect(overlay.getPins()[0]?.overrides ?? []).toHaveLength(0);
    });

    it("removePin reverts inline overrides on the live element", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "40px");
      overlay.removePin(pin.id);
      expect(target.style.getPropertyValue("padding")).toBe("8px");
    });

    it("clearAll reverts inline overrides for every pin", () => {
      overlay = new PinOverlay({ theme: "light" });
      const a = document.createElement("button");
      a.style.padding = "10px";
      const b = document.createElement("p");
      b.style.fontSize = "14px";
      document.body.appendChild(a);
      document.body.appendChild(b);
      const pinA = overlay.addPin(makeAnchor("button"), a);
      const pinB = overlay.addPin(makeAnchor("p"), b);
      overlay.setOverride(pinA.id, "padding", "30px");
      overlay.setOverride(pinB.id, "font-size", "20px");
      overlay.clearAll();
      expect(a.style.getPropertyValue("padding")).toBe("10px");
      expect(b.style.getPropertyValue("font-size")).toBe("14px");
    });

    it("destroy reverts inline overrides as part of cleanup", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "40px");
      overlay.destroy();
      overlay = null;
      expect(target.style.getPropertyValue("padding")).toBe("8px");
    });

    it("setOverride that matches the original is treated as a clear", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "12px";
      document.body.appendChild(target);
      const originalPadding = window
        .getComputedStyle(target)
        .getPropertyValue("padding")
        .trim();
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "32px");
      expect(overlay.getPins()[0]?.overrides ?? []).toHaveLength(1);
      overlay.setOverride(pin.id, "padding", originalPadding);
      expect(overlay.getPins()[0]?.overrides ?? []).toHaveLength(0);
    });
  });
});
