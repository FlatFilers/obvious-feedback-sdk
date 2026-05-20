import type {
  FeedbackVisualSuggestion,
  FeedbackVisualSuggestionElementRef,
  FeedbackVisualSuggestionProperty,
  FeedbackVisualSuggestionScope,
} from "./public-types";
import { truncateText } from "./utils/html";
import { MAX_VISUAL_SUGGESTION_SCOPE_DEPTH, MAX_VISUAL_SUGGESTION_SCOPE_TARGETS } from "./constants";

export type VisualSuggestionTargetKind = "text" | "control" | "field" | "container";

export function normalizeVisualSuggestionTarget(target: HTMLElement): HTMLElement {
  const interactiveParent = target.closest(
    'button, a, [role="button"], [role="tab"], [role="menuitem"]',
  );
  if (
    interactiveParent instanceof HTMLElement &&
    getVisualSuggestionTargetLabel(interactiveParent) === "Card" &&
    getVisualSuggestionTargetKind(target) === "text"
  ) {
    return target;
  }
  if (
    target.matches(
      'button, a, [role="button"], [role="tab"], [role="menuitem"]',
    )
  ) {
    return target;
  }
  return interactiveParent instanceof HTMLElement ? interactiveParent : target;
}

export function getVisualSuggestionTargetKind(
  element: HTMLElement,
): VisualSuggestionTargetKind {
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
  const text = getVisualSuggestionElementLabel(element);
  const hasTextOnlyShape = text.length > 0 && element.children.length <= 2;
  return hasTextOnlyShape ? "text" : "container";
}

export function getVisualSuggestionTargetLabel(element: HTMLElement): string {
  const kind = getVisualSuggestionTargetKind(element);
  const rect = element.getBoundingClientRect();
  if (kind === "control") {
    if (rect.width >= 180 && rect.height >= 90) return "Card";
    if (rect.height <= 48 && rect.width <= 260) return "Pill";
    return element.tagName.toLowerCase() === "a" ? "Link" : "Button";
  }
  if (kind === "field") return "Field";
  if (kind === "text") {
    return /^h[1-6]$/i.test(element.tagName) ? "Heading" : "Text";
  }
  return "Container";
}

export function getVisualSuggestionRefLabel(
  ref: FeedbackVisualSuggestionElementRef,
  suggestions?: readonly FeedbackVisualSuggestion[],
): string {
  const siblingScope = suggestions?.find(
    (suggestion) => suggestion.scope?.kind === "similar-siblings",
  )?.scope;
  if (siblingScope) {
    return `${siblingScope.label.replace(" in this row/group", "")} (${
      siblingScope.matchedCount
    })`;
  }

  const tagName = ref.tagName.toLowerCase();
  const rect = ref.boundingRect;
  if (tagName === "button" || tagName === "a") {
    if (rect.width >= 180 && rect.height >= 90) return "Card";
    if (rect.height <= 48 && rect.width <= 260) return "Pill";
    return tagName === "a" ? "Link" : "Button";
  }
  if (tagName === "input" || tagName === "textarea") return "Field";
  if (/^h[1-6]$/.test(tagName)) return "Heading";
  if (tagName === "p" || tagName === "span") return "Text";
  return ref.componentName ?? tagName;
}

export function pluralizeVisualSuggestionTargetLabel(label: string): string {
  const lower = label.toLowerCase();
  if (lower.endsWith("s")) return lower;
  if (lower.endsWith("y")) return `${lower.slice(0, -1)}ies`;
  return `${lower}s`;
}

export function supportsVisualSuggestionSiblingScope(label: string): boolean {
  return ["Pill", "Card", "Button", "Link"].includes(label);
}

export function isTransparentCssColor(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "transparent") return true;
  const rgbaMatch = normalized.match(
    /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+%?))?\s*\)$/,
  );
  if (!rgbaMatch) return false;
  const alpha = rgbaMatch[1];
  if (!alpha) return false;
  return alpha.endsWith("%")
    ? Number.parseFloat(alpha) === 0
    : Number.parseFloat(alpha) === 0;
}

export function hasVisibleBorderSide(
  style: CSSStyleDeclaration,
  side: "Top" | "Right" | "Bottom" | "Left",
): boolean {
  const borderStyle = style.getPropertyValue(
    `border-${side.toLowerCase()}-style`,
  );
  if (borderStyle === "none" || borderStyle === "hidden") return false;

  const borderWidth = Number.parseFloat(
    style.getPropertyValue(`border-${side.toLowerCase()}-width`),
  );
  if (!Number.isFinite(borderWidth) || borderWidth <= 0) return false;

  return !isTransparentCssColor(
    style.getPropertyValue(`border-${side.toLowerCase()}-color`),
  );
}

export function hasVisibleRoundedSurface(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const hasBackground =
    !isTransparentCssColor(style.backgroundColor) ||
    style.backgroundImage !== "none";
  const hasBorder =
    hasVisibleBorderSide(style, "Top") ||
    hasVisibleBorderSide(style, "Right") ||
    hasVisibleBorderSide(style, "Bottom") ||
    hasVisibleBorderSide(style, "Left");
  const hasShadow = style.boxShadow !== "none";
  const clipsContent = [style.overflow, style.overflowX, style.overflowY].some(
    (value) => ["hidden", "clip", "scroll", "auto"].includes(value),
  );

  return hasBackground || hasBorder || hasShadow || clipsContent;
}

export function getVisualSuggestionTargetProperties(
  element: HTMLElement,
  kind: VisualSuggestionTargetKind,
): FeedbackVisualSuggestionProperty[] {
  const style = window.getComputedStyle(element);
  const isLayoutContainer = style.display === "flex" || style.display === "grid";
  const layoutProperties: FeedbackVisualSuggestionProperty[] =
    isLayoutContainer ? ["gap"] : [];
  const shapeProperties: FeedbackVisualSuggestionProperty[] =
    hasVisibleRoundedSurface(element) ? ["border-radius"] : [];

  if (kind === "text") {
    return ["font-size", "color"];
  }

  if (
    kind === "container" ||
    getVisualSuggestionTargetLabel(element) === "Card"
  ) {
    return [
      ...shapeProperties,
      "padding",
      ...layoutProperties,
      "background-color",
    ];
  }

  return [
    "font-size",
    ...shapeProperties,
    "padding",
    ...layoutProperties,
    "color",
    "background-color",
  ];
}

export function isElementVisibleForScope(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) {
    return false;
  }
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

export function getClassTokens(element: HTMLElement): Set<string> {
  return new Set(
    (element.getAttribute("class") ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean),
  );
}

export function getVisualSuggestionElementLabel(element: HTMLElement): string {
  return truncateText(
    (element.getAttribute("aria-label") ?? element.textContent ?? "")
      .trim()
      .replace(/\s+/g, " "),
    80,
  );
}

export function hasSimilarDimensions(a: DOMRect, b: DOMRect): boolean {
  const widthRatio = b.width / Math.max(a.width, 1);
  const heightRatio = b.height / Math.max(a.height, 1);
  return (
    widthRatio >= 0.45 &&
    widthRatio <= 2.4 &&
    heightRatio >= 0.45 &&
    heightRatio <= 2.4
  );
}

export function isSimilarVisualSuggestionElement(
  selected: HTMLElement,
  candidate: HTMLElement,
): boolean {
  if (candidate === selected) {
    return true;
  }
  if (candidate.tagName !== selected.tagName) {
    return false;
  }
  const selectedRole = selected.getAttribute("role") ?? "";
  const candidateRole = candidate.getAttribute("role") ?? "";
  if (selectedRole && candidateRole && selectedRole !== candidateRole) {
    return false;
  }
  if (
    !hasSimilarDimensions(
      selected.getBoundingClientRect(),
      candidate.getBoundingClientRect(),
    )
  ) {
    return false;
  }
  const selectedClasses = getClassTokens(selected);
  const candidateClasses = getClassTokens(candidate);
  if (selectedClasses.size === 0 || candidateClasses.size === 0) {
    return true;
  }
  let shared = 0;
  for (const token of selectedClasses) {
    if (candidateClasses.has(token)) {
      shared += 1;
    }
  }
  const overlap = shared / Math.max(selectedClasses.size, candidateClasses.size);
  return overlap >= 0.35;
}

export function findSimilarSiblingScope(
  selected: HTMLElement,
): { parent: HTMLElement; elements: HTMLElement[] } | null {
  let ancestor = selected.parentElement;
  let depth = 0;
  while (ancestor && depth < MAX_VISUAL_SUGGESTION_SCOPE_DEPTH) {
    const candidates = Array.from(
      ancestor.querySelectorAll(selected.tagName.toLowerCase()),
    )
      .filter((candidate): candidate is HTMLElement => {
        return (
          candidate instanceof HTMLElement &&
          isElementVisibleForScope(candidate) &&
          isSimilarVisualSuggestionElement(selected, candidate)
        );
      })
      .sort((a, b) => {
        if (a === b) return 0;
        return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1;
      });

    if (
      candidates.includes(selected) &&
      candidates.length >= 2 &&
      candidates.length <= MAX_VISUAL_SUGGESTION_SCOPE_TARGETS
    ) {
      return { parent: ancestor, elements: candidates };
    }

    ancestor = ancestor.parentElement;
    depth += 1;
  }
  return null;
}

