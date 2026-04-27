import { describe, expect, it } from "bun:test";

import {
  cssColorToHex,
  formatCssNumericValue,
  getVisualSuggestionSliderConfig,
  isVisualSuggestionColorProperty,
  parseCssNumericValue,
  sanitizeVisualSuggestionValue,
} from "./visual-suggestion-helpers";

describe("parseCssNumericValue", () => {
  it("parses plain px values", () => {
    expect(parseCssNumericValue("16px")).toEqual({ value: 16, unit: "px" });
  });

  it("parses decimal values", () => {
    expect(parseCssNumericValue("1.5rem")).toEqual({ value: 1.5, unit: "rem" });
  });

  it("parses percentages", () => {
    expect(parseCssNumericValue("50%")).toEqual({ value: 50, unit: "%" });
  });

  it("parses unitless numbers", () => {
    expect(parseCssNumericValue("3")).toEqual({ value: 3, unit: "" });
  });

  it("returns only the first token for shorthand values", () => {
    // padding: 8px 16px 8px 16px → slider starts from 8px
    expect(parseCssNumericValue("8px 16px 8px 16px")).toEqual({
      value: 8,
      unit: "px",
    });
  });

  it("returns null for non-numeric strings", () => {
    expect(parseCssNumericValue("red")).toBeNull();
    expect(parseCssNumericValue("")).toBeNull();
    expect(parseCssNumericValue("calc(1rem + 2px)")).toBeNull();
  });

  it("handles negative numbers", () => {
    expect(parseCssNumericValue("-4px")).toEqual({ value: -4, unit: "px" });
  });

  it("parses browser scientific notation values", () => {
    expect(parseCssNumericValue("1.67772e+07px")).toEqual({
      value: 16777200,
      unit: "px",
    });
  });
});

describe("formatCssNumericValue", () => {
  it("formats integers without trailing zeros", () => {
    expect(formatCssNumericValue(16, "px")).toBe("16px");
  });

  it("formats decimals without dangling zeros", () => {
    expect(formatCssNumericValue(1.5, "rem")).toBe("1.5rem");
    expect(formatCssNumericValue(1.25, "rem")).toBe("1.25rem");
  });

  it("handles the unitless case", () => {
    expect(formatCssNumericValue(3, "")).toBe("3");
  });
});

describe("cssColorToHex", () => {
  it("expands short hex", () => {
    expect(cssColorToHex("#abc")).toBe("#aabbcc");
  });

  it("passes through 6-digit hex", () => {
    expect(cssColorToHex("#FF8800")).toBe("#ff8800");
  });

  it("strips alpha from 8-digit hex", () => {
    expect(cssColorToHex("#ff8800aa")).toBe("#ff8800");
  });

  it("converts rgb() to hex", () => {
    expect(cssColorToHex("rgb(255, 0, 0)")).toBe("#ff0000");
  });

  it("converts rgba() to hex, ignoring alpha", () => {
    expect(cssColorToHex("rgba(0, 128, 255, 0.5)")).toBe("#0080ff");
  });

  it("falls back to black for transparent and unknowns", () => {
    expect(cssColorToHex("transparent")).toBe("#000000");
    expect(cssColorToHex("currentColor")).toBe("#000000");
    expect(cssColorToHex("")).toBe("#000000");
  });
});

describe("getVisualSuggestionSliderConfig", () => {
  it("returns configs for all numeric properties", () => {
    expect(getVisualSuggestionSliderConfig("font-size")).toMatchObject({
      min: 8,
      max: 96,
      unit: "px",
    });
    expect(getVisualSuggestionSliderConfig("border-radius")).toMatchObject({
      min: 0,
      unit: "px",
    });
    expect(getVisualSuggestionSliderConfig("padding")).toMatchObject({
      step: 2,
    });
    expect(getVisualSuggestionSliderConfig("gap")).toMatchObject({ step: 2 });
  });

  it("returns null for color properties", () => {
    expect(getVisualSuggestionSliderConfig("color")).toBeNull();
    expect(getVisualSuggestionSliderConfig("background-color")).toBeNull();
  });
});

describe("isVisualSuggestionColorProperty", () => {
  it("flags color and background-color", () => {
    expect(isVisualSuggestionColorProperty("color")).toBe(true);
    expect(isVisualSuggestionColorProperty("background-color")).toBe(true);
  });

  it("returns false for numeric properties", () => {
    expect(isVisualSuggestionColorProperty("font-size")).toBe(false);
    expect(isVisualSuggestionColorProperty("padding")).toBe(false);
  });
});

describe("sanitizeVisualSuggestionValue", () => {
  it("preserves clean values", () => {
    expect(sanitizeVisualSuggestionValue("16px")).toBe("16px");
    expect(sanitizeVisualSuggestionValue("#ff0000")).toBe("#ff0000");
  });

  it("blocks CSS injection attempts", () => {
    expect(sanitizeVisualSuggestionValue("16px; color: red")).toBe("");
    expect(sanitizeVisualSuggestionValue('{ content: "x" }')).toBe("");
    expect(sanitizeVisualSuggestionValue("url(evil)")).toBe("");
    expect(sanitizeVisualSuggestionValue("@import")).toBe("");
  });

  it("caps absurdly long values", () => {
    const input = "a".repeat(300);
    const result = sanitizeVisualSuggestionValue(input);
    expect(result.length).toBe(120);
  });

  it("trims whitespace", () => {
    expect(sanitizeVisualSuggestionValue("  16px  ")).toBe("16px");
  });
});
