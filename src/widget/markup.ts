import {
  MARKUP_POINTER_MOVE_THRESHOLD_PX,
  MAX_MARKUP_POINTS_PER_ITEM,
} from "../constants";

export type FeedbackMarkupTool = "rectangle" | "point" | "pen";

export interface FeedbackMarkupPoint {
  x: number;
  y: number;
}

export interface FeedbackMarkupItem {
  id: string;
  tool: FeedbackMarkupTool;
  points: FeedbackMarkupPoint[];
}

export interface FeedbackMarkupDraft {
  id: string;
  tool: FeedbackMarkupTool;
  start: FeedbackMarkupPoint;
  points: FeedbackMarkupPoint[];
}

export const MARKUP_TOOLS: FeedbackMarkupTool[] = ["rectangle", "point", "pen"];

export function createMarkupId(): string {
  return `markup_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getDevicePixelRatio(): number {
  return typeof window.devicePixelRatio === "number" &&
    Number.isFinite(window.devicePixelRatio)
    ? window.devicePixelRatio
    : 1;
}

export function getMarkupPoint(event: PointerEvent): FeedbackMarkupPoint {
  return {
    x: Math.round(event.clientX),
    y: Math.round(event.clientY),
  };
}

export function distanceBetweenPoints(
  first: FeedbackMarkupPoint,
  second: FeedbackMarkupPoint,
): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

export function normalizeMarkupItem(
  draft: FeedbackMarkupDraft,
): FeedbackMarkupItem | null {
  if (draft.tool === "pen") {
    const cappedPoints = draft.points.slice(0, MAX_MARKUP_POINTS_PER_ITEM);
    const hasMovement = cappedPoints.some(
      (point) =>
        distanceBetweenPoints(draft.start, point) >=
        MARKUP_POINTER_MOVE_THRESHOLD_PX,
    );
    return cappedPoints.length > 1 && hasMovement
      ? { id: draft.id, tool: draft.tool, points: cappedPoints }
      : null;
  }
  const end = draft.points[draft.points.length - 1] ?? draft.start;
  if (
    Math.hypot(end.x - draft.start.x, end.y - draft.start.y) <
    MARKUP_POINTER_MOVE_THRESHOLD_PX
  ) {
    return draft.tool === "point"
      ? { id: draft.id, tool: draft.tool, points: [draft.start] }
      : null;
  }
  return { id: draft.id, tool: draft.tool, points: [draft.start, end] };
}

export function resolveMarkupTool(value: string | null): FeedbackMarkupTool | null {
  if (value === "rectangle" || value === "point" || value === "pen") {
    return value;
  }
  return null;
}

