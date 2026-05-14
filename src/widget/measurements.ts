import { buildCssSelector } from "./element-grab";

export function createMeasurementId(): string {
  return `fbm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface RulerLine {
  id: string;
  orientation: "horizontal" | "vertical";
  position: number;
  snappedTo: string | null;
  snappedElement: HTMLElement | null;
  snappedEdge: "top" | "bottom" | "left" | "right" | null;
}

const RULER_SNAP_THRESHOLD_PX = 8;
const RULER_COLOR = "#3b82f6";
const RULER_PREVIEW_COLOR = "#93c5fd";
const RULER_SELECTED_COLOR = "#1d4ed8";
const RULER_HIT_ZONE_PX = 6;

export interface ElementEdge {
  pos: number;
  selector: string;
  element: HTMLElement;
  edge: "top" | "bottom" | "left" | "right";
  rect: DOMRect;
}

export interface SnapResult {
  position: number;
  selector: string;
  element: HTMLElement;
  edge: "top" | "bottom" | "left" | "right";
  rect: DOMRect;
}

let cachedEdges: { horizontal: ElementEdge[]; vertical: ElementEdge[] } | null =
  null;
let cachedEdgesFrame = -1;

export function collectElementEdges(): {
  horizontal: ElementEdge[];
  vertical: ElementEdge[];
} {
  const frame =
    typeof requestAnimationFrame !== "undefined" ? performance.now() : 0;
  if (cachedEdges && Math.abs(frame - cachedEdgesFrame) < 16) {
    return cachedEdges;
  }
  const horizontal: ElementEdge[] = [];
  const vertical: ElementEdge[] = [];
  const elements = document.body.querySelectorAll("*");
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (
      !(el instanceof HTMLElement) ||
      el.offsetWidth === 0 ||
      el.offsetHeight === 0
    ) {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) {
      continue;
    }
    const selector = buildCssSelector(el);
    horizontal.push({
      pos: Math.round(rect.top),
      selector,
      element: el,
      edge: "top",
      rect,
    });
    horizontal.push({
      pos: Math.round(rect.bottom),
      selector,
      element: el,
      edge: "bottom",
      rect,
    });
    vertical.push({
      pos: Math.round(rect.left),
      selector,
      element: el,
      edge: "left",
      rect,
    });
    vertical.push({
      pos: Math.round(rect.right),
      selector,
      element: el,
      edge: "right",
      rect,
    });
  }
  cachedEdges = { horizontal, vertical };
  cachedEdgesFrame = frame;
  return cachedEdges;
}

export function findSnapPosition(
  position: number,
  orientation: "horizontal" | "vertical",
  cursorX: number,
  cursorY: number,
): SnapResult | null {
  const edges = collectElementEdges();
  const edgeList =
    orientation === "horizontal" ? edges.horizontal : edges.vertical;
  let bestDist = RULER_SNAP_THRESHOLD_PX + 1;
  let bestEdge: ElementEdge | null = null;
  for (const edge of edgeList) {
    if (orientation === "horizontal") {
      if (cursorX < edge.rect.left - 40 || cursorX > edge.rect.right + 40) {
        continue;
      }
    } else {
      if (cursorY < edge.rect.top - 40 || cursorY > edge.rect.bottom + 40) {
        continue;
      }
    }
    const dist = Math.abs(edge.pos - position);
    if (dist < bestDist) {
      bestDist = dist;
      bestEdge = edge;
    }
  }
  return bestEdge
    ? {
        position: bestEdge.pos,
        selector: bestEdge.selector,
        element: bestEdge.element,
        edge: bestEdge.edge,
        rect: bestEdge.rect,
      }
    : null;
}

export function createRulerId(): string {
  return `rl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function computeRulerDistances(rulers: RulerLine[]): Array<{
  rulerAId: string;
  rulerBId: string;
  distance: number;
  orientation: "horizontal" | "vertical";
  midpoint: number;
}> {
  const result: Array<{
    rulerAId: string;
    rulerBId: string;
    distance: number;
    orientation: "horizontal" | "vertical";
    midpoint: number;
  }> = [];
  const horizontal = rulers
    .filter((r) => r.orientation === "horizontal")
    .sort((a, b) => a.position - b.position);
  const vertical = rulers
    .filter((r) => r.orientation === "vertical")
    .sort((a, b) => a.position - b.position);

  for (let i = 0; i < horizontal.length - 1; i++) {
    const a = horizontal[i];
    const b = horizontal[i + 1];
    result.push({
      rulerAId: a.id,
      rulerBId: b.id,
      distance: Math.abs(b.position - a.position),
      orientation: "horizontal",
      midpoint: (a.position + b.position) / 2,
    });
  }
  for (let i = 0; i < vertical.length - 1; i++) {
    const a = vertical[i];
    const b = vertical[i + 1];
    result.push({
      rulerAId: a.id,
      rulerBId: b.id,
      distance: Math.abs(b.position - a.position),
      orientation: "vertical",
      midpoint: (a.position + b.position) / 2,
    });
  }
  return result;
}

export function renderRulerSvg(
  rulers: RulerLine[],
  preview: { orientation: "horizontal" | "vertical"; position: number } | null,
  selectedId: string | null,
  vw: number,
  vh: number,
): string {
  const parts: string[] = [];

  if (preview) {
    if (preview.orientation === "horizontal") {
      parts.push(
        `<line x1="0" y1="${preview.position}" x2="${vw}" y2="${preview.position}" stroke="${RULER_PREVIEW_COLOR}" stroke-width="1" stroke-dasharray="6 4" />`,
      );
    } else {
      parts.push(
        `<line x1="${preview.position}" y1="0" x2="${preview.position}" y2="${vh}" stroke="${RULER_PREVIEW_COLOR}" stroke-width="1" stroke-dasharray="6 4" />`,
      );
    }
  }

  for (const ruler of rulers) {
    const color = ruler.id === selectedId ? RULER_SELECTED_COLOR : RULER_COLOR;
    const width = ruler.id === selectedId ? 2 : 1.5;
    if (ruler.orientation === "horizontal") {
      parts.push(
        `<line x1="0" y1="${ruler.position}" x2="${vw}" y2="${ruler.position}" stroke="${color}" stroke-width="${width}" stroke-dasharray="6 3" />`,
      );
      parts.push(
        `<circle cx="${vw / 2}" cy="${ruler.position}" r="4" fill="${color}" style="cursor:grab" data-ruler-handle="${ruler.id}" />`,
      );
    } else {
      parts.push(
        `<line x1="${ruler.position}" y1="0" x2="${ruler.position}" y2="${vh}" stroke="${color}" stroke-width="${width}" stroke-dasharray="6 3" />`,
      );
      parts.push(
        `<circle cx="${ruler.position}" cy="${vh / 2}" r="4" fill="${color}" style="cursor:grab" data-ruler-handle="${ruler.id}" />`,
      );
    }
  }

  const distances = computeRulerDistances(rulers);
  for (const d of distances) {
    if (d.orientation === "horizontal") {
      const x = vw / 2;
      const posA = d.midpoint - d.distance / 2;
      const posB = d.midpoint + d.distance / 2;
      parts.push(
        `<line x1="${x}" y1="${posA}" x2="${x}" y2="${posB}" stroke="${RULER_COLOR}" stroke-width="1" />`,
      );
      parts.push(
        `<line x1="${x - 4}" y1="${posA}" x2="${x + 4}" y2="${posA}" stroke="${RULER_COLOR}" stroke-width="1" />`,
      );
      parts.push(
        `<line x1="${x - 4}" y1="${posB}" x2="${x + 4}" y2="${posB}" stroke="${RULER_COLOR}" stroke-width="1" />`,
      );
      parts.push(
        `<text x="${x + 10}" y="${d.midpoint + 4}" fill="${RULER_COLOR}" font-size="11" font-weight="700" font-family="Inter,ui-sans-serif,system-ui,sans-serif">${d.distance}px</text>`,
      );
    } else {
      const y = vh / 2;
      const posA = d.midpoint - d.distance / 2;
      const posB = d.midpoint + d.distance / 2;
      parts.push(
        `<line x1="${posA}" y1="${y}" x2="${posB}" y2="${y}" stroke="${RULER_COLOR}" stroke-width="1" />`,
      );
      parts.push(
        `<line x1="${posA}" y1="${y - 4}" x2="${posA}" y2="${y + 4}" stroke="${RULER_COLOR}" stroke-width="1" />`,
      );
      parts.push(
        `<line x1="${posB}" y1="${y - 4}" x2="${posB}" y2="${y + 4}" stroke="${RULER_COLOR}" stroke-width="1" />`,
      );
      parts.push(
        `<text x="${d.midpoint}" y="${y - 8}" fill="${RULER_COLOR}" font-size="11" font-weight="700" font-family="Inter,ui-sans-serif,system-ui,sans-serif" text-anchor="middle">${d.distance}px</text>`,
      );
    }
  }

  return parts.join("");
}

