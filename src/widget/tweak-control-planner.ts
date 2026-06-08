/**
 * Tweak control planner — turns a picked element + token catalog into the
 * set of design-system token chips the pin popover should render.
 *
 * Design rule: tokens only. The planner intentionally does not emit free-form
 * sliders or intent chips — the reporter picks from the host's design system
 * or types prose into the comment box. If a property has no tokens, the row
 * is hidden upstream.
 *
 * Why this is its own module:
 * - The pin overlay focuses on rendering and inline mutation; the choice of
 *   which controls to offer for a given element + design system is a pure
 *   data transform that we want to test independently.
 * - Future extensions (host-provided tokens, .obvious manifest, locale
 *   overrides) plug in here without touching the popover layout.
 */

import type { FeedbackVisualSuggestionProperty } from "../public-types";
import type { DesignToken, TokenCatalog } from "./design-token-inference";
import {
  cssColorToHex,
  getApplicableProperties,
} from "./visual-suggestions";

const MAX_CHIPS_PER_PROPERTY = 3;
const TSHIRT_PATTERN =
  /-(?:xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|2xs|3xs|none|full)(?:-[a-z0-9]+)?$/i;
const NUMERIC_SCALE_PATTERN = /-\d+$/;

export interface TweakTokenChip {
  kind: "token";
  property: FeedbackVisualSuggestionProperty;
  token: DesignToken;
  /** Display label — usually the token's short name minus trailing palette numbers. */
  label: string;
  /** Value the SDK applies inline when the chip is picked. */
  applyValue: string;
}

export interface TweakControlPlan {
  property: FeedbackVisualSuggestionProperty;
  label: string;
  /** Token chips, sorted by semantic score (best first). Empty → hide row. */
  tokenChips: TweakTokenChip[];
  /** True when the property has at least one token chip. */
  hasTokens: boolean;
}

const PROPERTY_LABELS: Record<FeedbackVisualSuggestionProperty, string> = {
  "font-size": "Font",
  "border-radius": "Radius",
  padding: "Padding",
  gap: "Gap",
  color: "Text",
  "background-color": "Background",
};

/**
 * Strict name patterns per property. We only surface tokens whose short name
 * matches one of these patterns — buckets alone are not enough because every
 * length-valued token lands in `spacing`, which polluted radius/font-size
 * chip rows with unrelated tokens like `--spacing-row-md`.
 *
 * The first pattern that hits wins. Patterns must use `(?:-|$)` so we don't
 * accidentally swallow noise like `--space-after`.
 */
const PROPERTY_NAME_PATTERNS: Record<
  FeedbackVisualSuggestionProperty,
  RegExp[]
> = {
  "font-size": [
    /^font-size(?:-|$)/,
    /^font(?:-|$)/,
    /^font-scale(?:-|$)/,
    /^text-size(?:-|$)/,
    /^text-(?:heading|body|caption|display)(?:-|$)/,
    /^text-(?:xs|sm|base|md|lg|xl|2xl|3xl|4xl|5xl|6xl|\d+)(?:-|$)/,
    /^type(?:-|$)/,
    /^typography(?:-|$)/,
    /^heading-(?:font-)?size(?:-|$)/,
  ],
  "border-radius": [
    /^radius(?:-|$)/,
    /^rounded(?:-|$)/,
    /^corner(?:-radius)?(?:-|$)/,
    /^br(?:-|$)/,
  ],
  padding: [
    /^space(?:-|$)/,
    /^padding(?:-|$)/,
    /^pad(?:-|$)/,
    /^p(?:-|[trblxy]-)/,
  ],
  gap: [/^gap(?:-|$)/, /^space(?:-|$)/],
  color: [
    /^text(?:-|$)/,
    /^fg(?:-|$)/,
    /^foreground(?:-|$)/,
    /^label(?:-|$)/,
    /^heading(?:-|$)/,
    /^icon(?:-|$)/,
  ],
  "background-color": [
    /^surface(?:-|$)/,
    /^background(?:-|$)/,
    /^bg(?:-|$)/,
    /^panel(?:-|$)/,
    /^card(?:-|$)/,
    /^overlay(?:-|$)/,
  ],
};

/**
 * Property-natural prefixes we strip before showing a chip label, so a
 * dashboard token like `--spacing-row-md` becomes the chip label `MD` rather
 * than `Spacing Row Md`. The row already labels the category, so the chip
 * just needs to indicate which step on the scale.
 */
const PROPERTY_LABEL_STRIP: Record<FeedbackVisualSuggestionProperty, string[]> =
  {
    "font-size": [
      "font-size-",
      "font-scale-",
      "font-",
      "text-size-",
      "text-heading-",
      "text-body-",
      "text-caption-",
      "text-display-",
      "text-",
      "type-",
      "typography-",
    ],
    "border-radius": ["radius-", "rounded-", "corner-radius-", "corner-"],
    padding: [
      "space-",
      "padding-",
      "pad-",
      "p-",
      "px-",
      "py-",
      "pt-",
      "pr-",
      "pb-",
      "pl-",
    ],
    gap: ["gap-", "space-"],
    color: [
      "text-text-",
      "text-icon-",
      "color-text-",
      "text-",
      "fg-",
      "foreground-",
      "label-",
      "heading-",
      "icon-",
    ],
    "background-color": [
      "bg-surface-",
      "bg-background-",
      "surface-",
      "background-",
      "bg-",
      "panel-",
      "card-",
      "overlay-",
    ],
  };

/**
 * Build a per-property plan of design-system token chips. Properties that
 * yield zero tokens get an empty plan; the popover hides those rows.
 */
export function planTweakControls(
  element: HTMLElement,
  catalog: TokenCatalog,
): TweakControlPlan[] {
  const properties = getApplicableProperties(element);
  return properties.map((property) =>
    planForProperty(property, catalog, element),
  );
}

export function planForProperty(
  property: FeedbackVisualSuggestionProperty,
  catalog: TokenCatalog,
  _element: HTMLElement,
): TweakControlPlan {
  const tokenChips = pickTokenChips(property, catalog);
  return {
    property,
    label: PROPERTY_LABELS[property],
    tokenChips,
    hasTokens: tokenChips.length > 0,
  };
}

function pickTokenChips(
  property: FeedbackVisualSuggestionProperty,
  catalog: TokenCatalog,
): TweakTokenChip[] {
  const expectedKind = isColorProperty(property) ? "color" : "length";
  const patterns = PROPERTY_NAME_PATTERNS[property];
  const candidates: DesignToken[] = [];
  for (const token of catalog.tokens) {
    if (token.valueKind !== expectedKind) {
      continue;
    }
    if (!patterns.some((pattern) => pattern.test(token.shortName))) {
      continue;
    }
    candidates.push(token);
  }
  if (candidates.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const unique = candidates.filter((token) => {
    const key = `${token.name}::${normalizeColor(token.resolvedValue)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => {
    const aScore = scoreToken(a, property);
    const bScore = scoreToken(b, property);
    if (aScore !== bScore) {
      return bScore - aScore;
    }
    return a.shortName.localeCompare(b.shortName);
  });
  return unique.slice(0, MAX_CHIPS_PER_PROPERTY).map((token) => ({
    kind: "token",
    property,
    token,
    label: tokenChipLabel(token, property),
    applyValue: token.applyValue ?? `var(${token.name})`,
  }));
}

/**
 * Combine the catalog's semantic score with two name-shape signals:
 * - t-shirt suffix (`-md`, `-2xl`, `-full`) — strong indicator of a clean
 *   design-system step
 * - bare numeric scale (`-200`, `-12`) — weaker indicator
 *
 * The combination ensures we surface a few clean steps over many noisy
 * variants of the same tier.
 */
function scoreToken(
  token: DesignToken,
  property: FeedbackVisualSuggestionProperty,
): number {
  let score = token.semanticScore;
  if (token.source === "manifest") {
    score += 5;
  }
  if (TSHIRT_PATTERN.test(token.shortName)) {
    score += 1.5;
  } else if (NUMERIC_SCALE_PATTERN.test(token.shortName)) {
    score += 0.5;
  }
  // Prefer tokens whose name *starts* with a property-natural prefix over
  // ones that just contain a matching segment.
  const strip = PROPERTY_LABEL_STRIP[property];
  if (strip.some((prefix) => token.shortName.startsWith(prefix))) {
    score += 0.25;
  }
  return score;
}

function isColorProperty(
  property: FeedbackVisualSuggestionProperty,
): property is "color" | "background-color" {
  return property === "color" || property === "background-color";
}

/**
 * Compute a chip-friendly label. Order of preference:
 *   1. Trailing t-shirt size (`md`, `2xl`, `full`) → render as `MD`/`2XL`/`Full`
 *      because the row header already says "Padding"/"Radius".
 *   2. Trailing numeric scale (`200`, `12`) → render as the number alone.
 *   3. Strip a property-natural prefix and Title-case the remainder.
 *   4. Fall back to a Title-cased version of the full short name.
 */
function tokenChipLabel(
  token: DesignToken,
  property: FeedbackVisualSuggestionProperty,
): string {
  const lowered = token.shortName.toLowerCase();
  const tshirt = lowered.match(
    /-((?:[2-6]?xl|2xs|3xs|xs|sm|md|lg|none|full))$/i,
  );
  if (tshirt) {
    return formatTshirtSuffix(tshirt[1]);
  }
  const numeric = lowered.match(/-(\d+)$/);
  if (numeric) {
    return numeric[1];
  }
  const stripList = PROPERTY_LABEL_STRIP[property];
  for (const prefix of stripList) {
    if (lowered.startsWith(prefix)) {
      const tail = token.shortName.slice(prefix.length);
      return titleCase(tail);
    }
  }
  return titleCase(token.shortName);
}

function formatTshirtSuffix(suffix: string): string {
  const lowered = suffix.toLowerCase();
  if (lowered === "none" || lowered === "full") {
    return lowered.charAt(0).toUpperCase() + lowered.slice(1);
  }
  return lowered.toUpperCase();
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function normalizeColor(value: string): string {
  if (!value) {
    return "";
  }
  const lowered = value.trim().toLowerCase();
  if (lowered.startsWith("#")) {
    return cssColorToHex(lowered).toLowerCase();
  }
  return lowered;
}
