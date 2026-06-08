/**
 * `.obvious/design/tokens.md` manifest parser.
 *
 * The SDK receives the markdown from the host app, extracts documented tokens,
 * and resolves them against the live page so tweak chips can preview concrete
 * CSS values while still submitting the canonical class or CSS variable name.
 */

import {
  createTokenCatalog,
  emptyCatalog,
  type DesignToken,
  type DesignTokenCategory,
  type DesignTokenValueKind,
  type TokenCatalog,
} from "./design-token-inference";

export type ManifestCssProperty =
  | "background-color"
  | "border-color"
  | "border-radius"
  | "color"
  | "font-size"
  | "gap"
  | "padding";

export interface ManifestTokenCandidate {
  token: string;
  category: DesignTokenCategory;
  cssProperty: ManifestCssProperty | null;
  semanticScore: number;
}

const BACKTICK_TOKEN_REGEX = /`([^`]+)`/g;
const CSS_VARIABLE_REGEX = /^--[a-zA-Z0-9_-]+$/;
const TAILWIND_TOKEN_REGEX = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)*-[a-z0-9][a-z0-9-/%[\].()]*$/i;
const LENGTH_VALUE_REGEX = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|cqi|cqw|svh|svw|dvh|dvw)$/i;
const COLOR_VALUE_REGEX = /^(#|rgb\(|rgba\(|hsl\(|hsla\(|color\()/i;

export function buildObviousTokenManifestCatalog(
  tokensMarkdown: string | undefined,
): TokenCatalog {
  const markdown = tokensMarkdown?.trim();
  if (!markdown) {
    return emptyCatalog();
  }
  if (typeof document === "undefined") {
    return emptyCatalog();
  }

  const candidates = parseManifestCandidates(markdown);
  const tokens: DesignToken[] = [];
  const seen = new Set<string>();
  const probeRoot = createProbeRoot();

  try {
    for (const candidate of candidates) {
      if (seen.has(candidate.token)) {
        continue;
      }
      seen.add(candidate.token);
      const token = resolveCandidate(candidate, probeRoot);
      if (token) {
        tokens.push(token);
      }
    }
  } finally {
    probeRoot.remove();
  }

  return createTokenCatalog(tokens);
}

export function parseManifestCandidates(
  markdown: string,
): ManifestTokenCandidate[] {
  const candidates: ManifestTokenCandidate[] = [];
  let sectionTitle = "";

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith("#")) {
      sectionTitle = line.replace(/^#+\s*/, "").toLowerCase();
      continue;
    }
    if (!line.includes("`")) {
      continue;
    }
    if (isAvoidSection(sectionTitle)) {
      continue;
    }

    const tokens = extractBacktickedTokens(line);
    for (const token of tokens) {
      if (!isManifestToken(token)) {
        continue;
      }
      if (isInteractionToken(token)) {
        continue;
      }
      const candidate = createCandidate(token, sectionTitle);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function extractBacktickedTokens(line: string): string[] {
  const tokens: string[] = [];
  let match = BACKTICK_TOKEN_REGEX.exec(line);
  while (match) {
    const value = match[1]?.trim();
    if (value) {
      tokens.push(value);
    }
    match = BACKTICK_TOKEN_REGEX.exec(line);
  }
  BACKTICK_TOKEN_REGEX.lastIndex = 0;
  return tokens;
}

function isManifestToken(token: string): boolean {
  if (CSS_VARIABLE_REGEX.test(token)) {
    return true;
  }
  if (token.includes(" ") || token.includes("/")) {
    return false;
  }
  return TAILWIND_TOKEN_REGEX.test(token);
}

function isInteractionToken(token: string): boolean {
  return token.includes(":");
}

function isAvoidSection(sectionTitle: string): boolean {
  return sectionTitle.includes("avoid");
}

function createCandidate(
  token: string,
  sectionTitle: string,
): ManifestTokenCandidate | null {
  const inferred = inferManifestTokenTarget(token, sectionTitle);
  if (!inferred) {
    return null;
  }
  return {
    token,
    category: inferred.category,
    cssProperty: inferred.cssProperty,
    semanticScore: inferred.semanticScore,
  };
}

function inferManifestTokenTarget(
  token: string,
  sectionTitle: string,
): {
  category: DesignTokenCategory;
  cssProperty: ManifestCssProperty | null;
  semanticScore: number;
} | null {
  if (token.startsWith("--")) {
    return inferCssVariableTarget(token);
  }
  if (sectionTitle.includes("typography")) {
    return { category: "text", cssProperty: "font-size", semanticScore: 3 };
  }
  if (token.startsWith("bg-")) {
    return { category: "background", cssProperty: "background-color", semanticScore: 3 };
  }
  if (token.startsWith("text-")) {
    return { category: "text", cssProperty: "color", semanticScore: 3 };
  }
  if (token.startsWith("border-")) {
    return { category: "border", cssProperty: "border-color", semanticScore: 3 };
  }
  if (token.startsWith("rounded-")) {
    return { category: "radius", cssProperty: "border-radius", semanticScore: 3 };
  }
  if (token.startsWith("gap-")) {
    return { category: "spacing", cssProperty: "gap", semanticScore: 3 };
  }
  if (isPaddingUtility(token)) {
    return { category: "spacing", cssProperty: "padding", semanticScore: 3 };
  }
  return null;
}

function inferCssVariableTarget(token: string): {
  category: DesignTokenCategory;
  cssProperty: ManifestCssProperty | null;
  semanticScore: number;
} {
  const lower = token.toLowerCase();
  if (lower.includes("radius")) {
    return { category: "radius", cssProperty: "border-radius", semanticScore: 3 };
  }
  if (lower.includes("gap")) {
    return { category: "spacing", cssProperty: "gap", semanticScore: 3 };
  }
  if (lower.includes("padding") || lower.includes("space")) {
    return { category: "spacing", cssProperty: "padding", semanticScore: 2 };
  }
  if (lower.includes("text") || lower.includes("fg") || lower.includes("icon")) {
    return { category: "text", cssProperty: "color", semanticScore: 3 };
  }
  if (lower.includes("border") || lower.includes("outline")) {
    return { category: "border", cssProperty: "border-color", semanticScore: 3 };
  }
  if (lower.includes("surface") || lower.includes("background") || lower.includes("bg")) {
    return { category: "background", cssProperty: "background-color", semanticScore: 3 };
  }
  if (
    lower.includes("success") ||
    lower.includes("warning") ||
    lower.includes("error") ||
    lower.includes("danger") ||
    lower.includes("state")
  ) {
    return { category: "state", cssProperty: "background-color", semanticScore: 2 };
  }
  return { category: "raw", cssProperty: null, semanticScore: 1 };
}

function resolveCandidate(
  candidate: ManifestTokenCandidate,
  probeRoot: HTMLElement,
): DesignToken | null {
  if (candidate.token.startsWith("--")) {
    return resolveCssVariableCandidate(candidate);
  }
  if (!candidate.cssProperty) {
    return null;
  }
  return resolveTailwindCandidate(candidate, probeRoot);
}

function resolveCssVariableCandidate(
  candidate: ManifestTokenCandidate,
): DesignToken | null {
  let rootStyle: CSSStyleDeclaration | null;
  try {
    rootStyle = window.getComputedStyle(document.documentElement);
  } catch {
    rootStyle = null;
  }
  const resolved = rootStyle?.getPropertyValue(candidate.token).trim() ?? "";
  if (!resolved) {
    return null;
  }
  const valueKind = inferValueKind(resolved);
  const shortName = candidate.token.replace(/^--/, "");
  return {
    shortName,
    name: candidate.token,
    rawValue: candidate.token,
    resolvedValue: resolved,
    category: candidate.category,
    valueKind,
    semanticScore: candidate.semanticScore,
    source: "manifest",
    applyValue: `var(${candidate.token})`,
  };
}

function resolveTailwindCandidate(
  candidate: ManifestTokenCandidate,
  probeRoot: HTMLElement,
): DesignToken | null {
  const probe = document.createElement("div");
  probe.className = candidate.token;
  probeRoot.appendChild(probe);

  let resolved = "";
  try {
    const style = window.getComputedStyle(probe);
    resolved = style.getPropertyValue(candidate.cssProperty ?? "").trim();
  } finally {
    probe.remove();
  }

  if (!resolved || isDefaultComputedValue(candidate.cssProperty, resolved)) {
    return null;
  }

  return {
    shortName: candidate.token,
    name: candidate.token,
    rawValue: candidate.token,
    resolvedValue: resolved,
    category: candidate.category,
    valueKind: inferValueKind(resolved),
    semanticScore: candidate.semanticScore,
    source: "manifest",
    applyValue: resolved,
  };
}

function createProbeRoot(): HTMLDivElement {
  const root = document.createElement("div");
  root.setAttribute("data-obvious-feedback-token-probe", "true");
  root.style.cssText =
    "position:absolute;left:-10000px;top:-10000px;width:0;height:0;overflow:hidden;pointer-events:none;visibility:hidden;";
  document.body.appendChild(root);
  return root;
}

function isDefaultComputedValue(
  property: ManifestCssProperty | null,
  resolved: string,
): boolean {
  if (!property) {
    return true;
  }
  if (property === "background-color" || property === "border-color") {
    return resolved === "rgba(0, 0, 0, 0)" || resolved === "transparent";
  }
  if (property === "color") {
    return resolved === "canvastext";
  }
  if (property === "border-radius" || property === "gap" || property === "padding") {
    return resolved === "0px" || resolved === "0px 0px 0px 0px";
  }
  if (property === "font-size") {
    return resolved === "16px";
  }
  return false;
}

function isPaddingUtility(token: string): boolean {
  return /^p(?:-|[trblxy]-)/.test(token);
}

function inferValueKind(value: string): DesignTokenValueKind {
  const trimmed = value.trim();
  if (COLOR_VALUE_REGEX.test(trimmed)) {
    return "color";
  }
  if (LENGTH_VALUE_REGEX.test(trimmed)) {
    return "length";
  }
  if (trimmed.split(/\s+/).every((part) => LENGTH_VALUE_REGEX.test(part))) {
    return "length";
  }
  return "other";
}
