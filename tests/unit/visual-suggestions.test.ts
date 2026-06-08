import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  cssColorToHex,
  getApplicableProperties,
  getSliderConfig,
  parseNumericValue,
  sanitizeSuggestionValue,
} from "../../src/widget/visual-suggestions";

describe("visual-suggestions helpers", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("sanitizeSuggestionValue", () => {
    it("trims whitespace", () => {
      expect(sanitizeSuggestionValue("  16px  ")).toBe("16px");
    });

    it("rejects multi-declarations and url()", () => {
      expect(sanitizeSuggestionValue("16px; color: red")).toBe("");
      expect(sanitizeSuggestionValue("url(https://evil)")).toBe("");
      expect(sanitizeSuggestionValue("@import")).toBe("");
    });

    it("clamps overly long values", () => {
      const long = "a".repeat(200);
      expect(sanitizeSuggestionValue(long).length).toBe(120);
    });
  });

  describe("parseNumericValue", () => {
    it("parses px / rem / em / %", () => {
      expect(parseNumericValue("12px")).toEqual({ value: 12, unit: "px" });
      expect(parseNumericValue("1.5rem")).toEqual({ value: 1.5, unit: "rem" });
      expect(parseNumericValue("100%")).toEqual({ value: 100, unit: "%" });
    });

    it("returns null for unparseable values", () => {
      expect(parseNumericValue("auto")).toBeNull();
      expect(parseNumericValue("")).toBeNull();
    });
  });

  describe("cssColorToHex", () => {
    it("normalizes shorthand hex", () => {
      expect(cssColorToHex("#abc")).toBe("#aabbcc");
    });

    it("strips alpha", () => {
      expect(cssColorToHex("#aabbcc44")).toBe("#aabbcc");
    });

    it("converts rgb(...) to hex", () => {
      expect(cssColorToHex("rgb(255, 0, 0)")).toBe("#ff0000");
    });

    it("falls back to black on unparseable input", () => {
      expect(cssColorToHex("transparent")).toBe("#000000");
      expect(cssColorToHex("not-a-color")).toBe("#000000");
    });
  });

  describe("getSliderConfig", () => {
    it("returns config for numeric properties only", () => {
      expect(getSliderConfig("padding")).not.toBeNull();
      expect(getSliderConfig("font-size")).not.toBeNull();
      expect(getSliderConfig("color")).toBeNull();
      expect(getSliderConfig("background-color")).toBeNull();
    });
  });

  describe("getApplicableProperties", () => {
    it("excludes background-color for plain text-only nodes", () => {
      const span = document.createElement("span");
      span.textContent = "hi";
      document.body.appendChild(span);
      const props = getApplicableProperties(span);
      expect(props.includes("background-color")).toBe(false);
      expect(props.includes("font-size")).toBe(true);
      expect(props.includes("color")).toBe(true);
    });

    it("includes gap only on flex/grid containers", () => {
      const flex = document.createElement("div");
      flex.style.display = "flex";
      document.body.appendChild(flex);
      expect(getApplicableProperties(flex).includes("gap")).toBe(true);

      const block = document.createElement("div");
      document.body.appendChild(block);
      expect(getApplicableProperties(block).includes("gap")).toBe(false);
    });
  });
});
