import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import type { ElementGrabItem } from "./index";
import { VisualSuggestionManager } from "./visual-suggestion-manager";

function createMockElement(styles: Record<string, string> = {}): HTMLElement {
  const inlineStyles = new Map<string, string>();
  const computedStyles = new Map(Object.entries(styles));

  const el = {
    style: {
      getPropertyValue(prop: string) {
        return inlineStyles.get(prop) ?? "";
      },
      setProperty(prop: string, value: string) {
        inlineStyles.set(prop, value);
      },
      removeProperty(prop: string) {
        inlineStyles.delete(prop);
        return "";
      },
    },
    _computedStyles: computedStyles,
    _inlineStyles: inlineStyles,
  };
  return el as unknown as HTMLElement;
}

function createMockGrab(id = "eg_1"): ElementGrabItem {
  return {
    id,
    tagName: "div",
    cssSelector: "div.test",
    outerHtml: '<div class="test"></div>',
    textContent: "",
    boundingRect: { x: 0, y: 0, width: 100, height: 50 },
    componentName: "TestComponent",
    sourceFile: "src/test.tsx",
    lineNumber: 10,
    componentStack: [],
  };
}

const originalGetComputedStyle = globalThis.window?.getComputedStyle;

beforeEach(() => {
  (globalThis as any).window = globalThis.window ?? {};
  (globalThis as any).window.getComputedStyle = (el: any) => ({
    getPropertyValue(prop: string) {
      return el._computedStyles?.get(prop) ?? "";
    },
  });
});

afterEach(() => {
  if (originalGetComputedStyle) {
    (globalThis as any).window.getComputedStyle = originalGetComputedStyle;
  }
});

describe("VisualSuggestionManager", () => {
  it("setActiveElement opens a palette with computed values", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px", padding: "8px" });
    mgr.setActiveElement(el, createMockGrab());

    const active = mgr.getActiveElement();
    expect(active).not.toBeNull();
    expect(active?.ref.componentName).toBe("TestComponent");
    expect(mgr.getOriginalValue("font-size")).toBe("16px");
    expect(mgr.getOriginalValue("padding")).toBe("8px");
    expect(mgr.getCurrentDisplayValue("font-size")).toBe("16px");
  });

  it("setPropertyOverride creates an item and applies inline style", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px" });
    mgr.setActiveElement(el, createMockGrab());

    mgr.setPropertyOverride("font-size", "24px");

    expect(mgr.hasItems()).toBe(true);
    const items = mgr.getItems();
    expect(items.length).toBe(1);
    expect(items[0].property).toBe("font-size");
    expect(items[0].originalValue).toBe("16px");
    expect(items[0].suggestedValue).toBe("24px");
    expect(el.style.getPropertyValue("font-size")).toBe("24px");
  });

  it("setPropertyOverride previews scoped changes across matched targets", () => {
    const mgr = new VisualSuggestionManager();
    const selected = createMockElement({ "font-size": "16px" });
    const sibling = createMockElement({ "font-size": "14px" });
    const selectedGrab = createMockGrab("eg_1");
    const siblingGrab = createMockGrab("eg_2");

    mgr.setActiveElementTargets(
      selected,
      {
        id: selectedGrab.id,
        tagName: selectedGrab.tagName,
        cssSelector: selectedGrab.cssSelector,
        boundingRect: selectedGrab.boundingRect,
        componentName: selectedGrab.componentName,
        sourceFile: selectedGrab.sourceFile,
        lineNumber: selectedGrab.lineNumber,
      },
      [
        {
          element: selected,
          ref: {
            id: selectedGrab.id,
            tagName: selectedGrab.tagName,
            cssSelector: selectedGrab.cssSelector,
            boundingRect: selectedGrab.boundingRect,
            componentName: selectedGrab.componentName,
            sourceFile: selectedGrab.sourceFile,
            lineNumber: selectedGrab.lineNumber,
          },
        },
        {
          element: sibling,
          ref: {
            id: siblingGrab.id,
            tagName: siblingGrab.tagName,
            cssSelector: siblingGrab.cssSelector,
            boundingRect: siblingGrab.boundingRect,
            componentName: siblingGrab.componentName,
            sourceFile: siblingGrab.sourceFile,
            lineNumber: siblingGrab.lineNumber,
          },
        },
      ],
      {
        kind: "similar-siblings",
        label: "Similar elements in this row/group",
        matchedCount: 2,
      },
    );

    mgr.setPropertyOverride("font-size", "24px");

    const item = mgr.getItems()[0];
    expect(item.scope?.kind).toBe("similar-siblings");
    expect(item.scope?.matchedCount).toBe(2);
    expect(selected.style.getPropertyValue("font-size")).toBe("24px");
    expect(sibling.style.getPropertyValue("font-size")).toBe("24px");

    mgr.removeSuggestions([item.id]);

    expect(selected.style.getPropertyValue("font-size")).toBe("");
    expect(sibling.style.getPropertyValue("font-size")).toBe("");
  });

  it("setPropertyOverride with original value clears the item (silent revert)", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px" });
    mgr.setActiveElement(el, createMockGrab());

    mgr.setPropertyOverride("font-size", "24px");
    expect(mgr.getItems().length).toBe(1);

    mgr.setPropertyOverride("font-size", "16px");
    expect(mgr.getItems().length).toBe(0);
    expect(mgr.hasItems()).toBe(false);
  });

  it("setPropertyOverride twice on same property updates in place (no duplicate items)", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px" });
    mgr.setActiveElement(el, createMockGrab());

    mgr.setPropertyOverride("font-size", "24px");
    mgr.setPropertyOverride("font-size", "32px");

    expect(mgr.getItems().length).toBe(1);
    expect(mgr.getItems()[0].suggestedValue).toBe("32px");
    expect(el.style.getPropertyValue("font-size")).toBe("32px");
  });

  it("multiple property overrides on same element", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px", padding: "8px" });
    mgr.setActiveElement(el, createMockGrab());

    mgr.setPropertyOverride("font-size", "24px");
    mgr.setPropertyOverride("padding", "12px");

    expect(mgr.getItems().length).toBe(2);
    expect(mgr.getOverrideForActiveElement("font-size")).not.toBeNull();
    expect(mgr.getOverrideForActiveElement("padding")).not.toBeNull();
    expect(mgr.getCurrentDisplayValue("font-size")).toBe("24px");
    expect(mgr.getCurrentDisplayValue("padding")).toBe("12px");
  });

  it("clearPropertyOverride reverts a single property", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px", padding: "8px" });
    mgr.setActiveElement(el, createMockGrab());

    mgr.setPropertyOverride("font-size", "24px");
    mgr.setPropertyOverride("padding", "12px");
    mgr.clearPropertyOverride("font-size");

    expect(mgr.getItems().length).toBe(1);
    expect(mgr.getItems()[0].property).toBe("padding");
    expect(el.style.getPropertyValue("font-size")).toBe("");
  });

  it("removeElement reverts all properties for that element", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px", padding: "8px" });
    const grab = createMockGrab("eg_1");
    mgr.setActiveElement(el, grab);

    mgr.setPropertyOverride("font-size", "24px");
    mgr.setPropertyOverride("padding", "12px");
    mgr.closeActiveElement();

    mgr.removeElement("eg_1");

    expect(mgr.getItems().length).toBe(0);
    expect(el.style.getPropertyValue("font-size")).toBe("");
    expect(el.style.getPropertyValue("padding")).toBe("");
  });

  it("getElementsWithOverrides groups items by element", () => {
    const mgr = new VisualSuggestionManager();
    const el1 = createMockElement({ "font-size": "16px" });
    const el2 = createMockElement({ padding: "8px" });

    mgr.setActiveElement(el1, createMockGrab("eg_1"));
    mgr.setPropertyOverride("font-size", "24px");
    mgr.closeActiveElement();

    mgr.setActiveElement(el2, createMockGrab("eg_2"));
    mgr.setPropertyOverride("padding", "12px");
    mgr.closeActiveElement();

    const groups = mgr.getElementsWithOverrides();
    expect(groups.length).toBe(2);
    expect(groups[0].ref.id).toBe("eg_1");
    expect(groups[0].items.length).toBe(1);
    expect(groups[1].ref.id).toBe("eg_2");
    expect(groups[1].items.length).toBe(1);
  });

  it("restoreAll reverts everything across multiple elements", () => {
    const mgr = new VisualSuggestionManager();
    const el1 = createMockElement({ "font-size": "16px" });
    const el2 = createMockElement({ padding: "8px" });

    mgr.setActiveElement(el1, createMockGrab("eg_1"));
    mgr.setPropertyOverride("font-size", "24px");
    mgr.closeActiveElement();

    mgr.setActiveElement(el2, createMockGrab("eg_2"));
    mgr.setPropertyOverride("padding", "12px");

    mgr.restoreAll();

    expect(mgr.getItems().length).toBe(0);
    expect(mgr.hasItems()).toBe(false);
    expect(mgr.getActiveElement()).toBeNull();
    expect(el1.style.getPropertyValue("font-size")).toBe("");
    expect(el2.style.getPropertyValue("padding")).toBe("");
  });

  it("getPayload returns versioned payload with all items", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px" });
    mgr.setActiveElement(el, createMockGrab());

    expect(mgr.getPayload()).toBeUndefined();

    mgr.setPropertyOverride("font-size", "24px");

    const payload = mgr.getPayload();
    expect(payload).toBeDefined();
    expect(payload?.version).toBe(1);
    expect(payload?.suggestions.length).toBe(1);
  });

  it("getPreviewedElement returns the DOM element for a given element ID", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px" });
    mgr.setActiveElement(el, createMockGrab("eg_1"));
    mgr.setPropertyOverride("font-size", "24px");
    mgr.closeActiveElement();

    expect(mgr.getPreviewedElement("eg_1")).toBe(el);
    expect(mgr.getPreviewedElement("eg_nonexistent")).toBeNull();
  });

  it("commitCurrentLine returns current items and clears active compose state", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px", padding: "8px" });
    mgr.setActiveElement(el, createMockGrab("eg_1"));
    mgr.setPropertyOverride("font-size", "24px");
    mgr.setPropertyOverride("padding", "12px");

    const committed = mgr.commitCurrentLine();

    expect(committed.length).toBe(2);
    expect(mgr.getItems().length).toBe(0);
    expect(mgr.getActiveElement()).toBeNull();
    expect(el.style.getPropertyValue("font-size")).toBe("24px");
    expect(el.style.getPropertyValue("padding")).toBe("12px");
  });

  it("removeSuggestions restores previews for committed line suggestions", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px" });
    mgr.setActiveElement(el, createMockGrab("eg_1"));
    mgr.setPropertyOverride("font-size", "24px");

    const committed = mgr.commitCurrentLine();
    mgr.removeSuggestions(committed.map((suggestion) => suggestion.id));

    expect(mgr.getPreviewedElement("eg_1")).toBeNull();
    expect(el.style.getPropertyValue("font-size")).toBe("");
  });

  it("sanitizes dangerous values", () => {
    const mgr = new VisualSuggestionManager();
    const el = createMockElement({ "font-size": "16px" });
    mgr.setActiveElement(el, createMockGrab());

    mgr.setPropertyOverride("font-size", "16px; color: red");
    expect(mgr.getItems().length).toBe(0);
  });
});
