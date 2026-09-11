/**
 * Feedback toolbar — the SDK's primary UI surface. A single flat horizontal
 * bar docked at the bottom-center of the viewport by default, draggable
 * anywhere on screen with viewport clamping and localStorage persistence.
 *
 * Cells (left to right): drag handle, branch label, PR link, thread link,
 * draft pin counter + Feedback action (merged), Fix with Autobuild. Cells without data hide automatically.
 *
 * ## Two orthogonal geometric layers
 *
 * The toolbar separates *where it is committed* from *how it is presented*:
 *
 * - **host** (`position:fixed`) owns the committed drag position via
 *   `createDraggable`. Its `transform: translate3d(x,y,0)` is always clamped
 *   inside the viewport and persisted. The host is `pointer-events:none` so it
 *   never leaves a phantom hit area behind when the visible bar slides away.
 * - **`.obv-dock`** is a stable wrapper (never re-rendered) that owns the
 *   *presentation offset* via `transform: translateY(var(--obv-dock-y))`. Because
 *   transforms move hit-testing too, only the visually-rendered bar is
 *   interactive. "Below the screen" is a presentation offset here — never an
 *   out-of-bounds committed position — so the clamp stays intact.
 *
 * A single pure resolver (`resolveToolbarPresentation`) maps the presentation
 * state to `{ dockY, opacity, presentation }`, applied at one point
 * (`applyPresentation`). This drives edge-docking, hover-peek, and the
 * slide-to-hide shortcut without competing transform owners.
 */

import type { FeedbackContext, FeedbackSdkTheme } from "../public-types";
import { escapeHtml } from "../utils/html";
import {
  createDraggable,
  type DraggableHandle,
  type DraggableMoveInfo,
  type DraggablePosition,
} from "./draggable";
import { getSafeExternalUrl } from "./feedback-normalizers";
import { createIcon } from "./icons";
import { createToolbarStyles, TOOLBAR_HEIGHT_PX } from "./styles";

const POSITION_STORAGE_PREFIX = "obvious.feedback.toolbarPosition";
const RESTING_MODE_STORAGE_PREFIX = "obvious.feedback.toolbarRestingMode";
const VISIBLE_STORAGE_PREFIX = "obvious.feedback.toolbarVisible";
const SNOOZE_STORAGE_PREFIX = "obvious.feedback.toolbarSnoozedUntil";
const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_BOTTOM_OFFSET_PX = 16;
/** How long the post-Send takeover banner remains visible before dropping
 * back to the idle toolbar. Long enough to read + click "View progress",
 * short enough that it doesn't block the user from sending more feedback. */
const SENT_BANNER_VISIBLE_MS = 7000;
const ERROR_BANNER_VISIBLE_MS = 4000;

/** Distance pushed past the viewport edge so the tucked/hidden bar (and its
 * drop shadow) is fully out of sight. */
const HIDE_BUFFER_PX = 16;
/** How much of a docked bar pokes above the viewport edge while hover-peeking.
 * This exposes enough of the pill to clearly see and grab without fully opening. */
const PEEK_PX = 28;
const HOVER_PAD_PX = 48;
const HOVER_PAD_OVERLAP_PX = 4;
/** Drag-end distance from the viewport bottom that counts as "docked". Must be
 * larger than the draggable's clamp margin so a drag landing at the very bottom
 * is detected as a dock. */
const DOCK_SNAP_THRESHOLD_PX = 24;
/** Fallback when the live toolbar height can't be measured (e.g. jsdom). */
const FALLBACK_TOOLBAR_HEIGHT_PX = TOOLBAR_HEIGHT_PX;

export type FeedbackToolbarStatus =
  | "idle"
  | "picking"
  | "annotating"
  | "sending"
  | "sent"
  | "error";

/** Where the toolbar rests when not hidden/dragging: full bar (`open`) or
 * tucked below the bottom edge with a peek (`docked`). */
export type ToolbarRestingMode = "open" | "docked";

/** Right-click snooze windows: one hour from now, or until the next local
 * midnight. Also the `duration` discriminant of the stored snooze record. */
export type SnoozeDuration = "1h" | "day";

/** Shape persisted under `obvious.feedback.toolbarSnoozedUntil:{origin}`.
 * `until` is an absolute epoch-ms expiry, so clocks need no coordination. */
export interface StoredSnooze {
  until: number;
  duration: SnoozeDuration;
}

/** Inputs to the presentation resolver — the complete set of conditions that
 * determine where/how the toolbar is shown. */
export interface ToolbarPresentationState {
  restingMode: ToolbarRestingMode;
  userHidden: boolean;
  /** Right-click snooze: fully removes the bar (no peek, no hover pad) until
   * the stored expiry passes. Separate from `userHidden` so a snooze never
   * overwrites the standing visibility preference. */
  snoozed: boolean;
  isPeeking: boolean;
  popoverSuppressed: boolean;
  isDragging: boolean;
  dragDockY: number;
}

/** Pixel offsets derived from the live committed position. */
export interface ToolbarPresentationMetrics {
  /** dockY that leaves only a `PEEK_PX` sliver of the docked bar above the
   * viewport edge. Sits between fully-open (0) and fully-hidden (`hideOffset`).
   * The hover strip extends past this travel so the peek doesn't flicker. */
  peekOffset: number;
  /** dockY that pushes the bar fully below the viewport edge (out of sight). */
  hideOffset: number;
}

export interface ResolvedToolbarPresentation {
  /** Downward translate applied to `.obv-dock` (px). */
  dockY: number;
  /** 1 normally; 0 only for the in-place popover fade. */
  opacity: number;
  /** Whether the dock should accept pointer events. */
  interactive: boolean;
  presentation: "open" | "docked" | "hidden";
  peeking: boolean;
}

/**
 * Pure resolver: presentation state + metrics -> concrete visual output.
 * Precedence is top-down — the first matching condition wins.
 */
export function resolveToolbarPresentation(
  state: ToolbarPresentationState,
  metrics: ToolbarPresentationMetrics,
): ResolvedToolbarPresentation {
  // Snooze fully removes the bar: invisible, non-interactive, no dock sliver
  // and no hover pad. It outranks everything — including a drag in flight —
  // because a snoozed bar has no pointer events to drag with.
  if (state.snoozed) {
    return {
      dockY: 0,
      opacity: 0,
      interactive: false,
      presentation: "hidden",
      peeking: false,
    };
  }
  // While dragging, the bar always follows the cursor at the committed
  // position (dockY 0) so the user never fights the dock offset.
  if (state.isDragging) {
    return {
      dockY: state.dragDockY,
      opacity: 1,
      interactive: true,
      presentation: state.restingMode === "docked" ? "docked" : "open",
      peeking: false,
    };
  }
  // Shortcut hide stores as docked+hidden: fully below the viewport at rest,
  // but still hoverable so the bottom-edge strip can reveal the sliver.
  if (state.userHidden) {
    if (state.restingMode === "docked") {
      return state.isPeeking
        ? {
            dockY: metrics.peekOffset,
            opacity: 1,
            interactive: true,
            presentation: "docked",
            peeking: true,
          }
        : {
            dockY: metrics.hideOffset,
            opacity: 1,
            interactive: true,
            presentation: "docked",
            peeking: false,
          };
    }
    return {
      dockY: metrics.hideOffset,
      opacity: 1,
      interactive: false,
      presentation: "hidden",
      peeking: false,
    };
  }
  // Pin popover suppression keeps today's in-place fade (no slide).
  if (state.popoverSuppressed) {
    return {
      dockY: 0,
      opacity: 0,
      interactive: false,
      presentation: state.restingMode === "docked" ? "docked" : "open",
      peeking: false,
    };
  }
  if (state.restingMode === "docked") {
    // Docked-and-resting is fully out of sight; the bottom-edge hover strip is
    // the only on-screen affordance. Peeking reveals just a sliver — a click or
    // drag (which flips restingMode to "open") is what pulls it fully out.
    return state.isPeeking
      ? {
          dockY: metrics.peekOffset,
          opacity: 1,
          interactive: true,
          presentation: "docked",
          peeking: true,
        }
      : {
          dockY: metrics.hideOffset,
          opacity: 1,
          interactive: true,
          presentation: "docked",
          peeking: false,
        };
  }
  return {
    dockY: 0,
    opacity: 1,
    interactive: true,
    presentation: "open",
    peeking: false,
  };
}

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
  restingMode: ToolbarRestingMode;
  userHidden: boolean;
  snoozed: boolean;
  isPeeking: boolean;
  popoverSuppressed: boolean;
  isDragging: boolean;
  dragDockY: number;
}

export class FeedbackToolbar {
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  /** Stable wrapper that owns the presentation offset; survives re-renders. */
  private readonly dock: HTMLDivElement;
  /** Right-click snooze menu. Sibling of `.obv-dock-content` inside `.obv-dock`
   * so per-state re-renders never wipe it. */
  private readonly snoozeMenu: HTMLDivElement;
  /** Transparent hit-area extension above the peek so it's easier to reveal. */
  private readonly hoverPad: HTMLDivElement;
  /** Container whose inner HTML is swapped each render. */
  private readonly dockContent: HTMLDivElement;
  private draggable: DraggableHandle | null = null;
  private readonly resizeListener: () => void;
  private state: FeedbackToolbarState;
  private destroyed = false;
  private readonly onCommentClick: () => void;
  private readonly onSendClick: () => void;
  private statusResetTimer: number | null = null;
  /** In-tab snooze expiry timer. Mirrors the statusResetTimer lifecycle:
   * armed whenever the tab learns of an active snooze, cleared in destroy(). */
  private snoozeExpiryTimer: number | null = null;
  private suppressNextDockClick = false;
  /** Element focus returns to when the snooze menu closes. Captured at open —
   * right-click (contextmenu) never moves focus, so this holds whatever the
   * user had focused, or null when nothing did. After an item selection the
   * bar hides, so restoring focus into the (now hidden) bar is the accepted
   * choice: the menu must never strand focus in a detached shadow subtree or
   * on <body>. */
  private menuFocusReturn: HTMLElement | null = null;

  constructor(options: FeedbackToolbarOptions) {
    this.onCommentClick = options.onCommentClick;
    this.onSendClick = options.onSendClick;
    const initialUserHidden = readStoredUserHidden();
    const initialSnooze = readActiveSnooze();
    this.state = {
      context: options.context,
      theme: options.theme,
      pinCount: options.initialPinCount,
      status: "idle",
      errorMessage: null,
      restingMode: initialUserHidden ? "docked" : readStoredRestingMode(),
      userHidden: initialUserHidden,
      snoozed: initialSnooze !== null,
      isPeeking: false,
      popoverSuppressed: false,
      isDragging: false,
      dragDockY: 0,
    };

    this.host = document.createElement("div");
    this.host.setAttribute("data-obvious-feedback-toolbar", "true");
    // The host is a pure anchor: pointer-events:none so the committed (clamped)
    // box never intercepts clicks for the region the visible bar slid away from.
    this.host.style.cssText =
      "position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;";
    this.shadowRoot = this.host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = createToolbarStyles();
    this.shadowRoot.appendChild(style);

    this.dock = document.createElement("div");
    this.dock.className = "obv-dock";
    this.hoverPad = document.createElement("div");
    this.hoverPad.className = "obv-dock-hover-pad";
    this.hoverPad.setAttribute("aria-hidden", "true");
    this.dockContent = document.createElement("div");
    this.dockContent.className = "obv-dock-content";
    this.dock.appendChild(this.dockContent);
    this.snoozeMenu = this.createSnoozeMenu();
    this.dock.appendChild(this.snoozeMenu);
    // The hover pad is intentionally outside `.obv-dock`: it must not move with
    // the dock transform, or the peek target slides out from under the cursor.
    this.shadowRoot.appendChild(this.hoverPad);
    this.shadowRoot.appendChild(this.dock);

    document.body.appendChild(this.host);

    this.dock.addEventListener("pointerenter", this.handlePointerEnter);
    this.dock.addEventListener("pointerleave", this.handlePointerLeave);
    this.hoverPad.addEventListener("pointerenter", this.handlePointerEnter);
    this.hoverPad.addEventListener("pointerleave", this.handlePointerLeave);
    // Capture so the first click on the peeking sliver pulls the bar out before
    // it can reach a toolbar action button.
    this.dock.addEventListener("click", this.handleDockClick, true);
    // Right-click anywhere on the bar opens the snooze menu — the whole
    // .obv-toolbar is the drag surface and draggable.ts ignores button !== 0,
    // so a right-click never drags and never conflicts with this listener.
    this.dock.addEventListener("contextmenu", this.handleToolbarContextMenu);

    this.render();
    this.draggable = createDraggable({
      target: this.host,
      handle: this.requireDragSurface(),
      initialPosition: computeDefaultPosition(this.host),
      storageKey: getPositionStorageKey(),
      onDragMove: (_position, info) => this.handleDragMove(info),
      onDragEnd: (position, info) => this.handleDragEnd(position, info),
      onDragStart: () => this.handleDragStart(),
    });
    this.resizeListener = (): void => {
      this.draggable?.reclamp();
      // Committed position changed → dock offsets are derived from it, so
      // recompute the slide distances against the new viewport.
      this.applyPresentation();
    };
    window.addEventListener("resize", this.resizeListener);
    // Net-new cross-tab channel: nothing else in src listens to "storage".
    // Sibling tabs of the same origin apply/clear the snooze as the key changes.
    window.addEventListener("storage", this.handleStorageEvent);

    // The first render's applyPresentation ran before the draggable positioned
    // the host (it was still at top:0), so the offsets were measured against the
    // wrong rect. Recompute now that the host sits at its committed position.
    this.applyPresentation();

    // Reload path: resume the countdown for an unexpired stored snooze.
    if (initialSnooze !== null) {
      this.armSnoozeExpiryTimer(initialSnooze.until);
    }

    options.onMounted?.(this.host);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    window.removeEventListener("resize", this.resizeListener);
    window.removeEventListener("storage", this.handleStorageEvent);
    this.dock.removeEventListener("pointerenter", this.handlePointerEnter);
    this.dock.removeEventListener("pointerleave", this.handlePointerLeave);
    this.hoverPad.removeEventListener("pointerenter", this.handlePointerEnter);
    this.hoverPad.removeEventListener("pointerleave", this.handlePointerLeave);
    this.dock.removeEventListener("click", this.handleDockClick, true);
    this.dock.removeEventListener(
      "contextmenu",
      this.handleToolbarContextMenu,
    );
    // Also unregisters the window pointerdown listener while it is attached.
    this.closeSnoozeMenu();
    if (this.statusResetTimer !== null) {
      window.clearTimeout(this.statusResetTimer);
      this.statusResetTimer = null;
    }
    if (this.snoozeExpiryTimer !== null) {
      window.clearTimeout(this.snoozeExpiryTimer);
      this.snoozeExpiryTimer = null;
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

  /** Suppress the toolbar in place (opacity fade) while a pin popover is open.
   * Distinct from `userHidden` — this never slides the bar off-screen. */
  setPopoverSuppressed(suppressed: boolean): void {
    if (this.state.popoverSuppressed === suppressed) {
      return;
    }
    this.state = { ...this.state, popoverSuppressed: suppressed };
    this.applyPresentation();
  }

  /** Whether the user has explicitly hidden the toolbar (shortcut slide). */
  isUserHidden(): boolean {
    return this.state.userHidden;
  }

  /** Whether a right-click snooze is currently suppressing the bar. */
  isSnoozed(): boolean {
    return this.state.snoozed;
  }

  setUserHidden(hidden: boolean): void {
    if (hidden) {
      if (
        this.state.userHidden &&
        this.state.restingMode === "docked" &&
        !this.state.isPeeking
      ) {
        return;
      }
      this.state = {
        ...this.state,
        userHidden: true,
        restingMode: "docked",
        isPeeking: false,
      };
      persistUserHidden(true);
      persistRestingMode("docked");
      this.applyPresentation();
      return;
    }
    if (!this.state.userHidden && !this.state.snoozed && this.state.restingMode === "open") {
      return;
    }
    this.revealFully();
  }

  /** Right-click snooze: hide the bar until the computed expiry. Persists the
   * snooze under its origin-scoped key (sibling tabs apply it via the storage
   * event; reloads re-read it) and arms the in-tab expiry timer. Storage
   * failure degrades to session-only — the timer still restores this tab. */
  snooze(duration: SnoozeDuration): void {
    const until = computeSnoozeUntil(duration);
    persistSnooze({ until, duration });
    this.state = { ...this.state, snoozed: true };
    this.closeSnoozeMenu();
    this.armSnoozeExpiryTimer(until);
    this.applyPresentation();
  }

  /**
   * Shortcut toggle. When the bar is fully open it slides completely out of
   * sight; otherwise (shortcut-hidden OR docked) it comes back *fully* from the
   * bottom — undocking so it's the full open bar, not the docked sliver.
   * Returns the new hidden value.
   */
  toggleUserHidden(): boolean {
    const fullyVisible =
      !this.state.userHidden &&
      !this.state.snoozed &&
      this.state.restingMode === "open";
    if (fullyVisible) {
      this.setUserHidden(true);
      return true;
    }
    this.revealFully();
    return false;
  }

  /** Bring the bar fully on-screen: clear the shortcut-hide and undock.
   * Showing the bar doubles as the snooze cancel — setToolbarVisible(true)
   * lands here and removes any active snooze alongside the standing pref. */
  private revealFully(): void {
    this.cancelSnooze();
    this.state = {
      ...this.state,
      userHidden: false,
      restingMode: "open",
      isPeeking: false,
    };
    persistUserHidden(false);
    persistRestingMode("open");
    this.applyPresentation();
  }

  /** Arm the in-tab expiry countdown for an active snooze. Re-arming with a
   * different deadline (storage event) replaces the pending timer. */
  private armSnoozeExpiryTimer(until: number): void {
    if (this.snoozeExpiryTimer !== null) {
      window.clearTimeout(this.snoozeExpiryTimer);
    }
    const remaining = Math.max(0, until - Date.now());
    this.snoozeExpiryTimer = window.setTimeout(() => {
      this.snoozeExpiryTimer = null;
      this.handleSnoozeExpired();
    }, remaining);
  }

  /** Timer expiry: clear the stored key (siblings see the removal and restore
   * too) and bring the bar back to its prior resting state. */
  private handleSnoozeExpired(): void {
    if (!this.state.snoozed) {
      return; // cancel or a sibling storage event beat the timer here
    }
    clearStoredSnooze();
    this.state = { ...this.state, snoozed: false };
    this.applyPresentation();
  }

  /** Host cancel path (setToolbarVisible(true) → revealFully): clear timer,
   * remove the stored key, and drop the local snooze state. */
  private cancelSnooze(): void {
    if (this.snoozeExpiryTimer !== null) {
      window.clearTimeout(this.snoozeExpiryTimer);
      this.snoozeExpiryTimer = null;
    }
    clearStoredSnooze();
    if (this.state.snoozed) {
      this.state = { ...this.state, snoozed: false };
    }
  }

  /** Storage-event handler: another tab applied or cleared the snooze. The
   * writing tab never receives its own storage event, so this is the only
   * cross-tab channel — no storage writes here, the writer owns those. */
  private handleStorageEvent = (event: StorageEvent): void => {
    // key === null means localStorage.clear(), which also wipes the snooze key.
    if (event.key !== null && event.key !== getSnoozeStorageKey()) {
      return;
    }
    const snooze = parseStoredSnooze(event.newValue, Date.now());
    if (snooze !== null) {
      this.state = { ...this.state, snoozed: true };
      this.closeSnoozeMenu();
      this.armSnoozeExpiryTimer(snooze.until);
      this.applyPresentation();
      return;
    }
    if (this.snoozeExpiryTimer !== null) {
      window.clearTimeout(this.snoozeExpiryTimer);
      this.snoozeExpiryTimer = null;
    }
    if (this.state.snoozed) {
      this.state = { ...this.state, snoozed: false };
      this.applyPresentation();
    }
  };

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

  private handleDragStart(): void {
    // Drag start dismisses the snooze menu (one of the four dismissal paths).
    this.closeSnoozeMenu();
    if (this.state.userHidden) {
      // A drag from the shortcut-hidden peek is an explicit reveal/interaction.
      // Keep the eventual drag-end from resolving to userHidden + open, which
      // would become a non-hoverable hidden state.
      persistUserHidden(false);
    }
    this.state = {
      ...this.state,
      userHidden: false,
      isDragging: true,
      dragDockY: 0,
    };
    this.host.setAttribute("data-dragging", "true");
    this.applyPresentation();
  }

  private handleDragMove(info: DraggableMoveInfo): void {
    const nextDockY = Math.max(0, info.overflowY);
    if (Math.abs(nextDockY - this.state.dragDockY) < 0.5) {
      return;
    }
    this.state = { ...this.state, dragDockY: nextDockY };
    this.applyPresentation();
  }

  private handleDragEnd(
    position: DraggablePosition,
    info: DraggableMoveInfo,
  ): void {
    // The host rect reflects the committed (clamped) position because the dock
    // remains clamped. Raw overdrag is carried by the presentation offset so the
    // visible bar can follow the pointer below the screen without persisting an
    // invalid committed coordinate.
    const mode =
      info.overflowY > 0 ? "docked" : this.detectDockAtDragEnd();
    this.state = {
      ...this.state,
      isDragging: false,
      restingMode: mode,
      isPeeking: false,
      dragDockY: 0,
    };
    this.suppressNextDockClick = mode === "docked";
    this.host.setAttribute("data-dragging", "false");
    persistRestingMode(mode);
    this.applyPresentation();
  }

  private detectDockAtDragEnd(): ToolbarRestingMode {
    if (typeof window === "undefined") {
      return "open";
    }
    const rect = this.host.getBoundingClientRect();
    const distanceFromBottom = window.innerHeight - rect.bottom;
    return distanceFromBottom <= DOCK_SNAP_THRESHOLD_PX ? "docked" : "open";
  }

  private handlePointerEnter = (): void => {
    this.setPeeking(true);
  };

  private handlePointerLeave = (event: PointerEvent): void => {
    if (this.isPointerStillInPeekRegion(event)) {
      return;
    }
    this.setPeeking(false);
  };

  private isPointerStillInPeekRegion(event: PointerEvent): boolean {
    const target = event.relatedTarget;
    if (target instanceof Node) {
      if (this.dock.contains(target) || this.hoverPad.contains(target)) {
        return true;
      }
    }
    const rect = this.host.getBoundingClientRect();
    const withinX = event.clientX >= rect.left && event.clientX <= rect.right;
    const withinStableBottomBand =
      event.clientY >= rect.bottom - HOVER_PAD_OVERLAP_PX &&
      event.clientY <= rect.bottom + HOVER_PAD_PX;
    return withinX && withinStableBottomBand;
  }

  private handleDockClick = (event: MouseEvent): void => {
    if (this.suppressNextDockClick) {
      this.suppressNextDockClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Snooze-menu clicks belong to the menu, never to dock/undock logic. The
    // guard must use composedPath: in the docked/user-hidden state this capture
    // handler runs before the menu's own click listener, and without it a real
    // browser's retargeted click would fall through to the dock branch below —
    // swallowing the menu click (no snooze armed) while revealFully() persisted
    // userHidden=false, wiping the standing visibility preference.
    if (event.composedPath().includes(this.snoozeMenu)) {
      return;
    }
    const actionElement =
      event.target instanceof Element
        ? event.target.closest("[data-toolbar-action]")
        : null;
    if (this.state.restingMode === "docked" && actionElement !== null) {
      this.revealFully();
      return;
    }
    // While docked the bar only peeks a sliver. The first click pulls it fully
    // out (undock) and is swallowed so it doesn't also trigger a toolbar action.
    // Dragging is handled separately via drag-end dock detection.
    if (this.state.restingMode !== "docked") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    this.revealFully();
  };

  /** Build the snooze menu: two real menuitem buttons with roving-focus
   * arrow-key navigation, Escape-to-close, and the bar's theme variables so it
   * matches in both themes. Bound once — it is never re-rendered. */
  private createSnoozeMenu(): HTMLDivElement {
    const menu = document.createElement("div");
    menu.className = "obv-toolbar-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Hide toolbar");
    menu.hidden = true;
    menu.innerHTML = `
      <button type="button" role="menuitem" class="obv-toolbar-menu-item" data-obv-snooze="1h" tabindex="-1">Hide for 1 hour</button>
      <button type="button" role="menuitem" class="obv-toolbar-menu-item" data-obv-snooze="day" tabindex="-1">Hide until tomorrow</button>
    `;
    menu.addEventListener("click", (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest("[data-obv-snooze]")
          : null;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const duration = target.getAttribute("data-obv-snooze");
      if (duration !== "1h" && duration !== "day") {
        return;
      }
      this.snooze(duration);
    });
    menu.addEventListener("keydown", this.handleMenuKeyDown);
    return menu;
  }

  private getMenuItems(): HTMLButtonElement[] {
    return Array.from(
      this.snoozeMenu.querySelectorAll<HTMLButtonElement>("[data-obv-snooze]"),
    );
  }

  /** Open the snooze menu anchored above the bar, flipping below when the
   * viewport clips the preferred position. Focuses the first item so arrow
   * keys work immediately after a right-click. */
  private openSnoozeMenu(): void {
    if (this.state.isDragging || !this.snoozeMenu.hidden) {
      return;
    }
    // Capture before the menu moves focus to its first item. Resolved against
    // the shadow root: document.activeElement would report the host element.
    const active = this.shadowRoot.activeElement;
    this.menuFocusReturn = active instanceof HTMLElement ? active : null;
    this.snoozeMenu.hidden = false;
    this.snoozeMenu.classList.remove("obv-toolbar-menu-flip");
    // In test environments rects are zero, so top < 0 only happens in a real
    // layout where the above-anchor is clipped by the viewport's top edge.
    const rect = this.snoozeMenu.getBoundingClientRect();
    if (rect.top < 0) {
      this.snoozeMenu.classList.add("obv-toolbar-menu-flip");
    }
    window.addEventListener(
      "pointerdown",
      this.handleMenuOutsidePointerDown,
      true,
    );
    this.getMenuItems()[0]?.focus();
  }

  private closeSnoozeMenu(): void {
    if (this.snoozeMenu.hidden) {
      return;
    }
    this.snoozeMenu.hidden = true;
    window.removeEventListener(
      "pointerdown",
      this.handleMenuOutsidePointerDown,
      true,
    );
    // Restore focus on every close path (Escape, outside pointerdown, drag,
    // item selection). When nothing held focus before the open, the bar's
    // drag handle is the fallback landing spot — a real focusable element
    // inside the bar, unlike the unfocusable dock wrapper.
    const returnTarget =
      this.menuFocusReturn ??
      this.shadowRoot.querySelector<HTMLElement>(".obv-cell-grip");
    this.menuFocusReturn = null;
    returnTarget?.focus();
  }

  private handleToolbarContextMenu = (event: MouseEvent): void => {
    if (this.state.isDragging) {
      return; // never open while a drag is in progress
    }
    if (event.composedPath().includes(this.snoozeMenu)) {
      return; // right-click on the open menu is not a reopen
    }
    event.preventDefault(); // suppress the browser's context menu
    this.openSnoozeMenu();
  };

  private handleMenuOutsidePointerDown = (event: PointerEvent): void => {
    // composedPath, not contains(event.target): this listener sits on window,
    // outside the shadow root, and real browsers retarget shadow-internal
    // events to the host element — target would never be inside the menu even
    // when the pointerdown lands on a menu item. composedPath preserves the
    // real path across the shadow boundary in every browser.
    if (event.composedPath().includes(this.snoozeMenu)) {
      return;
    }
    this.closeSnoozeMenu();
  };

  private handleMenuKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.closeSnoozeMenu();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = this.getMenuItems();
    if (items.length === 0) {
      return;
    }
    // With shadow DOM, document.activeElement would report the host — resolve
    // against the shadow root to find the focused menuitem.
    const active = this.shadowRoot.activeElement;
    const currentIndex = items.findIndex((item) => item === active);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      currentIndex === -1
        ? 0
        : (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  private setPeeking(peeking: boolean): void {
    if (this.state.isPeeking === peeking) {
      return;
    }
    this.state = { ...this.state, isPeeking: peeking };
    this.applyPresentation();
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
    // Only the inner toolbar markup is replaced — the <style>, `.obv-dock`, and
    // hover pad are stable so the slide transition survives re-renders.
    this.dockContent.innerHTML = this.renderToolbarHtml();
    this.bindEvents();
    // The toolbar DOM is replaced on every render, so retarget the draggable
    // controller at the freshly-mounted surface. Without this, pointer events
    // on the new toolbar have no listeners attached and dragging silently no-ops
    // after the first state change.
    this.draggable?.setHandle(this.requireDragSurface());
    this.preserveToolbarCenter(previousRect);
    // Content (and therefore height) may have changed, so recompute offsets.
    this.applyPresentation();
  }

  private applyPresentation(): void {
    const metrics = this.computePresentationMetrics();
    const resolved = resolveToolbarPresentation(
      {
        restingMode: this.state.restingMode,
        userHidden: this.state.userHidden,
        snoozed: this.state.snoozed,
        isPeeking: this.state.isPeeking,
        popoverSuppressed: this.state.popoverSuppressed,
        isDragging: this.state.isDragging,
        dragDockY: this.state.dragDockY,
      },
      metrics,
    );
    this.host.style.setProperty("--obv-dock-y", `${resolved.dockY}px`);
    this.host.setAttribute("data-presentation", resolved.presentation);
    this.host.setAttribute("data-peeking", resolved.peeking ? "true" : "false");
    // `data-hidden` continues to drive the in-place opacity fade, now reserved
    // for popover suppression (the only state that returns opacity 0).
    this.host.setAttribute(
      "data-hidden",
      resolved.opacity === 0 ? "true" : "false",
    );
  }

  private computePresentationMetrics(): ToolbarPresentationMetrics {
    if (typeof window === "undefined") {
      const fallbackHide =
        FALLBACK_TOOLBAR_HEIGHT_PX + DEFAULT_BOTTOM_OFFSET_PX + HIDE_BUFFER_PX;
      return {
        peekOffset: Math.max(
          0,
          FALLBACK_TOOLBAR_HEIGHT_PX + DEFAULT_BOTTOM_OFFSET_PX - PEEK_PX,
        ),
        hideOffset: fallbackHide,
      };
    }
    // Offsets are measured from the host's committed (clamped) rect, which is
    // unaffected by the dock's transform — so they're stable regardless of the
    // current slide position. `gapBelow` is the resting margin to the viewport
    // bottom; pushing past it (plus the bar height + buffer) hides the bar and
    // its shadow entirely, while leaving `PEEK_PX` short of that exposes a sliver.
    const rect = this.host.getBoundingClientRect();
    const measurable = rect.height > 0;
    const height = measurable ? rect.height : FALLBACK_TOOLBAR_HEIGHT_PX;
    const gapBelow = measurable
      ? Math.max(0, window.innerHeight - rect.bottom)
      : DEFAULT_BOTTOM_OFFSET_PX;
    return {
      peekOffset: Math.max(0, height + gapBelow - PEEK_PX),
      hideOffset: height + gapBelow + HIDE_BUFFER_PX,
    };
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

  private resolveSentProgressUrl(): string | undefined {
    const threadUrl = getSafeExternalUrl(this.state.context?.threadUrl);
    if (threadUrl) {
      return threadUrl;
    }
    const prUrl = getSafeExternalUrl(this.state.context?.prUrl);
    if (prUrl) {
      return prUrl;
    }
    return getSafeExternalUrl(this.state.context?.issueUrl);
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
   * Falls back to the PR link, then the triage issue page, when context is sparse.
   */
  private renderSentBanner(): string {
    const progressUrl = this.resolveSentProgressUrl();
    const cta = progressUrl
      ? `<a class="obv-sent-cta" href="${escapeHtml(progressUrl)}" target="_blank" rel="noopener noreferrer" aria-label="View progress in a new tab" title="View progress in a new tab"><span>View Progress</span>${createIcon("arrow-up-right")}</a>`
      : "";
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

function getRestingModeStorageKey(): string {
  if (typeof window === "undefined") {
    return RESTING_MODE_STORAGE_PREFIX;
  }
  return `${RESTING_MODE_STORAGE_PREFIX}:${window.location.origin}`;
}

function readStoredRestingMode(): ToolbarRestingMode {
  if (typeof window === "undefined") {
    return "open";
  }
  try {
    return window.localStorage.getItem(getRestingModeStorageKey()) === "docked"
      ? "docked"
      : "open";
  } catch {
    return "open";
  }
}

function persistRestingMode(mode: ToolbarRestingMode): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(getRestingModeStorageKey(), mode);
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function getVisibleStorageKey(): string {
  if (typeof window === "undefined") {
    return VISIBLE_STORAGE_PREFIX;
  }
  return `${VISIBLE_STORAGE_PREFIX}:${window.location.origin}`;
}

function readStoredUserHidden(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  try {
    // Stored value tracks *visibility*: "false" means the user hid the toolbar.
    return window.localStorage.getItem(getVisibleStorageKey()) === "false";
  } catch {
    return false;
  }
}

function persistUserHidden(hidden: boolean): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(getVisibleStorageKey(), hidden ? "false" : "true");
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
}

function getSnoozeStorageKey(): string {
  if (typeof window === "undefined") {
    return SNOOZE_STORAGE_PREFIX;
  }
  return `${SNOOZE_STORAGE_PREFIX}:${window.location.origin}`;
}

/** Absolute expiry for a snooze window: "1h" is now + one hour; "day" is the
 * next local midnight (user's timezone — at 23:30 that is a 30-minute snooze,
 * which is the plain meaning of "until tomorrow"). */
export function computeSnoozeUntil(
  duration: SnoozeDuration,
  now = Date.now(),
): number {
  if (duration === "1h") {
    return now + ONE_HOUR_MS;
  }
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
}

/** Shape-check a parsed snooze record without casts: until is a finite epoch-ms
 * number and duration is one of the two supported windows. */
function isStoredSnoozeShape(value: unknown): value is StoredSnooze {
  return (
    typeof value === "object" &&
    value !== null &&
    "until" in value &&
    typeof value.until === "number" &&
    Number.isFinite(value.until) &&
    "duration" in value &&
    (value.duration === "1h" || value.duration === "day")
  );
}

/** Parse + validate a stored snooze payload. Returns null for malformed or
 * expired values — the caller treats both as "no snooze". */
function parseStoredSnooze(raw: string | null, now: number): StoredSnooze | null {
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isStoredSnoozeShape(parsed) || parsed.until <= now) {
    return null;
  }
  return parsed;
}

/** Read the currently-active snooze, if any. A malformed or expired stored
 * value is removed on the spot so the bar shows; storage failures (private
 * mode, quota) degrade to "no snooze". */
export function readActiveSnooze(now = Date.now()): StoredSnooze | null {
  if (typeof window === "undefined") {
    return null;
  }
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(getSnoozeStorageKey());
  } catch {
    return null;
  }
  const snooze = parseStoredSnooze(raw, now);
  if (snooze !== null) {
    return snooze;
  }
  if (raw !== null) {
    try {
      window.localStorage.removeItem(getSnoozeStorageKey());
    } catch {
      // Ignore storage failures — the in-memory state still wins.
    }
  }
  return null;
}

function persistSnooze(snooze: StoredSnooze): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(getSnoozeStorageKey(), JSON.stringify(snooze));
  } catch {
    // Ignore storage failures (private mode, quota, etc.) — degrades to
    // session-only: the in-tab timer still restores the bar.
  }
}

function clearStoredSnooze(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(getSnoozeStorageKey());
  } catch {
    // Ignore storage failures (private mode, quota, etc.).
  }
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
