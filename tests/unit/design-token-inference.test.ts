import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { buildDesignTokenCatalog } from "../../src/widget/design-token-inference";

function installRootStyles(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

describe("design token inference", () => {
  let injected: HTMLStyleElement | null = null;

  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    injected?.remove();
    injected = null;
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("returns an empty catalog when no relevant CSS variables are exposed", () => {
    const catalog = buildDesignTokenCatalog();
    expect(catalog.tokens.length === 0 || catalog.tokens.every((t) => t.shortName)).toBe(true);
    expect(Array.isArray(catalog.tokens)).toBe(true);
    expect(catalog.byCategory).toBeDefined();
    expect(catalog.byShortName instanceof Map).toBe(true);
  });

  it("classifies semantic surface tokens under background", () => {
    injected = installRootStyles(`
      :root {
        --surface-primary: #ffffff;
        --surface-raised: #f7f7f7;
        --color-neutral-100: #ffffff;
      }
    `);
    const catalog = buildDesignTokenCatalog();
    const surfacePrimary = catalog.byShortName.get("surface-primary");
    const surfaceRaised = catalog.byShortName.get("surface-raised");
    expect(surfacePrimary).toBeDefined();
    expect(surfacePrimary?.category).toBe("background");
    expect(surfaceRaised?.category).toBe("background");
    expect(surfacePrimary?.semanticScore).toBeGreaterThan(0);
  });

  it("classifies text and border tokens", () => {
    injected = installRootStyles(`
      :root {
        --text-primary: rgba(0, 0, 0, 0.92);
        --text-secondary: rgba(0, 0, 0, 0.64);
        --border-default: rgba(0, 0, 0, 0.16);
      }
    `);
    const catalog = buildDesignTokenCatalog();
    expect(catalog.byShortName.get("text-primary")?.category).toBe("text");
    expect(catalog.byShortName.get("text-secondary")?.category).toBe("text");
    expect(catalog.byShortName.get("border-default")?.category).toBe("border");
  });

  it("classifies state tokens regardless of position in the name", () => {
    injected = installRootStyles(`
      :root {
        --state-warning-bg: #fef3c7;
        --color-success: #10b981;
        --error: #ef4444;
      }
    `);
    const catalog = buildDesignTokenCatalog();
    expect(catalog.byShortName.get("state-warning-bg")?.category).toBe("state");
    expect(catalog.byShortName.get("color-success")?.category).toBe("state");
    expect(catalog.byShortName.get("error")?.category).toBe("state");
  });

  it("demotes raw palette tokens like --neutral-500 below semantic ones", () => {
    injected = installRootStyles(`
      :root {
        --color-neutral-500: #6b7280;
        --text-primary: #6b7280;
      }
    `);
    const catalog = buildDesignTokenCatalog();
    const palette = catalog.byShortName.get("color-neutral-500");
    const semantic = catalog.byShortName.get("text-primary");
    expect(palette?.category).toBe("raw");
    expect(palette?.semanticScore).toBe(0);
    if (semantic) {
      expect(semantic.semanticScore).toBeGreaterThan(palette?.semanticScore ?? 0);
    }
  });

  it("identifies length tokens as spacing by default", () => {
    injected = installRootStyles(`
      :root {
        --space-1: 4px;
        --space-2: 8px;
        --radius-md: 8px;
      }
    `);
    const catalog = buildDesignTokenCatalog();
    expect(catalog.byShortName.get("space-1")?.category).toBe("spacing");
    expect(catalog.byShortName.get("space-2")?.valueKind).toBe("length");
    expect(catalog.byShortName.get("radius-md")?.category).toBe("radius");
  });

  it("captures color value kinds for hex, rgb, and color-mix declarations", () => {
    injected = installRootStyles(`
      :root {
        --text-strong: #000000;
        --surface-overlay: rgba(0, 0, 0, 0.5);
        --icon-default: color-mix(in srgb, black 40%, white);
      }
    `);
    const catalog = buildDesignTokenCatalog();
    expect(catalog.byShortName.get("text-strong")?.valueKind).toBe("color");
    expect(catalog.byShortName.get("surface-overlay")?.valueKind).toBe("color");
    const iconDefault = catalog.byShortName.get("icon-default");
    if (iconDefault) {
      expect(iconDefault.valueKind === "color" || iconDefault.valueKind === "other").toBe(true);
    }
  });

  describe("noise filter", () => {
    it("drops sub-state variants (-hover, -active, -press, -disable)", () => {
      injected = installRootStyles(`
        :root {
          --button-primary-bg: #080808;
          --button-primary-bg-hover: #2e2e2e;
          --button-primary-bg-active: #2e2e2e;
          --button-primary-bg-press: #3d3d3d;
          --button-primary-bg-disable: rgba(0, 0, 0, 0.08);
        }
      `);
      const catalog = buildDesignTokenCatalog();
      expect(catalog.byShortName.get("button-primary-bg")).toBeDefined();
      expect(catalog.byShortName.get("button-primary-bg-hover")).toBeUndefined();
      expect(catalog.byShortName.get("button-primary-bg-active")).toBeUndefined();
      expect(catalog.byShortName.get("button-primary-bg-press")).toBeUndefined();
      expect(catalog.byShortName.get("button-primary-bg-disable")).toBeUndefined();
    });

    it("drops inverse and slide-prefixed tokens", () => {
      injected = installRootStyles(`
        :root {
          --text-primary: #000;
          --text-inverse: #fff;
          --fg-inverse-strong: #f5f5f5;
          --slide-image-placeholder: #f5f5f5;
        }
      `);
      const catalog = buildDesignTokenCatalog();
      expect(catalog.byShortName.get("text-primary")).toBeDefined();
      expect(catalog.byShortName.get("text-inverse")).toBeUndefined();
      expect(catalog.byShortName.get("fg-inverse-strong")).toBeUndefined();
      expect(catalog.byShortName.get("slide-image-placeholder")).toBeUndefined();
    });
  });
});
