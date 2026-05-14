import type { ElementGrabHoverInfo, ElementGrabItem, ElementGrabRect } from "../public-types";
import { truncateText } from "../utils/html";

export function createElementGrabId(): string {
  return `element_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function buildCssSelector(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  while (current && depth < 5) {
    const tagName = current.tagName.toLowerCase();
    const elementId = current.getAttribute("id");
    if (elementId) {
      segments.unshift(`#${escapeCssIdentifier(elementId)}`);
      break;
    }
    const className = current.getAttribute("class");
    const normalizedClass = className
      ?.trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((name) => `.${escapeCssIdentifier(name)}`)
      .join("");
    const parent: Element | null = current.parentElement;
    const elementIndex = parent
      ? Array.from(parent.children).indexOf(current) + 1
      : 0;
    const nthChild = elementIndex > 0 ? `:nth-child(${elementIndex})` : "";
    segments.unshift(`${tagName}${normalizedClass ?? ""}${nthChild}`);
    current = parent;
    depth += 1;
  }
  return segments.join(" > ");
}

export function escapeCssIdentifier(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function truncateOuterHtml(element: Element, maxLength = 500): string {
  return truncateText(element.outerHTML.replace(/\s+/g, " ").trim(), maxLength);
}

export function createElementGrabRect(rect: DOMRect): ElementGrabRect {
  return {
    x: Math.round(rect.left),
    y: Math.round(rect.top),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

export function getElementGrabDisplayName(
  info: ElementGrabHoverInfo | ElementGrabItem,
): string {
  if (info.componentName) {
    return info.componentName;
  }
  return `<${info.tagName.toLowerCase()}>`;
}

export function getElementGrabHoverLabel(info: ElementGrabHoverInfo): string {
  if (info.componentName) {
    const location = info.sourceFile ? getShortFileName(info.sourceFile) : null;
    const lineSuffix = info.lineNumber ? `:${info.lineNumber}` : "";
    return location
      ? `${info.componentName} at ${location}${lineSuffix}`
      : info.componentName;
  }
  return `<${info.tagName.toLowerCase()}>`;
}

export function getShortFileName(filePath: string): string {
  const segments = filePath.split("/");
  return segments[segments.length - 1] ?? filePath;
}

