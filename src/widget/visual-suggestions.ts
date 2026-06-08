/**
 * Visual suggestions — metadata, sanitization, and target-aware property
 * detection for the per-pin "Tweak" panel. Each pin captures the picked
 * element's relevant computed style properties and exposes only the controls
 * that apply (e.g. only show `gap` for flex/grid containers).
 *
 * Mutations are applied inline on the live element so the page reflects the
 * change in real time. Overrides persist across popover close/reopen and are
 * restored when the pin is deleted, the round is submitted, or the SDK is
 * destroyed. Submission includes overrides as a `visualSuggestions` array on
 * each round item.
 */

import type { FeedbackVisualSuggestionProperty } from "../public-types";

export const VISUAL_SUGGESTION_PROPERTIES: readonly FeedbackVisualSuggestionProperty[] =
  ["font-size", "border-radius", "padding", "gap", "color", "background-color"];

export const VISUAL_SUGGESTION_PROPERTY_LABELS: Record<
  FeedbackVisualSuggestionProperty,
  string
> = {
  "font-size": "Font",
  "border-radius": "Radius",
  padding: "Padding",
  gap: "Gap",
  color: "Text",
  "background-color": "Background",
};

export interface NumericSliderConfig {
  min: number;
  max: number;
  step: number;
  unit: "px";
}

const NUMERIC_SLIDERS: Partial<
  Record<FeedbackVisualSuggestionProperty, NumericSliderConfig>
> = {
  "font-size": { min: 8, max: 96, step: 1, unit: "px" },
  "border-radius": { min: 0, max: 64, step: 1, unit: "px" },
  padding: { min: 0, max: 80, step: 2, unit: "px" },
  gap: { min: 0, max: 80, step: 2, unit: "px" },
};

export function getSliderConfig(
  property: FeedbackVisualSuggestionProperty,
): NumericSliderConfig | null {
  return NUMERIC_SLIDERS[property] ?? null;
}

export function isColorProperty(
  property: FeedbackVisualSuggestionProperty,
): property is "color" | "background-color" {
  return property === "color" || property === "background-color";
}

/**
 * Lightweight value sanitizer — rejects multi-declarations, url(), and
 * unreasonably long strings. Mirrors the original SDK's behavior to keep
 * inline style mutations safe.
 */
export function sanitizeSuggestionValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  if (/[;{}@]/.test(trimmed)) {
    return "";
  }
  if (/url\(/i.test(trimmed)) {
    return "";
  }
  if (trimmed.length > 120) {
    return trimmed.slice(0, 120);
  }
  return trimmed;
}

/** Read the computed value of a property; returns "" if the lookup throws. */
export function getComputedSuggestionValue(
  element: Element,
  property: FeedbackVisualSuggestionProperty,
): string {
  try {
    return window.getComputedStyle(element).getPropertyValue(property).trim();
  } catch {
    return "";
  }
}

interface ParsedNumeric {
  value: number;
  unit: "px" | "rem" | "em" | "%" | "";
}

/**
 * Parse a CSS numeric value (first token only). Used to seed slider initial
 * positions from the element's current computed style.
 */
export function parseNumericValue(raw: string): ParsedNumeric | null {
  if (!raw) {
    return null;
  }
  const first = raw.trim().split(/\s+/)[0] ?? "";
  const match = first.match(
    /^(-?(?:\d*\.?\d+)(?:e[+-]?\d+)?)(px|rem|em|%)?$/i,
  );
  if (!match) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) {
    return null;
  }
  const rawUnit = (match[2] ?? "").toLowerCase();
  if (
    rawUnit === "" ||
    rawUnit === "px" ||
    rawUnit === "rem" ||
    rawUnit === "em" ||
    rawUnit === "%"
  ) {
    return { value, unit: rawUnit };
  }
  return null;
}

/**
 * Convert any CSS color string the browser produced (rgb, rgba, hex) into a
 * 7-char hex string suitable for `<input type="color">`. Falls back to black
 * for unparseable / transparent values.
 */
export function cssColorToHex(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value || value === "transparent") {
    return "#000000";
  }
  if (value.startsWith("#")) {
    if (value.length === 4) {
      const r = value[1];
      const g = value[2];
      const b = value[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    if (value.length === 7) {
      return value;
    }
    if (value.length === 9) {
      return value.slice(0, 7);
    }
  }
  const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    const [, r, g, b] = match;
    const toHex = (segment: string): string =>
      Number.parseInt(segment, 10).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return "#000000";
}

type TargetKind = "text" | "control" | "field" | "container";

function getTargetKind(element: HTMLElement): TargetKind {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  if (
    tagName === "input" ||
    tagName === "textarea" ||
    element.isContentEditable ||
    role === "textbox"
  ) {
    return "field";
  }
  if (
    tagName === "button" ||
    tagName === "a" ||
    role === "button" ||
    role === "tab" ||
    role === "menuitem"
  ) {
    return "control";
  }
  if (/^h[1-6]$/.test(tagName) || tagName === "p" || tagName === "span") {
    return "text";
  }
  return "container";
}

function isTransparentColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "transparent") {
    return true;
  }
  const match = normalized.match(
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+%?))?\s*\)$/,
  );
  if (!match) {
    return false;
  }
  const alpha = match[1];
  if (!alpha) {
    return false;
  }
  const numeric = alpha.endsWith("%")
    ? Number.parseFloat(alpha)
    : Number.parseFloat(alpha) * 100;
  return numeric === 0;
}

function hasVisibleSurface(element: HTMLElement): boolean {
  let style: CSSStyleDeclaration;
  try {
    style = window.getComputedStyle(element);
  } catch {
    return false;
  }
  const hasBackground =
    !isTransparentColor(style.backgroundColor) ||
    style.backgroundImage !== "none";
  const hasShadow = style.boxShadow !== "none";
  const sides: ("top" | "right" | "bottom" | "left")[] = [
    "top",
    "right",
    "bottom",
    "left",
  ];
  const hasBorder = sides.some((side) => {
    const borderStyle = style.getPropertyValue(`border-${side}-style`);
    if (borderStyle === "none" || borderStyle === "hidden") {
      return false;
    }
    const width = Number.parseFloat(
      style.getPropertyValue(`border-${side}-width`),
    );
    if (!Number.isFinite(width) || width <= 0) {
      return false;
    }
    return !isTransparentColor(
      style.getPropertyValue(`border-${side}-color`),
    );
  });
  return hasBackground || hasShadow || hasBorder;
}

/**
 * Returns the subset of properties that make sense for a given element. We
 * always include text + spacing controls; conditional ones (gap, radius,
 * background) require the element to actually have that property in play.
 */
export function getApplicableProperties(
  element: HTMLElement,
): FeedbackVisualSuggestionProperty[] {
  const kind = getTargetKind(element);
  let style: CSSStyleDeclaration | null = null;
  try {
    style = window.getComputedStyle(element);
  } catch {
    style = null;
  }
  const isLayoutContainer =
    style !== null &&
    (style.display === "flex" ||
      style.display === "inline-flex" ||
      style.display === "grid" ||
      style.display === "inline-grid");
  const showRadius = hasVisibleSurface(element);
  const showBackground = kind !== "text";

  const result: FeedbackVisualSuggestionProperty[] = ["font-size"];
  if (showRadius) {
    result.push("border-radius");
  }
  result.push("padding");
  if (isLayoutContainer) {
    result.push("gap");
  }
  result.push("color");
  if (showBackground) {
    result.push("background-color");
  }
  return result;
}
