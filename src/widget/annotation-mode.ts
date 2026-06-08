/**
 * Annotation mode — orchestrates picking an element on the host page after
 * the user clicks Comment. Renders a hover outline over the element under the
 * cursor, captures the next click as the picked element, and exits on ESC or
 * outside-cancel actions. Wraps the existing element-grab utilities.
 */

import { buildCssSelector } from "./element-grab";

const OVERLAY_Z_INDEX = 2147483645;
const PICK_OUTLINE_PADDING_PX = 4;

export interface AnnotationPick {
  element: Element;
  selector: string;
  rect: DOMRect;
}

export interface AnnotationModeOptions {
  onPicked: (pick: AnnotationPick) => void;
  onCancel: () => void;
  /**
   * Element selectors whose elements should NOT be pickable. The toolbar host
   * and pin layer pass their selectors here so users can't accidentally pin
   * the SDK's own UI.
   */
  shouldIgnore?: (target: Element) => boolean;
}

interface AnnotationOverlayHandles {
  host: HTMLDivElement;
  outline: HTMLDivElement;
  banner: HTMLDivElement;
}

export class AnnotationMode {
  private active = false;
  private destroyed = false;
  private overlay: AnnotationOverlayHandles | null = null;
  private hoverElement: Element | null = null;
  private readonly onPicked: (pick: AnnotationPick) => void;
  private readonly onCancel: () => void;
  private readonly shouldIgnore?: (target: Element) => boolean;

  constructor(options: AnnotationModeOptions) {
    this.onPicked = options.onPicked;
    this.onCancel = options.onCancel;
    this.shouldIgnore = options.shouldIgnore;
  }

  isActive(): boolean {
    return this.active;
  }

  start(): void {
    if (this.destroyed || this.active) {
      return;
    }
    this.active = true;
    this.overlay = createOverlay();
    document.body.appendChild(this.overlay.host);
    document.addEventListener("mousemove", this.handleMouseMove, true);
    document.addEventListener("click", this.handleClick, true);
    document.addEventListener("keydown", this.handleKeyDown, true);
    document.documentElement.style.cursor = "crosshair";
  }

  stop(reason: "picked" | "cancel"): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    document.removeEventListener("mousemove", this.handleMouseMove, true);
    document.removeEventListener("click", this.handleClick, true);
    document.removeEventListener("keydown", this.handleKeyDown, true);
    document.documentElement.style.cursor = "";
    this.hoverElement = null;
    this.overlay?.host.remove();
    this.overlay = null;
    if (reason === "cancel") {
      this.onCancel();
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.stop("cancel");
  }

  private handleMouseMove = (event: MouseEvent): void => {
    if (!this.active || !this.overlay) {
      return;
    }
    const target = elementUnderPoint(event.clientX, event.clientY);
    if (!target || target === this.hoverElement) {
      return;
    }
    if (this.shouldIgnore?.(target)) {
      this.hoverElement = null;
      hideOutline(this.overlay.outline);
      return;
    }
    this.hoverElement = target;
    showOutline(this.overlay.outline, target.getBoundingClientRect());
  };

  private handleClick = (event: MouseEvent): void => {
    if (!this.active) {
      return;
    }
    const target = elementUnderPoint(event.clientX, event.clientY);
    if (!target) {
      return;
    }
    if (this.shouldIgnore?.(target)) {
      // Click landed on the toolbar / pin / popover — let those handle
      // themselves and treat as a cancel signal so we don't trap the user.
      this.stop("cancel");
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const rect = target.getBoundingClientRect();
    const selector = buildCssSelector(target);
    this.stop("picked");
    this.onPicked({ element: target, selector, rect });
  };

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.active) {
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.stop("cancel");
    }
  };
}

function createOverlay(): AnnotationOverlayHandles {
  const host = document.createElement("div");
  host.setAttribute("data-obvious-feedback-pick-overlay", "true");
  host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${OVERLAY_Z_INDEX};`;
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .outline {
        position: absolute;
        border: 2px solid #facc15;
        border-radius: 4px;
        background: rgba(250, 204, 21, 0.12);
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
        will-change: transform, width, height;
        pointer-events: none;
        opacity: 0;
        transition: opacity 80ms ease;
      }
      .banner {
        position: absolute;
        left: 50%;
        top: 16px;
        transform: translateX(-50%);
        background: rgba(17, 24, 39, 0.92);
        color: #fafafa;
        font-family: -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 12px;
        font-weight: 500;
        padding: 6px 10px;
        border-radius: 999px;
        backdrop-filter: blur(8px);
        pointer-events: none;
      }
      .banner kbd {
        background: rgba(255, 255, 255, 0.12);
        border-radius: 4px;
        padding: 1px 4px;
        margin: 0 2px;
      }
    </style>
    <div class="banner"><span>Click any element to drop a pin</span> — <kbd>Esc</kbd> to cancel</div>
    <div class="outline"></div>
  `;
  const outline = shadow.querySelector(".outline");
  const banner = shadow.querySelector(".banner");
  if (!(outline instanceof HTMLDivElement) || !(banner instanceof HTMLDivElement)) {
    throw new Error("[ObviousFeedback] picker overlay failed to attach.");
  }
  return { host, outline, banner };
}

function showOutline(outline: HTMLDivElement, rect: DOMRect): void {
  const padding = PICK_OUTLINE_PADDING_PX;
  outline.style.transform = `translate3d(${rect.left - padding}px, ${rect.top - padding}px, 0)`;
  outline.style.width = `${rect.width + padding * 2}px`;
  outline.style.height = `${rect.height + padding * 2}px`;
  outline.style.opacity = "1";
}

function hideOutline(outline: HTMLDivElement): void {
  outline.style.opacity = "0";
}

function elementUnderPoint(x: number, y: number): Element | null {
  if (typeof document.elementFromPoint !== "function") {
    return null;
  }
  return document.elementFromPoint(x, y);
}
