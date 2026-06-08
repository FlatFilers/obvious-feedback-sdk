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
    document.head.innerHTML = "";
    // Clear any custom properties tests injected on the document root so the
    // design-token catalog starts empty for the next test.
    const rootStyle = document.documentElement.style;
    for (let i = rootStyle.length - 1; i >= 0; i -= 1) {
      const prop = rootStyle.item(i);
      if (prop?.startsWith("--")) {
        rootStyle.removeProperty(prop);
      }
    }
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

  it("renders a dedicated drag handle and X delete action in the popover header", () => {
    overlay = new PinOverlay({ theme: "light" });
    overlay.addPin(makeAnchor(), null);
    const host = document.querySelector("[data-obvious-feedback-pin-layer]");
    const popover = host?.shadowRoot?.querySelector(".obv-pin-popover");
    expect(popover?.querySelector(".obv-pin-popover-title")?.textContent).toBe(
      "Pin 1 of 1",
    );
    const handle = popover?.querySelector("[data-pin-drag-handle]");
    expect(handle).toBeInstanceOf(HTMLButtonElement);
    expect(handle?.textContent).toContain("Drag");
    const deleteButton = popover?.querySelector('[data-pin-action="delete"]');
    expect(deleteButton).toBeInstanceOf(HTMLButtonElement);
    expect(deleteButton?.innerHTML ?? "").toContain("obv-icon");
    expect(deleteButton?.innerHTML ?? "").toContain("M6 6l12 12");
    const styleText = host?.shadowRoot?.querySelector("style")?.textContent ?? "";
    expect(styleText).toContain(".obv-pin-layer .obv-icon");
    expect(styleText).toContain("stroke: currentColor");
  });

  it("closes the popover when Cmd/Ctrl+Enter is pressed in the textarea", () => {
    overlay = new PinOverlay({ theme: "light" });
    overlay.addPin(makeAnchor(), null);
    const host = document.querySelector("[data-obvious-feedback-pin-layer]");
    const textarea = host?.shadowRoot?.querySelector("textarea");
    expect(textarea).toBeInstanceOf(HTMLTextAreaElement);
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error("textarea was not rendered");
    }
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        metaKey: true,
        bubbles: true,
      }),
    );
    expect(host?.shadowRoot?.querySelector(".obv-pin-popover")).toBeNull();
  });

  it("lets the popover move by dragging its header", () => {
    overlay = new PinOverlay({ theme: "light" });
    overlay.addPin(makeAnchor(), null);
    const host = document.querySelector("[data-obvious-feedback-pin-layer]");
    const popover = host?.shadowRoot?.querySelector(".obv-pin-popover");
    expect(popover).toBeInstanceOf(HTMLElement);
    if (!(popover instanceof HTMLElement)) {
      throw new Error("popover was not rendered");
    }
    const handle = popover.querySelector("[data-pin-drag-handle]");
    expect(handle).toBeInstanceOf(HTMLElement);
    if (!(handle instanceof HTMLElement)) {
      throw new Error("drag handle was not rendered");
    }
    const initialTransform = popover.style.transform;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 1,
        button: 0,
        isPrimary: true,
        clientX: 0,
        clientY: 0,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 40,
        clientY: 24,
      }),
    );
    handle.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        clientX: 40,
        clientY: 24,
      }),
    );
    expect(popover.style.transform).not.toBe(initialTransform);
    expect(popover.style.transform).toContain("translate3d");
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
    it("renders a tweak panel only when a live element is provided and the host exposes design tokens", () => {
      overlay = new PinOverlay({ theme: "light" });
      overlay.addPin(makeAnchor(), null);
      let host = document.querySelector("[data-obvious-feedback-pin-layer]");
      const popover = host?.shadowRoot?.querySelector(".obv-pin-popover");
      expect(popover?.querySelector(".obv-pin-popover-tweaks")).toBeNull();
      overlay.destroy();

      // Set host design tokens via root inline style BEFORE creating the
      // next overlay — the SDK caches the token catalog per-instance, so
      // tokens registered after construction wouldn't be picked up. happy-dom
      // does not always expose CSSRules from `<style>` blocks, so we go via
      // the inline path which is the authoritative fallback.
      document.documentElement.style.setProperty("--space-md", "16px");
      document.documentElement.style.setProperty("--space-lg", "24px");
      document.documentElement.style.setProperty("--font-size-md", "14px");
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("div");
      target.style.padding = "16px";
      target.style.fontSize = "14px";
      document.body.appendChild(target);
      overlay.addPin(makeAnchor(), target);
      host = document.querySelector("[data-obvious-feedback-pin-layer]");
      const refreshed = host?.shadowRoot?.querySelector(".obv-pin-popover");
      expect(refreshed?.querySelector(".obv-pin-popover-tweaks")).not.toBeNull();
      const rows = refreshed?.querySelectorAll(".obv-pin-tweak-row");
      expect((rows?.length ?? 0) >= 1).toBe(true);
    });

    it("highlights the token chip that matches the picked element's original value", () => {
      document.documentElement.style.setProperty("--space-md", "1rem");
      document.documentElement.style.setProperty("--space-lg", "1.5rem");
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "16px";
      document.body.appendChild(target);
      overlay.addPin(makeAnchor("button"), target);

      const host = document.querySelector("[data-obvious-feedback-pin-layer]");
      const chip = host?.shadowRoot?.querySelector('[data-token-name="--space-md"]');
      expect(chip).toBeInstanceOf(HTMLElement);
      if (!(chip instanceof HTMLElement)) {
        throw new Error("matching token chip was not rendered");
      }

      expect(chip.getAttribute("data-active")).toBe("true");
      expect(chip.getAttribute("aria-pressed")).toBe("true");
      expect(overlay.getPins()[0]?.overrides ?? []).toHaveLength(0);

      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(overlay.getPins()[0]?.overrides ?? []).toHaveLength(0);
      expect(target.style.getPropertyValue("padding")).toBe("16px");
    });

    it("does not render the tweak panel when the host has no design tokens for the picked element", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("div");
      target.style.padding = "16px";
      document.body.appendChild(target);
      overlay.addPin(makeAnchor(), target);
      const host = document.querySelector("[data-obvious-feedback-pin-layer]");
      const popover = host?.shadowRoot?.querySelector(".obv-pin-popover");
      expect(popover?.querySelector(".obv-pin-popover-tweaks")).toBeNull();
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

    it("uses manifest tokens for tweak chips and snapshot metadata", () => {
      const style = document.createElement("style");
      style.textContent = `
        .bg-surface-primary { background-color: rgb(255, 255, 255); }
        .bg-surface-secondary { background-color: rgb(245, 245, 245); }
      `;
      document.head.appendChild(style);
      overlay = new PinOverlay({
        theme: "light",
        designSystem: {
          source: "obvious-design-tokens",
          tokensMarkdown: `
            ## Color tokens
            ### Surfaces
            | Use case | Preferred class |
            |---|---|
            | Default card | \`bg-surface-primary\` |
            | Quiet fill | \`bg-surface-secondary\` |
          `,
        },
      });
      const target = document.createElement("button");
      target.style.backgroundColor = "rgb(200, 200, 200)";
      document.body.appendChild(target);
      overlay.addPin(makeAnchor("button"), target);

      const host = document.querySelector("[data-obvious-feedback-pin-layer]");
      const chip = host?.shadowRoot?.querySelector(
        '[data-token-name="bg-surface-primary"]',
      );
      expect(chip).toBeInstanceOf(HTMLElement);
      if (!(chip instanceof HTMLElement)) {
        throw new Error("manifest token chip was not rendered");
      }

      chip.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      expect(target.style.getPropertyValue("background-color")).toBe(
        "rgb(255, 255, 255)",
      );
      const override = overlay.getPins()[0]?.overrides.find(
        (entry) => entry.property === "background-color",
      );
      expect(override?.token?.name).toBe("bg-surface-primary");
      expect(override?.token?.source).toBe("manifest");
      expect(override?.suggestedValue).toBe("rgb(255, 255, 255)");
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

    it("token-source overrides ship token metadata in the snapshot", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "var(--space-md)", {
        source: "token",
        token: {
          shortName: "space-md",
          name: "--space-md",
          resolvedValue: "16px",
          category: "spacing",
          semanticScore: 2,
        },
      });
      const snapshot = overlay.getPins()[0]?.overrides ?? [];
      expect(snapshot).toHaveLength(1);
      expect(snapshot[0]?.source).toBe("token");
      expect(snapshot[0]?.token?.name).toBe("--space-md");
      expect(snapshot[0]?.token?.shortName).toBe("space-md");
      expect(snapshot[0]?.suggestedValue).toBe("var(--space-md)");
    });

    it("intent-source overrides ship intent metadata and previewValue", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "1.5em", {
        source: "intent",
        intent: "more-spacing",
        previewValue: "1.5em",
      });
      const snapshot = overlay.getPins()[0]?.overrides ?? [];
      expect(snapshot[0]?.source).toBe("intent");
      expect(snapshot[0]?.intent).toBe("more-spacing");
      expect(snapshot[0]?.previewValue).toBe("1.5em");
    });

    it("clearOverride restores the inline value after a token override", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "var(--space-md)", {
        source: "token",
        token: {
          shortName: "space-md",
          name: "--space-md",
          resolvedValue: "16px",
          category: "spacing",
          semanticScore: 2,
        },
      });
      expect(target.style.getPropertyValue("padding")).toBe("var(--space-md)");
      overlay.clearOverride(pin.id, "padding");
      expect(target.style.getPropertyValue("padding")).toBe("8px");
      expect(overlay.getPins()[0]?.overrides ?? []).toHaveLength(0);
    });

    it("does not auto-clear token overrides whose value differs from the computed", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.padding = "8px";
      document.body.appendChild(target);
      const pin = overlay.addPin(makeAnchor(), target);
      overlay.setOverride(pin.id, "padding", "var(--space-md)", {
        source: "token",
        token: {
          shortName: "space-md",
          name: "--space-md",
          resolvedValue: "8px",
          category: "spacing",
          semanticScore: 2,
        },
      });
      // Even though the resolved token value matches the original computed
      // padding, the user explicitly chose the token; the override stays.
      expect(overlay.getPins()[0]?.overrides ?? []).toHaveLength(1);
    });

    it("skips the color row entirely when no semantic emphasis tokens are available", () => {
      overlay = new PinOverlay({ theme: "light" });
      const target = document.createElement("button");
      target.style.color = "rgb(0, 0, 0)";
      target.style.background = "rgb(255, 255, 255)";
      target.style.padding = "8px";
      document.body.appendChild(target);
      overlay.addPin(makeAnchor(), target);
      const host = document.querySelector("[data-obvious-feedback-pin-layer]");
      const popover = host?.shadowRoot?.querySelector(".obv-pin-popover");
      // Without semantic text-* / surface-* tokens in the doc, color rows
      // should not render — only numeric tweak rows do.
      const rows = Array.from(
        popover?.querySelectorAll(".obv-pin-tweak-row") ?? [],
      );
      const colorRow = rows.find(
        (row) => row.getAttribute("data-prop") === "color",
      );
      const bgRow = rows.find(
        (row) => row.getAttribute("data-prop") === "background-color",
      );
      expect(colorRow).toBeUndefined();
      expect(bgRow).toBeUndefined();
    });
  });
});
