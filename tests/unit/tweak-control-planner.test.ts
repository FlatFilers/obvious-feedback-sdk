import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { TokenCatalog } from "../../src/widget/design-token-inference";
import { planForProperty } from "../../src/widget/tweak-control-planner";

function makeToken(
  partial: Partial<{
    shortName: string;
    name: string;
    rawValue: string;
    resolvedValue: string;
    category:
      | "text"
      | "background"
      | "border"
      | "radius"
      | "spacing"
      | "state"
      | "raw";
    valueKind: "color" | "length" | "other";
    semanticScore: number;
    source: "manifest" | "runtime";
    applyValue: string;
  }>,
): TokenCatalog["tokens"][number] {
  const shortName = partial.shortName ?? "token";
  const token: TokenCatalog["tokens"][number] = {
    shortName,
    name: partial.name ?? `--${shortName}`,
    rawValue: partial.rawValue ?? partial.resolvedValue ?? "",
    resolvedValue: partial.resolvedValue ?? "",
    category: partial.category ?? "raw",
    valueKind: partial.valueKind ?? "other",
    semanticScore: partial.semanticScore ?? 1,
  };
  if (partial.source) {
    token.source = partial.source;
  }
  if (partial.applyValue) {
    token.applyValue = partial.applyValue;
  }
  return token;
}

function makeCatalog(tokens: TokenCatalog["tokens"]): TokenCatalog {
  const byCategory: TokenCatalog["byCategory"] = {
    text: [],
    background: [],
    border: [],
    radius: [],
    spacing: [],
    state: [],
    raw: [],
  };
  const byShortName = new Map<string, (typeof tokens)[number]>();
  for (const token of tokens) {
    byCategory[token.category].push(token);
    byShortName.set(token.shortName, token);
  }
  return { tokens, byCategory, byShortName };
}

describe("planForProperty", () => {
  let element: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    element = document.createElement("button");
    document.body.appendChild(element);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("only matches font-size tokens to the font-size property", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "font-size-md",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "16px",
        semanticScore: 1,
      }),
      makeToken({
        shortName: "spacing-row-md",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "32px",
        semanticScore: 1.5,
      }),
      makeToken({
        shortName: "tooltip-font-size",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "13px",
        semanticScore: 1.5,
      }),
      makeToken({
        shortName: "radius-md",
        category: "radius",
        valueKind: "length",
        resolvedValue: "8px",
        semanticScore: 2,
      }),
    ]);
    const plan = planForProperty("font-size", catalog, element);
    expect(plan.tokenChips.map((chip) => chip.token.shortName)).toEqual([
      "font-size-md",
    ]);
  });

  it("hides component-scoped font-size tokens from the generic font row", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "tooltip-font-size",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "13px",
        semanticScore: 2,
      }),
      makeToken({
        shortName: "button-font-size",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "14px",
        semanticScore: 2,
      }),
    ]);
    const plan = planForProperty("font-size", catalog, element);
    expect(plan.tokenChips).toHaveLength(0);
    expect(plan.hasTokens).toBe(false);
  });

  it("only matches radius tokens to the border-radius property", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "spacing-row-md",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "32px",
      }),
      makeToken({
        shortName: "radius-2xl",
        category: "radius",
        valueKind: "length",
        resolvedValue: "1rem",
      }),
      makeToken({
        shortName: "radius-md",
        category: "radius",
        valueKind: "length",
        resolvedValue: "0.5rem",
      }),
      makeToken({
        shortName: "tooltip-font-size",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "13px",
      }),
    ]);
    const plan = planForProperty("border-radius", catalog, element);
    expect(plan.tokenChips.map((chip) => chip.token.shortName).sort()).toEqual([
      "radius-2xl",
      "radius-md",
    ]);
  });

  it("caps token chips at 3 per property", () => {
    const tokens = Array.from({ length: 8 }).map((_, idx) =>
      makeToken({
        shortName: `radius-${idx + 1}`,
        category: "radius",
        valueKind: "length",
        resolvedValue: `${(idx + 1) * 4}px`,
        semanticScore: 1.5,
      }),
    );
    const catalog = makeCatalog(tokens);
    const plan = planForProperty("border-radius", catalog, element);
    expect(plan.tokenChips.length).toBe(3);
  });

  it("prefers t-shirt-suffix tokens over numeric scale tokens when scoring ties", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "space-1",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "4px",
        semanticScore: 1,
      }),
      makeToken({
        shortName: "space-2",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "8px",
        semanticScore: 1,
      }),
      makeToken({
        shortName: "space-md",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "16px",
        semanticScore: 1,
      }),
      makeToken({
        shortName: "space-lg",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "24px",
        semanticScore: 1,
      }),
    ]);
    const plan = planForProperty("padding", catalog, element);
    const labels = plan.tokenChips.map((chip) => chip.label);
    expect(labels.includes("MD")).toBe(true);
    expect(labels.includes("LG")).toBe(true);
  });

  it("does not use row-height tokens as generic padding options", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "spacing-row-md",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "32px",
        semanticScore: 1.5,
      }),
    ]);
    const plan = planForProperty("padding", catalog, element);
    expect(plan.tokenChips).toHaveLength(0);
  });

  it("emits a numeric label for `--space-2`", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "space-2",
        category: "spacing",
        valueKind: "length",
        resolvedValue: "8px",
        semanticScore: 1,
      }),
    ]);
    const plan = planForProperty("padding", catalog, element);
    expect(plan.tokenChips[0]?.label).toBe("2");
  });

  it("strips text- prefix for color tokens and Title-cases the rest", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "text-primary",
        category: "text",
        valueKind: "color",
        resolvedValue: "#000",
        semanticScore: 2,
      }),
      makeToken({
        shortName: "text-secondary",
        category: "text",
        valueKind: "color",
        resolvedValue: "#666",
        semanticScore: 2,
      }),
    ]);
    const plan = planForProperty("color", catalog, element);
    const labels = plan.tokenChips.map((chip) => chip.label);
    expect(labels).toContain("Primary");
    expect(labels).toContain("Secondary");
  });

  it("prefers manifest tokens over runtime-inferred tokens", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "surface-runtime",
        category: "background",
        valueKind: "color",
        resolvedValue: "rgb(1, 1, 1)",
        semanticScore: 2,
        source: "runtime",
      }),
      makeToken({
        shortName: "bg-surface-primary",
        name: "bg-surface-primary",
        category: "background",
        valueKind: "color",
        resolvedValue: "rgb(255, 255, 255)",
        semanticScore: 1,
        source: "manifest",
        applyValue: "rgb(255, 255, 255)",
      }),
    ]);
    const plan = planForProperty("background-color", catalog, element);
    expect(plan.tokenChips[0]?.token.name).toBe("bg-surface-primary");
    expect(plan.tokenChips[0]?.label).toBe("Primary");
    expect(plan.tokenChips[0]?.applyValue).toBe("rgb(255, 255, 255)");
  });

  it("returns no token chips when nothing matches the property name patterns", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "neutral-500",
        category: "raw",
        valueKind: "color",
        resolvedValue: "#999",
        semanticScore: 0,
      }),
    ]);
    const plan = planForProperty("color", catalog, element);
    expect(plan.tokenChips.length).toBe(0);
  });

  it("returns an empty plan with hasTokens false when no tokens match", () => {
    const empty = makeCatalog([]);
    const paddingPlan = planForProperty("padding", empty, element);
    const colorPlan = planForProperty("color", empty, element);
    expect(paddingPlan.tokenChips.length).toBe(0);
    expect(paddingPlan.hasTokens).toBe(false);
    expect(colorPlan.tokenChips.length).toBe(0);
    expect(colorPlan.hasTokens).toBe(false);
  });

  it("flags hasTokens true when the catalog covers the property", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "radius-md",
        category: "radius",
        valueKind: "length",
        resolvedValue: "8px",
      }),
    ]);
    const plan = planForProperty("border-radius", catalog, element);
    expect(plan.hasTokens).toBe(true);
    expect(plan.tokenChips.length).toBe(1);
  });

  it("token chips apply var(--name) so the live preview tracks the runtime token", () => {
    const catalog = makeCatalog([
      makeToken({
        shortName: "radius-md",
        name: "--radius-md",
        category: "radius",
        valueKind: "length",
        resolvedValue: "8px",
      }),
    ]);
    const plan = planForProperty("border-radius", catalog, element);
    expect(plan.tokenChips[0]?.applyValue).toBe("var(--radius-md)");
  });
});
