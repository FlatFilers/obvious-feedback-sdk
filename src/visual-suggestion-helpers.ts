import type {
  ElementGrabItem,
  FeedbackVisualSuggestionElementRef,
  FeedbackVisualSuggestionProperty,
} from "./index";

export const VISUAL_SUGGESTION_PROPERTIES: FeedbackVisualSuggestionProperty[] =
  ["font-size", "border-radius", "padding", "gap", "color", "background-color"];

export const VISUAL_SUGGESTION_PROPERTY_LABELS: Record<
  FeedbackVisualSuggestionProperty,
  string
> = {
  "font-size": "Font size",
  "border-radius": "Border radius",
  padding: "Padding",
  gap: "Gap",
  color: "Text color",
  "background-color": "Background",
};

export type NumericSliderConfig = {
  min: number;
  max: number;
  step: number;
  unit: "px" | "rem" | "";
};

const VISUAL_SUGGESTION_SLIDERS: Partial<
  Record<FeedbackVisualSuggestionProperty, NumericSliderConfig>
> = {
  "font-size": { min: 8, max: 96, step: 1, unit: "px" },
  "border-radius": { min: 0, max: 64, step: 1, unit: "px" },
  padding: { min: 0, max: 80, step: 2, unit: "px" },
  gap: { min: 0, max: 80, step: 2, unit: "px" },
};

export function getVisualSuggestionSliderConfig(
  property: FeedbackVisualSuggestionProperty,
): NumericSliderConfig | null {
  return VISUAL_SUGGESTION_SLIDERS[property] ?? null;
}

export function isVisualSuggestionColorProperty(
  property: FeedbackVisualSuggestionProperty,
): boolean {
  return property === "color" || property === "background-color";
}

export interface ParsedCssValue {
  value: number;
  unit: "px" | "rem" | "em" | "%" | "";
}

export function parseCssNumericValue(raw: string): ParsedCssValue | null {
  if (!raw) return null;
  const first = raw.trim().split(/\s+/)[0] ?? "";
  const match = first.match(/^(-?(?:\d*\.?\d+)(?:e[+-]?\d+)?)(px|rem|em|%)?$/i);
  if (!match) return null;
  const value = Number.parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;
  const unit = (match[2] ?? "").toLowerCase() as ParsedCssValue["unit"];
  return { value, unit: unit === "" ? "" : unit };
}

export function formatCssNumericValue(
  value: number,
  unit: ParsedCssValue["unit"],
): string {
  const rounded = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2).replace(/\.?0+$/, "");
  if (!unit) return rounded;
  return `${rounded}${unit}`;
}

export function cssColorToHex(raw: string): string {
  const value = raw.trim().toLowerCase();
  if (!value || value === "transparent") return "#000000";
  if (value.startsWith("#")) {
    if (value.length === 4) {
      const r = value[1];
      const g = value[2];
      const b = value[3];
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    if (value.length === 7) return value;
    if (value.length === 9) return value.slice(0, 7);
  }
  const match = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    const [, r, g, b] = match;
    const toHex = (s: string) =>
      Number.parseInt(s, 10).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  return "#000000";
}

export function isVisualSuggestionProperty(
  value: unknown,
): value is FeedbackVisualSuggestionProperty {
  return (
    typeof value === "string" &&
    (VISUAL_SUGGESTION_PROPERTIES as string[]).includes(value)
  );
}

export function createVisualSuggestionId(): string {
  return `fvs_${Math.random().toString(36).slice(2, 10)}`;
}

export function getVisualSuggestionComputedValue(
  element: Element,
  property: FeedbackVisualSuggestionProperty,
): string {
  try {
    return window.getComputedStyle(element).getPropertyValue(property).trim();
  } catch {
    return "";
  }
}

export function buildVisualSuggestionPrompt(
  element: FeedbackVisualSuggestionElementRef,
  property: FeedbackVisualSuggestionProperty,
  originalValue: string,
  suggestedValue: string,
): string {
  const label = VISUAL_SUGGESTION_PROPERTY_LABELS[property] ?? property;
  const name = element.componentName ?? element.tagName.toLowerCase();
  const location =
    element.sourceFile && element.lineNumber !== null
      ? ` (${element.sourceFile}:${element.lineNumber})`
      : element.sourceFile
        ? ` (${element.sourceFile})`
        : "";
  const target = `${name}${location} — selector \`${element.cssSelector}\``;
  const originalText = originalValue ? originalValue : "(unspecified)";
  const suggestedText = suggestedValue ? suggestedValue : "(unspecified)";
  return `Change ${label.toLowerCase()} on ${target} from \`${originalText}\` to \`${suggestedText}\`.`;
}

export function createVisualSuggestionElementRef(
  grab: ElementGrabItem,
): FeedbackVisualSuggestionElementRef {
  return {
    id: grab.id,
    tagName: grab.tagName,
    cssSelector: grab.cssSelector,
    boundingRect: grab.boundingRect,
    componentName: grab.componentName,
    sourceFile: grab.sourceFile,
    lineNumber: grab.lineNumber,
  };
}

export function getDefaultScrubStart(
  property: FeedbackVisualSuggestionProperty,
): {
  value: number;
  unit: "px" | "rem" | "";
} {
  const slider = VISUAL_SUGGESTION_SLIDERS[property];
  if (slider) return { value: slider.min, unit: slider.unit };
  return { value: 0, unit: "px" };
}

export function sanitizeVisualSuggestionValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/[;{}@]/.test(trimmed)) return "";
  if (/url\(/i.test(trimmed)) return "";
  if (trimmed.length > 120) return trimmed.slice(0, 120);
  return trimmed;
}
