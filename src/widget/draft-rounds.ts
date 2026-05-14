import {
  DRAFT_ROUND_STORAGE_PREFIX,
  MAX_DRAFT_ROUND_STORAGE_BYTES,
  MAX_ROUND_ITEMS,
} from "../constants";
import type {
  ElementGrabItem,
  ElementGrabRect,
  FeedbackPin,
  FeedbackVisualSuggestion,
} from "../public-types";

export interface FeedbackMeasurementRuler {
  orientation: "horizontal" | "vertical";
  position: number;
  edge: "top" | "bottom" | "left" | "right" | null;
  snappedElement: {
    cssSelector: string;
    tagName: string;
    componentName: string | null;
    sourceFile: string | null;
    lineNumber: number | null;
    boundingRect: ElementGrabRect;
  } | null;
}

export interface FeedbackMeasurementDistance {
  pixelDistance: number;
  orientation: "horizontal" | "vertical";
  rulerA: FeedbackMeasurementRuler;
  rulerB: FeedbackMeasurementRuler;
}

export interface FeedbackMeasurement {
  id: string;
  description: string;
  rulers: FeedbackMeasurementRuler[];
  distances: FeedbackMeasurementDistance[];
  viewport: { width: number; height: number };
}

export interface FeedbackRoundItem {
  id: string;
  description: string;
  elementGrabs?: ElementGrabItem[];
  measurements?: FeedbackMeasurement[];
  visualSuggestions?: FeedbackVisualSuggestion[];
  attachmentTokens?: string[];
  /**
   * Optional on-page anchor for an inline annotation pin. Client-only UI
   * state — never sent to the API. Pins survive page reloads via the
   * persisted draft round and are wiped on submit.
   */
  pin?: FeedbackPin;
}

function parseStoredPin(raw: unknown): FeedbackPin | undefined {
  if (raw === null || typeof raw !== "object") {
    return undefined;
  }
  const record = raw as Record<string, unknown>;
  const xPctValue = record.xPct;
  const yPxValue = record.yPx;
  const isFixedValue = record.isFixed;
  const elementGrabIdValue = record.elementGrabId;
  if (
    typeof xPctValue !== "number" ||
    !Number.isFinite(xPctValue) ||
    typeof yPxValue !== "number" ||
    !Number.isFinite(yPxValue) ||
    typeof isFixedValue !== "boolean" ||
    typeof elementGrabIdValue !== "string" ||
    elementGrabIdValue.length === 0
  ) {
    return undefined;
  }
  return {
    xPct: xPctValue,
    yPx: yPxValue,
    isFixed: isFixedValue,
    elementGrabId: elementGrabIdValue,
  };
}

export function createRoundItemId(): string {
  return `ri_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getDraftRoundStorageKey(
  publicKey: string,
  env: string,
): string | null {
  if (!publicKey) {
    return null;
  }
  const sourceOrigin =
    typeof window !== "undefined" ? window.location.origin : "unknown-origin";
  return [DRAFT_ROUND_STORAGE_PREFIX, publicKey, env, sourceOrigin]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

export function parseStoredDraftRound(storageKey: string | null): FeedbackRoundItem[] {
  if (!storageKey) {
    return [];
  }
  try {
    const rawValue = window.localStorage?.getItem(storageKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    const items: FeedbackRoundItem[] = [];
    for (const item of parsed) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.id !== "string" ||
        typeof item.description !== "string" ||
        !item.description.trim()
      ) {
        continue;
      }
      items.push({
        id: item.id,
        description: item.description,
        elementGrabs: Array.isArray(item.elementGrabs)
          ? item.elementGrabs
          : undefined,
        measurements: Array.isArray(item.measurements)
          ? item.measurements
          : undefined,
        visualSuggestions: Array.isArray(item.visualSuggestions)
          ? item.visualSuggestions
          : undefined,
        attachmentTokens: Array.isArray(item.attachmentTokens)
          ? item.attachmentTokens
          : undefined,
        pin: parseStoredPin(item.pin),
      });
    }
    return items.slice(0, MAX_ROUND_ITEMS);
  } catch {
    return [];
  }
}

export function persistDraftRound(
  storageKey: string | null,
  items: FeedbackRoundItem[],
): void {
  if (!storageKey) {
    return;
  }
  try {
    if (items.length === 0) {
      window.localStorage?.removeItem(storageKey);
      return;
    }
    const serializedItems = items.slice(0, MAX_ROUND_ITEMS);
    const json = JSON.stringify(serializedItems);
    if (json.length <= MAX_DRAFT_ROUND_STORAGE_BYTES) {
      window.localStorage?.setItem(storageKey, json);
    }
  } catch {
    // localStorage may be unavailable
  }
}

