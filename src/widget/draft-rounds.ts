import {
  DRAFT_ROUND_STORAGE_PREFIX,
  MAX_DRAFT_ROUND_STORAGE_BYTES,
  MAX_ROUND_ITEMS,
} from "../constants";
import type {
  ElementGrabItem,
  ElementGrabRect,
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
        visualSuggestions: Array.isArray(item.visualSuggestions)
          ? item.visualSuggestions
          : undefined,
        attachmentTokens: Array.isArray(item.attachmentTokens)
          ? item.attachmentTokens
          : undefined,
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

