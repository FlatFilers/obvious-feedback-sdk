/**
 * Feedback toolbar — the SDK's primary UI surface. A single flat horizontal
 * bar docked at the bottom-center of the viewport by default, draggable
 * anywhere on screen with viewport clamping and localStorage persistence.
 *
 * Cells (left to right): drag handle, branch label, PR link, thread link,
 * draft pin counter + Feedback action (merged), Fix with Autobuild. Cells without data hide automatically.
 */

import type { FeedbackContext, FeedbackSdkTheme } from "../public-types";
import { escapeHtml } from "../utils/html";
import {
  createDraggable,
  type DraggableHandle,
  type DraggablePosition,
} from "./draggable";
import { getSafeExternalUrl } from "./feedback-normalizers";
import { createIcon } from "./icons";
import { createToolbarStyles } from "./styles";

const POSITION_STORAGE_PREFIX = "obvious.feedback.toolbarPosition";
const DEFAULT_BOTTOM_OFFSET_PX = 16;
/** How long the post-Send takeover banner remains visible before dropping
 * back to the idle toolbar. Long enough to read + click "View progress",
 * short enough that it doesn't block the user from sending more feedback. */
const SENT_BANNER_VISIBLE_MS = 7000;
const ERROR_BANNER_VISIBLE_MS = 4000;

export type FeedbackToolbarStatus =
  | "idle"
  | "picking"
  | "annotating"
  | "sending"
  | "sent"
  | "error";

export interface FeedbackToolbarOptions {
  context: FeedbackContext | undefined;
  theme: FeedbackSdkTheme;
  initialPinCount: number;
  onCommentClick: () => void;
  onSendClick: () => void;
  /** Called when the toolbar mounts; receives the host element so the parent
   * can register it as an "ignore-me" target for the picker overlay. */
  onMounted?: (host: HTMLElement) => void;
}

interface FeedbackToolbarState {
  context: FeedbackContext | undefined;
  theme: FeedbackSdkTheme;
  pinCount: number;
  status: FeedbackToolbarStatus;
  errorMessage: string | null;
  hidden: boolean;
}

export class FeedbackToolbar {
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private draggable: DraggableHandle | null = null;
  private readonly resizeListener: () => void;
  private state: FeedbackToolbarState;
  private destroyed = false;
  private readonly onCommentClick: () => void;
  private readonly onSendClick: () => void;
  private statusResetTimer: number | null = null;

  constructor(options: FeedbackToolbarOptions) {
    this.onCommentClick = options.onCommentClick;
    this.onSendClick = options.onSendClick;
    this.state = {
      context: options.context,
      theme: options.theme,
      pinCount: options.initialPinCount,
      status: "idle",
      errorMessage: null,
      hidden: false,
    };

    this.host = document.createElement("div");
    this.host.setAttribute("data-obvious-feedback-toolbar", "true");
    this.host.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:auto;";
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${createToolbarStyles()}</style>`;
    document.body.appendChild(this.host);
    this.render();
    this.draggable = createDraggable({
      target: this.host,
      handle: this.requireDragSurface(),
      initialPosition: computeDefaultPosition(this.host),
      storageKey: getPositionStorageKey(),
      onDragEnd: () => {
        this.host.setAttribute("data-dragging", "false");
      },
      onDragStart: () => {
        this.host.setAttribute("data-dragging", "true");
      },
    });
    this.resizeListener = (): void => this.draggable?.reclamp();
    window.addEventListener("resize", this.resizeListener);

    options.onMounted?.(this.host);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    window.removeEventListener("resize", this.resizeListener);
    if (this.statusResetTimer !== null) {
      window.clearTimeout(this.statusResetTimer);
      this.statusResetTimer = null;
    }
    this.draggable?.destroy();
    this.draggable = null;
    this.host.remove();
  }

  setContext(context: FeedbackContext | undefined): void {
    this.state = { ...this.state, context };
    this.render();
  }

  setTheme(theme: FeedbackSdkTheme): void {
    this.state = { ...this.state, theme };
    this.render();
  }

  setPinCount(count: number): void {
    if (this.state.pinCount === count) {
      return;
    }
    this.state = { ...this.state, pinCount: count };
    this.render();
  }

  setHidden(hidden: boolean): void {
    if (this.state.hidden === hidden) {
      return;
    }
    this.state = { ...this.state, hidden };
    this.host.setAttribute("data-hidden", hidden ? "true" : "false");
  }

  setStatus(status: FeedbackToolbarStatus, errorMessage?: string | null): void {
    if (this.statusResetTimer !== null) {
      window.clearTimeout(this.statusResetTimer);
      this.statusResetTimer = null;
    }
    this.state = {
      ...this.state,
      status,
      errorMessage: status === "error" ? (errorMessage ?? "Send failed") : null,
    };
    this.render();
    if (status === "sent") {
      this.statusResetTimer = window.setTimeout(() => {
        this.statusResetTimer = null;
        this.state = { ...this.state, status: "idle" };
        this.render();
      }, SENT_BANNER_VISIBLE_MS);
    } else if (status === "error") {
      this.statusResetTimer = window.setTimeout(() => {
        this.statusResetTimer = null;
        this.state = { ...this.state, status: "idle", errorMessage: null };
        this.render();
      }, ERROR_BANNER_VISIBLE_MS);
    }
  }

  /** Force an explicit position (used for tests / programmatic reset). */
  setPosition(position: DraggablePosition): void {
    this.draggable?.setPosition(position);
  }

  private requireDragSurface(): HTMLElement {
    const element = this.shadowRoot.querySelector(".obv-toolbar");
    if (!(element instanceof HTMLElement)) {
      throw new Error("[ObviousFeedback] toolbar drag surface missing.");
    }
    return element;
  }

  private render(): void {
    const previousRect =
      this.draggable !== null ? this.host.getBoundingClientRect() : null;
    this.host.setAttribute("data-theme", this.state.theme);
    this.host.setAttribute("data-status", this.state.status);
    this.host.setAttribute("data-hidden", this.state.hidden ? "true" : "false");
    const styleMarkup = `<style>${createToolbarStyles()}</style>`;
    this.shadowRoot.innerHTML = `${styleMarkup}${this.renderToolbarHtml()}`;
    this.bindEvents();
    // The toolbar DOM is replaced on every render, so retarget the draggable
    // controller at the freshly-mounted surface. Without this, pointer events
    // on the new toolbar have no listeners attached and dragging silently no-ops
    // after the first state change.
    this.draggable?.setHandle(this.requireDragSurface());
    this.preserveToolbarCenter(previousRect);
  }

  private preserveToolbarCenter(previousRect: DOMRect | null): void {
    if (!previousRect || !this.draggable) {
      return;
    }
    const nextRect = this.host.getBoundingClientRect();
    const widthDelta = nextRect.width - previousRect.width;
    if (Math.abs(widthDelta) < 0.5) {
      return;
    }
    const currentPosition = this.draggable.getPosition();
    const nextPosition = {
      x: currentPosition.x - widthDelta / 2,
      y: currentPosition.y,
    };
    this.draggable.setPosition(nextPosition);
  }

  private renderToolbarHtml(): string {
    if (this.state.status === "sent") {
      return this.renderSentBanner();
    }
    const branchLabel = this.renderBranchLabel();
    const contextLinks = this.renderContextLinks();
    // When there's nothing between the grip and the Feedback button (no branch,
    // PR, or thread), collapse to a content-sized bar and drop the divider that
    // would otherwise frame an empty middle section.
    const isCompact = !branchLabel && !contextLinks;
    const toolbarClass = isCompact
      ? "obv-toolbar obv-toolbar-compact"
      : "obv-toolbar";
    return `
      <div class="${toolbarClass}" role="toolbar" aria-label="Obvious feedback toolbar">
        <div class="obv-group obv-group-start">
          <button type="button" class="obv-cell obv-cell-grip" data-obv-drag-handle aria-label="Drag toolbar">${createIcon("grip")}</button>
          ${branchLabel}
          ${contextLinks}
        </div>

        <div class="obv-group obv-group-end">
          ${this.renderCommentControl()}
          ${this.renderStatusLabel()}
          ${this.renderSendButton()}
        </div>
      </div>
    `;
  }

  private renderCommentControl(): string {
    const countBadge = this.renderCommentCountBadge();
    if (this.state.status === "picking") {
      return `
        <div class="obv-cell obv-cell-status obv-cell-picking" role="status" aria-live="polite" aria-label="${escapeHtml(this.getCommentAriaLabel())}">
          ${createIcon("comment")}
          <span class="obv-cell-label">Picking…</span>
          ${countBadge}
        </div>
      `;
    }
    const actionLabel = this.getCommentActionLabel();
    return `
      <button
        type="button"
        class="obv-cell obv-cell-text obv-cell-primary obv-cell-comment-action"
        data-toolbar-action="comment"
        aria-label="${escapeHtml(this.getCommentAriaLabel())}"
      >
        ${createIcon("comment")}
        <span class="obv-cell-label">${escapeHtml(actionLabel)}</span>
        ${countBadge}
      </button>
    `;
  }

  private renderCommentCountBadge(): string {
    if (this.state.pinCount <= 0) {
      return "";
    }
    return `<span class="obv-cell-count-badge" aria-hidden="true">${escapeHtml(String(this.state.pinCount))}</span>`;
  }

  /**
   * Full-bar takeover shown after a successful Send. Reuses the toolbar host
   * (so the drag handle still works) but replaces the cells with a centered
   * "Autobuild is on it" banner + CTA link to the autobuild thread.
   * Falls back to the PR link, then a CTA-less message, when context is sparse.
   */
  private renderSentBanner(): string {
    const threadUrl = getSafeExternalUrl(this.state.context?.threadUrl);
    const prUrl = getSafeExternalUrl(this.state.context?.prUrl);
    let cta = "";
    if (threadUrl) {
      cta = `<a class="obv-sent-cta" href="${escapeHtml(threadUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View progress in a new tab" title="View progress in a new tab"><span>View Progress</span>${createIcon("arrow-up-right")}</a>`;
    } else if (prUrl) {
      cta = `<a class="obv-sent-cta" href="${escapeHtml(prUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View progress in a new tab" title="View progress in a new tab"><span>View Progress</span>${createIcon("arrow-up-right")}</a>`;
    }
    return `
      <div class="obv-toolbar obv-toolbar-sent" role="status" aria-label="Feedback sent">
        <button type="button" class="obv-cell obv-cell-grip" data-obv-drag-handle aria-label="Drag toolbar">${createIcon("grip")}</button>
        <div class="obv-sent-banner">
          <span class="obv-sent-icon" aria-hidden="true">${createIcon("sparkle")}</span>
          <span class="obv-sent-text">Autobuild is on it.</span>
          ${cta}
        </div>
      </div>
    `;
  }

  private renderSendButton(): string {
    if (this.state.pinCount <= 0) {
      return "";
    }
    const isSending = this.state.status === "sending";
    const disabled = isSending ? 'disabled aria-disabled="true"' : "";
    const label = isSending ? "Starting Autobuild…" : "Fix with Autobuild";
    return `
      <button
        type="button"
        class="obv-cell obv-cell-text obv-cell-send"
        data-toolbar-action="send"
        aria-label="${escapeHtml(label)}"
        ${disabled}
      >
        ${createIcon("send")}
        <span class="obv-cell-label">${escapeHtml(label)}</span>
      </button>
    `;
  }

  private renderBranchLabel(): string {
    const context = this.state.context;
    if (!context?.branch) {
      return "";
    }
    const label = `<span class="obv-meta-item obv-meta-branch">${escapeHtml(context.branch)}</span>`;
    return `<div class="obv-cell obv-cell-meta" title="Branch ${escapeHtml(context.branch)}">${label}</div>`;
  }

  private renderContextLinks(): string {
    const context = this.state.context;
    if (!context) {
      return "";
    }
    const parts: string[] = [];
    const prUrl = getSafeExternalUrl(context.prUrl);
    if (prUrl) {
      const label = context.prNumber ? `PR #${context.prNumber}` : "PR";
      const tooltip = context.prNumber
        ? `Open PR #${context.prNumber}${context.prTitle ? ` · ${context.prTitle}` : ""}`
        : context.prTitle ?? "Open PR";
      parts.push(
        `<a class="obv-cell obv-cell-link" href="${escapeHtml(prUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(tooltip)}" title="${escapeHtml(tooltip)}">${createIcon("github")}<span class="obv-cell-label">${escapeHtml(label)}</span></a>`,
      );
    }
    const threadUrl = getSafeExternalUrl(context.threadUrl);
    if (threadUrl) {
      parts.push(
        `<a class="obv-cell obv-cell-link" href="${escapeHtml(threadUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open autobuild thread" title="Open autobuild thread">${createIcon("thread")}<span class="obv-cell-label">Thread</span></a>`,
      );
    }
    return parts.join("");
  }

  private renderStatusLabel(): string {
    if (this.state.status === "error") {
      return `<div class="obv-cell obv-cell-status" data-tone="danger" role="alert">${escapeHtml(this.state.errorMessage ?? "Send failed")}</div>`;
    }
    return "";
  }

  private bindEvents(): void {
    this.shadowRoot
      .querySelectorAll<HTMLElement>("[data-toolbar-action]")
      .forEach((element) => {
        element.addEventListener("click", (event) => {
          const action = element.getAttribute("data-toolbar-action");
          if (action === "comment") {
            event.preventDefault();
            this.onCommentClick();
          } else if (action === "send") {
            event.preventDefault();
            this.onSendClick();
          }
        });
      });
  }

  private getCommentActionLabel(): string {
    return "Feedback";
  }

  private getCommentCountSummary(): string {
    if (this.state.pinCount <= 0) {
      return "";
    }
    return `${this.state.pinCount} comment${this.state.pinCount === 1 ? "" : "s"}`;
  }

  private getCommentAriaLabel(): string {
    if (this.state.status === "picking") {
      const countSummary = this.getCommentCountSummary();
      if (countSummary) {
        return `Cancel element picker, ${countSummary} drafted`;
      }
      return "Cancel element picker";
    }
    const countSummary = this.getCommentCountSummary();
    if (countSummary) {
      return `Pick another element to give feedback on, ${countSummary} drafted`;
    }
    return "Pick an element to give feedback on";
  }
}

function getPositionStorageKey(): string {
  if (typeof window === "undefined") {
    return POSITION_STORAGE_PREFIX;
  }
  return `${POSITION_STORAGE_PREFIX}:${window.location.origin}`;
}

function computeDefaultPosition(host: HTMLElement): DraggablePosition {
  if (typeof window === "undefined") {
    return { x: 0, y: 0 };
  }
  // Default: bottom-center, 16px from bottom edge. We compute via the host's
  // current bounding rect so we work with whatever width the toolbar measures
  // after the first render.
  const rect = host.getBoundingClientRect();
  const targetX = (window.innerWidth - rect.width) / 2;
  const targetY = window.innerHeight - rect.height - DEFAULT_BOTTOM_OFFSET_PX;
  return { x: targetX, y: targetY };
}
