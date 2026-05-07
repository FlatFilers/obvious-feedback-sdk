import {
  MAX_ATTR_LENGTH,
  MAX_DOM_NODES,
  MAX_TEXT_LENGTH,
  SENSITIVE_ATTRS,
} from "../constants";
import { truncateText } from "../utils/html";

export interface DomSnapshotNode {
  tag: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: DomSnapshotNode[];
  redacted?: boolean;
  truncated?: boolean;
}

function isSensitiveElement(
  element: Element,
  redactSelectors: string[],
): boolean {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  if (
    element.getAttribute("type") === "password" ||
    element.hasAttribute("data-sensitive")
  ) {
    return true;
  }
  return redactSelectors.some((selector) => {
    try {
      return element.matches(selector);
    } catch {
      return false;
    }
  });
}

export function serializeDomSnapshot(
  root: Element,
  redactSelectors: string[],
): DomSnapshotNode {
  let visitedNodes = 0;

  function walk(element: Element): DomSnapshotNode {
    visitedNodes += 1;
    if (visitedNodes > MAX_DOM_NODES) {
      return { tag: element.tagName.toLowerCase(), truncated: true };
    }

    if (isSensitiveElement(element, redactSelectors)) {
      return { tag: element.tagName.toLowerCase(), redacted: true };
    }

    const attrs: Record<string, string> = {};
    for (const attr of Array.from(element.attributes).slice(0, 20)) {
      if (SENSITIVE_ATTRS.has(attr.name.toLowerCase())) {
        continue;
      }
      attrs[attr.name] = truncateText(attr.value, MAX_ATTR_LENGTH);
    }

    const children = Array.from(element.children)
      .slice(0, 30)
      .map((child) => walk(child));

    const text = truncateText(
      (element.textContent ?? "").trim().replace(/\s+/g, " "),
      MAX_TEXT_LENGTH,
    );

    return {
      tag: element.tagName.toLowerCase(),
      ...(text ? { text } : {}),
      ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
      ...(children.length > 0 ? { children } : {}),
    };
  }

  return walk(root);
}
