/**
 * Design token inference — runtime scan of host-page CSS custom properties to
 * surface a token catalog the tweak panel can use instead of hardcoded
 * swatches/sliders.
 *
 * Strategy:
 * - Walk every `<style>` and same-origin `<link rel="stylesheet">` once and
 *   collect raw CSS variable declarations (name + raw `var(...)` chains).
 * - Resolve each one against `getComputedStyle(document.documentElement)` to
 *   capture the user-agent-resolved value (the actual color/length).
 * - Classify each token into a semantic bucket (`text`, `background`,
 *   `border`, `radius`, `spacing`, `state`, `raw`) using its name + value.
 * - Score semantic names higher than raw palette names so the planner can
 *   prefer `--text-primary` over `--neutral-100` when both resolve to the
 *   same color.
 *
 * Limitations:
 * - Cross-origin stylesheets cannot be inspected, so tokens defined only in
 *   those sheets fall back to the resolved root value (we keep the raw token
 *   name from `document.documentElement` if it shows up in `cssText`).
 * - The classifier intentionally stays conservative: when a name does not
 *   match a known prefix, we still emit it under `raw` so callers can decide
 *   whether to display it.
 */

export type DesignTokenCategory =
  | "text"
  | "background"
  | "border"
  | "radius"
  | "spacing"
  | "state"
  | "raw";

export type DesignTokenValueKind = "color" | "length" | "other";
export type DesignTokenSource = "runtime" | "manifest";

export interface DesignToken {
  /** CSS variable name without the leading `--`. */
  shortName: string;
  /** Full CSS variable name including `--`. */
  name: string;
  /** Raw declaration as it appears in CSS (may contain `var(...)` chain). */
  rawValue: string;
  /** Computed value resolved through `getComputedStyle(documentElement)`. */
  resolvedValue: string;
  category: DesignTokenCategory;
  valueKind: DesignTokenValueKind;
  /** 0 = raw palette, 1 = neutral, 2 = semantic — higher wins. */
  semanticScore: number;
  /** Runtime CSS inference or host-provided manifest. Omitted means runtime for legacy tests/helpers. */
  source?: DesignTokenSource;
  /**
   * CSS value applied inline for live preview. Runtime CSS variables default
   * to `var(--token)`, manifest Tailwind classes use their resolved value.
   */
  applyValue?: string;
}

export interface TokenCatalog {
  tokens: DesignToken[];
  byCategory: Record<DesignTokenCategory, DesignToken[]>;
  /** Quick lookup by short name (no leading `--`). */
  byShortName: Map<string, DesignToken>;
}

const DECLARATION_REGEX = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;}{]+?)\s*(?:;|$|\})/g;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const LENGTH_TOKEN = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|cqi|cqw|svh|svw|dvh|dvw)$/i;

const SEMANTIC_PREFIXES: Array<{
  keywords: string[];
  category: DesignTokenCategory;
}> = [
  { keywords: ["text", "fg", "foreground", "label", "heading"], category: "text" },
  { keywords: ["icon"], category: "text" },
  { keywords: ["surface", "bg", "background", "panel", "card", "overlay"], category: "background" },
  { keywords: ["border", "outline", "divider", "stroke"], category: "border" },
  { keywords: ["radius", "rounded", "corner"], category: "radius" },
  { keywords: ["space", "spacing", "gap", "padding", "size"], category: "spacing" },
  {
    keywords: [
      "state",
      "success",
      "warning",
      "error",
      "danger",
      "destructive",
      "info",
      "alert",
      "critical",
    ],
    category: "state",
  },
];

const RAW_PALETTE_PREFIXES = [
  "color-",
  "neutral-",
  "gray-",
  "grey-",
  "slate-",
  "zinc-",
  "stone-",
  "red-",
  "orange-",
  "amber-",
  "yellow-",
  "lime-",
  "green-",
  "emerald-",
  "teal-",
  "cyan-",
  "sky-",
  "blue-",
  "indigo-",
  "violet-",
  "purple-",
  "fuchsia-",
  "pink-",
  "rose-",
  "tw-",
];

/**
 * Tokens whose name marks them as a sub-state (`-hover`, `-disabled`,
 * `-press`, etc.) or as a contextual contrast variant (`inverse`). These are
 * useful internally inside a component but pollute the tweak panel because
 * they multiply every base token by 4-6 entries. We filter them out at
 * catalog-build time so callers never see them.
 */
const NOISE_SEGMENT = /(?:^|-)(?:hover|active|press|pressed|focus|disable|disabled|focused|hovered|loading|placeholder)(?:$|-)/;
const INVERSE_SEGMENT = /(?:^|-)(?:inverse|inv)(?:$|-)/;
const SLIDE_SEGMENT = /^slide(?:$|-)/;

function isNoiseToken(shortName: string): boolean {
  if (!shortName) {
    return true;
  }
  if (NOISE_SEGMENT.test(shortName)) {
    return true;
  }
  if (INVERSE_SEGMENT.test(shortName)) {
    return true;
  }
  if (SLIDE_SEGMENT.test(shortName)) {
    return true;
  }
  return false;
}

/**
 * Build a token catalog by scanning local stylesheets for `--*: <value>`
 * declarations and resolving each through `getComputedStyle`. Returns an
 * empty catalog if the document is unavailable.
 */
export function buildDesignTokenCatalog(): TokenCatalog {
  if (typeof document === "undefined") {
    return emptyCatalog();
  }

  const declarations = collectRootDeclarations();
  const tokens: DesignToken[] = [];
  const seen = new Set<string>();
  let rootStyle: CSSStyleDeclaration | null;
  try {
    rootStyle = window.getComputedStyle(document.documentElement);
  } catch {
    rootStyle = null;
  }

  for (const declaration of declarations) {
    if (seen.has(declaration.name)) {
      continue;
    }
    seen.add(declaration.name);
    const shortName = declaration.name.replace(/^--/, "").toLowerCase();
    if (isNoiseToken(shortName)) {
      continue;
    }
    const resolved = resolveValue(rootStyle, declaration.name);
    if (!resolved) {
      continue;
    }
    const { category, semanticScore, valueKind } = classifyToken(
      declaration.name,
      declaration.rawValue,
      resolved,
    );
    tokens.push({
      shortName,
      name: declaration.name,
      rawValue: declaration.rawValue,
      resolvedValue: resolved,
      category,
      semanticScore,
      valueKind,
      source: "runtime",
    });
  }

  return createTokenCatalog(tokens);
}

interface RawDeclaration {
  name: string;
  rawValue: string;
}

function collectRootDeclarations(): RawDeclaration[] {
  const out: RawDeclaration[] = [];
  let stylesheets: StyleSheetList | null;
  try {
    stylesheets = document.styleSheets;
  } catch {
    stylesheets = null;
  }
  if (!stylesheets) {
    return out;
  }

  for (let i = 0; i < stylesheets.length; i += 1) {
    const sheet =
      typeof stylesheets.item === "function"
        ? stylesheets.item(i)
        : stylesheets[i];
    if (!sheet) {
      continue;
    }
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      rules = null;
    }
    if (!rules) {
      continue;
    }
    walkRules(rules, out);
  }

  if (out.length === 0) {
    out.push(...collectFromRootInline());
  }

  return out;
}

function walkRules(rules: CSSRuleList, out: RawDeclaration[]): void {
  for (let i = 0; i < rules.length; i += 1) {
    const rule =
      typeof rules.item === "function" ? rules.item(i) : rules[i];
    if (!rule) {
      continue;
    }
    if (rule instanceof CSSStyleRule) {
      const selector = (rule.selectorText ?? "").trim();
      if (!selectorTargetsRoot(selector)) {
        continue;
      }
      const text = rule.style?.cssText ?? "";
      collectFromCssText(text, out);
      continue;
    }
    const nestedRules = readNestedRules(rule);
    if (nestedRules) {
      walkRules(nestedRules, out);
    }
  }
}

function readNestedRules(rule: CSSRule): CSSRuleList | null {
  if (
    typeof CSSMediaRule !== "undefined" &&
    rule instanceof CSSMediaRule
  ) {
    return rule.cssRules;
  }
  if (
    typeof CSSSupportsRule !== "undefined" &&
    rule instanceof CSSSupportsRule
  ) {
    return rule.cssRules;
  }
  if (
    typeof CSSContainerRule !== "undefined" &&
    rule instanceof CSSContainerRule
  ) {
    return rule.cssRules;
  }
  if (
    typeof CSSLayerBlockRule !== "undefined" &&
    rule instanceof CSSLayerBlockRule
  ) {
    return rule.cssRules;
  }
  return null;
}

function selectorTargetsRoot(selector: string): boolean {
  if (!selector) {
    return false;
  }
  const fragments = selector.split(",").map((piece) => piece.trim());
  return fragments.some((fragment) => {
    return (
      fragment === ":root" ||
      fragment === "html" ||
      fragment === "body" ||
      fragment === "*" ||
      fragment.startsWith(":root") ||
      fragment.startsWith("html") ||
      fragment.startsWith("body")
    );
  });
}

function collectFromCssText(cssText: string, out: RawDeclaration[]): void {
  if (!cssText) {
    return;
  }
  const regex = new RegExp(DECLARATION_REGEX.source, DECLARATION_REGEX.flags);
  let match: RegExpExecArray | null = regex.exec(cssText);
  while (match !== null) {
    const name = match[1];
    const rawValue = match[2].trim();
    if (name && rawValue) {
      out.push({ name, rawValue });
    }
    match = regex.exec(cssText);
  }
}

/**
 * Fallback when no stylesheets are inspectable (e.g. shadow-rooted hosts):
 * read every `--*` we can see on `:root` via the inline style attribute.
 */
function collectFromRootInline(): RawDeclaration[] {
  const out: RawDeclaration[] = [];
  const root = document.documentElement;
  const cssText = root.style?.cssText ?? "";
  collectFromCssText(cssText, out);
  return out;
}

function resolveValue(
  rootStyle: CSSStyleDeclaration | null,
  name: string,
): string {
  if (!rootStyle) {
    return "";
  }
  try {
    const value = rootStyle.getPropertyValue(name).trim();
    return value;
  } catch {
    return "";
  }
}

interface Classification {
  category: DesignTokenCategory;
  semanticScore: number;
  valueKind: DesignTokenValueKind;
}

function classifyToken(
  fullName: string,
  rawValue: string,
  resolvedValue: string,
): Classification {
  const shortName = fullName.replace(/^--/, "").toLowerCase();
  const valueKind = classifyValue(resolvedValue, rawValue);
  const isRawPalette = isRawPaletteName(shortName);
  const semanticMatch = matchSemanticPrefix(shortName);

  if (semanticMatch) {
    return {
      category: semanticMatch.category,
      semanticScore: semanticMatch.boost,
      valueKind,
    };
  }
  if (isRawPalette) {
    return {
      category: "raw",
      semanticScore: 0,
      valueKind,
    };
  }
  return {
    category: deriveCategoryFromValue(valueKind),
    semanticScore: 1,
    valueKind,
  };
}

function classifyValue(
  resolvedValue: string,
  rawValue: string,
): DesignTokenValueKind {
  const candidate = resolvedValue.trim() || rawValue.trim();
  if (!candidate) {
    return "other";
  }
  if (isColorLike(candidate)) {
    return "color";
  }
  if (LENGTH_TOKEN.test(candidate)) {
    return "length";
  }
  return "other";
}

function isColorLike(value: string): boolean {
  const lowered = value.trim().toLowerCase();
  if (HEX_COLOR.test(lowered)) {
    return true;
  }
  if (
    lowered.startsWith("rgb(") ||
    lowered.startsWith("rgba(") ||
    lowered.startsWith("hsl(") ||
    lowered.startsWith("hsla(") ||
    lowered.startsWith("color(") ||
    lowered.startsWith("oklch(") ||
    lowered.startsWith("oklab(") ||
    lowered.startsWith("color-mix(")
  ) {
    return true;
  }
  return false;
}

function isRawPaletteName(shortName: string): boolean {
  if (RAW_PALETTE_PREFIXES.some((prefix) => shortName.startsWith(prefix))) {
    return /-(?:\d{2,4}|50|100|200|300|400|500|600|700|800|900|950)(?:$|-)/.test(
      shortName,
    );
  }
  return false;
}

interface SemanticMatch {
  category: DesignTokenCategory;
  boost: number;
}

/**
 * Two-pass match: prefer prefix/equality matches before suffix/contains
 * matches so a name like `state-warning-bg` resolves to `state`, not the
 * trailing `-bg` segment.
 */
function matchSemanticPrefix(shortName: string): SemanticMatch | null {
  for (const entry of SEMANTIC_PREFIXES) {
    for (const keyword of entry.keywords) {
      if (shortName === keyword || shortName.startsWith(`${keyword}-`)) {
        return { category: entry.category, boost: 2 };
      }
    }
  }
  for (const entry of SEMANTIC_PREFIXES) {
    for (const keyword of entry.keywords) {
      if (
        shortName.includes(`-${keyword}-`) ||
        shortName.endsWith(`-${keyword}`)
      ) {
        return { category: entry.category, boost: 1.5 };
      }
    }
  }
  return null;
}

function deriveCategoryFromValue(
  kind: DesignTokenValueKind,
): DesignTokenCategory {
  if (kind === "color") {
    return "raw";
  }
  if (kind === "length") {
    return "spacing";
  }
  return "raw";
}

export function emptyCatalog(): TokenCatalog {
  return createTokenCatalog([]);
}

export function createTokenCatalog(tokens: DesignToken[]): TokenCatalog {
  const sorted = [...tokens].sort((a, b) => {
    if (a.semanticScore !== b.semanticScore) {
      return b.semanticScore - a.semanticScore;
    }
    return a.shortName.localeCompare(b.shortName);
  });

  const byCategory: Record<DesignTokenCategory, DesignToken[]> = {
    text: [],
    background: [],
    border: [],
    radius: [],
    spacing: [],
    state: [],
    raw: [],
  };
  const byShortName = new Map<string, DesignToken>();
  for (const token of sorted) {
    byCategory[token.category].push(token);
    byShortName.set(token.shortName, token);
  }
  return { tokens: sorted, byCategory, byShortName };
}

export function mergeTokenCatalogs(
  primary: TokenCatalog,
  fallback: TokenCatalog,
): TokenCatalog {
  const seen = new Set<string>();
  const tokens: DesignToken[] = [];
  for (const token of primary.tokens) {
    const key = token.shortName;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(token);
  }
  for (const token of fallback.tokens) {
    const key = token.shortName;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tokens.push(token);
  }
  return createTokenCatalog(tokens);
}
