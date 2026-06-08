/**
 * Pin overlay — renders numbered annotation markers on the host page and
 * manages their inline comment popovers. Pins are session-scoped (no reload
 * persistence). Each pin maps 1:1 to a pending feedback item; submitting the
 * batch is the parent widget's responsibility.
 *
 * Each pin also owns a "Tweak" panel that lets the user mutate the picked
 * element's CSS in real time (font-size, padding, radius, gap, colors).
 * Overrides apply inline to the live element, persist while the pin exists,
 * and are restored when the pin is deleted, the round is submitted, or the
 * SDK is destroyed.
 */

import type {
  FeedbackDesignSystemConfig,
  FeedbackSdkTheme,
  FeedbackVisualSuggestion,
  FeedbackVisualSuggestionIntent,
  FeedbackVisualSuggestionProperty,
  FeedbackVisualSuggestionSource,
  FeedbackVisualSuggestionToken,
} from "../public-types";
import { escapeHtml } from "../utils/html";
import {
  buildDesignTokenCatalog,
  type DesignToken,
  mergeTokenCatalogs,
  type TokenCatalog,
} from "./design-token-inference";
import {
  createDraggable,
  type DraggableHandle,
  type DraggablePosition,
} from "./draggable";
import { createIcon } from "./icons";
import { buildObviousTokenManifestCatalog } from "./obvious-token-manifest";
import {
  planTweakControls,
  type TweakControlPlan,
  type TweakTokenChip,
} from "./tweak-control-planner";
import {
  cssColorToHex,
  getComputedSuggestionValue,
  isColorProperty,
  parseNumericValue,
  sanitizeSuggestionValue,
  VISUAL_SUGGESTION_PROPERTIES,
} from "./visual-suggestions";

const PIN_LAYER_Z_INDEX = 2147483646;
const PIN_RADIUS_PX = 11;
const POPOVER_WIDTH_PX = 340;
const POPOVER_OFFSET_PX = 12;
const VIEWPORT_MARGIN_PX = 12;
const STORAGE_KEY = "obvious.feedback.draftPins";

type PinAnchor = {
  selector: string;
  rect: { left: number; top: number; width: number; height: number };
  pageX: number;
  pageY: number;
};

interface OriginalStyleEntry {
  computed: string;
  previousInline: string | null;
}

interface OverrideRecord {
  /** Value applied via `element.style.setProperty(property, ...)`. */
  appliedValue: string;
  /** What the agent should do with this override on the backend. */
  source: FeedbackVisualSuggestionSource;
  /** Token metadata when `source === "token"`. */
  token?: FeedbackVisualSuggestionToken;
  /** Intent identifier when `source === "intent"`. */
  intent?: FeedbackVisualSuggestionIntent;
  /** Conservative preview value (matches `appliedValue` when source is intent). */
  previewValue?: string;
}

export interface OverrideOptions {
  source?: FeedbackVisualSuggestionSource;
  token?: FeedbackVisualSuggestionToken;
  intent?: FeedbackVisualSuggestionIntent;
  previewValue?: string;
}

export interface DraftPinSnapshot {
  id: string;
  number: number;
  comment: string;
  anchor: PinAnchor;
  /** Inline CSS overrides applied to the picked element by this pin. */
  overrides: FeedbackVisualSuggestion[];
}

export interface PinOverlayOptions {
  theme: FeedbackSdkTheme;
  designSystem?: FeedbackDesignSystemConfig;
  /** Per-origin storage key suffix; pins persist while the host page is open. */
  storageNamespace?: string;
}

export interface PinViewport {
  scrollX: number;
  scrollY: number;
  innerWidth: number;
  innerHeight: number;
}

interface PinElement {
  id: string;
  number: number;
  comment: string;
  anchor: PinAnchor;
  marker: HTMLButtonElement;
  /** Live HTML element for visual mutations; may go stale on host re-render. */
  liveElement: HTMLElement | null;
  /** Per-property control plan computed once when the pin is created. */
  controlPlans: TweakControlPlan[];
  /** Properties relevant for this element (filtered by tag/role/style). */
  applicableProperties: FeedbackVisualSuggestionProperty[];
  /** Original computed value + previous inline value at pick time. */
  originals: Map<FeedbackVisualSuggestionProperty, OriginalStyleEntry>;
  /** Currently-applied override records keyed by property. */
  overrides: Map<FeedbackVisualSuggestionProperty, OverrideRecord>;
}

export class PinOverlay {
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly layer: HTMLDivElement;
  private readonly pins = new Map<string, PinElement>();
  private nextNumber = 1;
  private theme: FeedbackSdkTheme;
  private destroyed = false;
  private activePopoverId: string | null = null;
  private activePopoverDrag: DraggableHandle | null = null;
  private activeElementOutline: HTMLDivElement | null = null;
  private readonly popoverPositions = new Map<string, DraggablePosition>();
  private rafHandle: number | null = null;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly listeners = new Set<(count: number) => void>();
  private readonly designSystem: FeedbackDesignSystemConfig | undefined;
  private cachedCatalog: TokenCatalog | null = null;

  constructor(options: PinOverlayOptions) {
    this.theme = options.theme;
    this.designSystem = options.designSystem;
    this.host = document.createElement("div");
    this.host.setAttribute("data-obvious-feedback-pin-layer", "true");
    this.host.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:${PIN_LAYER_Z_INDEX};`;
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `<style>${createPinStyles()}</style><div class="obv-pin-layer" data-theme="${escapeHtml(this.theme)}"></div>`;
    const layer = this.shadowRoot.querySelector(".obv-pin-layer");
    if (!(layer instanceof HTMLDivElement)) {
      throw new Error("[ObviousFeedback] pin layer failed to attach.");
    }
    this.layer = layer;
    document.body.appendChild(this.host);
    this.installListeners();
    this.resizeObserver = createResizeObserver(() => this.scheduleRecompute());
    if (this.resizeObserver) {
      this.resizeObserver.observe(document.body);
    }
    this.scheduleRecompute();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.uninstallListeners();
    this.activePopoverDrag?.destroy();
    this.activePopoverDrag = null;
    this.removeActiveElementOutline();
    this.resizeObserver?.disconnect();
    if (this.rafHandle !== null) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
    this.restoreAllPinStyles();
    this.host.remove();
    this.pins.clear();
    this.listeners.clear();
  }

  setTheme(theme: FeedbackSdkTheme): void {
    this.theme = theme;
    this.layer.setAttribute("data-theme", theme);
  }

  /**
   * Add a new pin anchored to the picked element. Captures originals for the
   * subset of properties applicable to this element so the tweak panel knows
   * the start values and how to revert.
   */
  addPin(anchor: PinAnchor, liveElement: HTMLElement | null): DraftPinSnapshot {
    const number = this.nextNumber;
    this.nextNumber += 1;
    const id = `pin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const catalog = this.getCatalog();
    const controlPlans = liveElement ? planTweakControls(liveElement, catalog) : [];
    const applicableProperties = controlPlans.map((plan) => plan.property);
    const originals = liveElement
      ? captureOriginals(liveElement, applicableProperties)
      : new Map<FeedbackVisualSuggestionProperty, OriginalStyleEntry>();
    const marker = this.createMarker({ id, number });
    this.layer.appendChild(marker);
    const pin: PinElement = {
      id,
      number,
      comment: "",
      anchor,
      marker,
      liveElement,
      controlPlans,
      applicableProperties,
      originals,
      overrides: new Map(),
    };
    this.pins.set(id, pin);
    this.recomputePositions();
    this.notifyCount();
    this.openPopover(id);
    return this.snapshotPin(pin);
  }

  private getCatalog(): TokenCatalog {
    if (this.cachedCatalog) {
      return this.cachedCatalog;
    }
    const runtimeCatalog = buildDesignTokenCatalog();
    const manifestCatalog = buildObviousTokenManifestCatalog(
      this.designSystem?.tokensMarkdown,
    );
    this.cachedCatalog = mergeTokenCatalogs(manifestCatalog, runtimeCatalog);
    return this.cachedCatalog;
  }

  removePin(id: string): void {
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    this.restorePinStyles(entry);
    entry.marker.remove();
    this.pins.delete(id);
    this.popoverPositions.delete(id);
    this.renumber();
    this.notifyCount();
    if (this.activePopoverId === id) {
      this.closePopover();
    }
  }

  updatePinComment(id: string, comment: string): void {
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    entry.comment = comment;
  }

  setOverride(
    id: string,
    property: FeedbackVisualSuggestionProperty,
    value: string,
    options?: OverrideOptions,
  ): void {
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    if (!entry.applicableProperties.includes(property)) {
      return;
    }
    const sanitized = sanitizeSuggestionValue(value);
    if (!sanitized) {
      return;
    }
    const original = entry.originals.get(property);
    if (!original) {
      return;
    }
    const resolvedSource: FeedbackVisualSuggestionSource =
      options?.source ?? "raw";
    if (resolvedSource === "raw" && sanitized === original.computed) {
      this.clearOverride(id, property);
      return;
    }
    const record: OverrideRecord = {
      appliedValue: sanitized,
      source: resolvedSource,
      ...(options?.token ? { token: options.token } : {}),
      ...(options?.intent ? { intent: options.intent } : {}),
      ...(options?.previewValue
        ? { previewValue: options.previewValue }
        : {}),
    };
    entry.overrides.set(property, record);
    const live = this.resolveLiveElement(entry);
    if (live) {
      try {
        live.style.setProperty(property, sanitized);
      } catch {
        // Element may have lost the ability to accept inline styles; keep
        // the override in state so it still ships with submission.
      }
    }
  }

  clearOverride(
    id: string,
    property: FeedbackVisualSuggestionProperty,
  ): void {
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    if (!entry.overrides.has(property)) {
      return;
    }
    entry.overrides.delete(property);
    const live = this.resolveLiveElement(entry);
    const original = entry.originals.get(property);
    if (live && original) {
      try {
        // Remove first so a previous `var(--token)` value can't linger when
        // we re-set the original literal — some style engines short-circuit
        // identity writes.
        live.style.removeProperty(property);
        if (original.previousInline !== null && original.previousInline !== "") {
          live.style.setProperty(property, original.previousInline);
        }
      } catch {
        // Ignore — element may have detached.
      }
    }
  }

  clearAll(): void {
    for (const entry of this.pins.values()) {
      this.restorePinStyles(entry);
      entry.marker.remove();
    }
    this.pins.clear();
    this.popoverPositions.clear();
    this.nextNumber = 1;
    this.closePopover();
    this.notifyCount();
  }

  getPins(): DraftPinSnapshot[] {
    return Array.from(this.pins.values()).map((entry) => this.snapshotPin(entry));
  }

  getPinCount(): number {
    return this.pins.size;
  }

  subscribeCount(listener: (count: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.pins.size);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Bring a pin's popover into focus from the parent (e.g. clicking on a pin chip). */
  focusPin(id: string): void {
    if (!this.pins.has(id)) {
      return;
    }
    this.openPopover(id);
  }

  private snapshotPin(entry: PinElement): DraftPinSnapshot {
    const overrides: FeedbackVisualSuggestion[] = [];
    for (const [property, record] of entry.overrides) {
      const original = entry.originals.get(property);
      if (!original) {
        continue;
      }
      const suggestion: FeedbackVisualSuggestion = {
        property,
        originalValue: original.computed,
        suggestedValue: record.appliedValue,
        source: record.source,
      };
      if (record.token) {
        suggestion.token = record.token;
      }
      if (record.intent) {
        suggestion.intent = record.intent;
      }
      if (record.previewValue) {
        suggestion.previewValue = record.previewValue;
      }
      overrides.push(suggestion);
    }
    return {
      id: entry.id,
      number: entry.number,
      comment: entry.comment,
      anchor: { ...entry.anchor, rect: { ...entry.anchor.rect } },
      overrides,
    };
  }

  private createMarker(meta: { id: string; number: number }): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "obv-pin";
    button.setAttribute("data-pin-id", meta.id);
    button.setAttribute("aria-label", `Open pin ${meta.number}`);
    button.style.pointerEvents = "auto";
    button.textContent = String(meta.number);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.openPopover(meta.id);
    });
    return button;
  }

  private renumber(): void {
    let nextNumber = 1;
    for (const entry of this.pins.values()) {
      entry.number = nextNumber;
      entry.marker.textContent = String(nextNumber);
      entry.marker.setAttribute("aria-label", `Open pin ${nextNumber}`);
      nextNumber += 1;
    }
    this.nextNumber = nextNumber;
    if (this.activePopoverId) {
      this.refreshPopoverHeader(this.activePopoverId);
    }
  }

  private scheduleRecompute(): void {
    if (this.rafHandle !== null) {
      return;
    }
    this.rafHandle = window.requestAnimationFrame(() => {
      this.rafHandle = null;
      this.recomputePositions();
    });
  }

  private recomputePositions(): void {
    if (this.destroyed) {
      return;
    }
    const viewport = readViewport();
    for (const entry of this.pins.values()) {
      const point = resolveAnchorPoint(entry.anchor, viewport);
      entry.marker.style.transform = `translate3d(${point.x - PIN_RADIUS_PX}px, ${point.y - PIN_RADIUS_PX}px, 0)`;
    }
    if (this.activePopoverId) {
      this.updateActiveElementOutline(this.activePopoverId);
      this.repositionPopover(this.activePopoverId);
    }
  }

  private openPopover(id: string): void {
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    this.closePopover();
    const popover = this.createPopover(entry);
    this.layer.appendChild(popover);
    this.activePopoverId = id;
    entry.marker.setAttribute("data-active", "true");
    this.updateActiveElementOutline(id);
    const initialPosition = this.repositionPopover(id);
    if (initialPosition) {
      this.bindPopoverDrag(popover, id, initialPosition);
    }
    const textarea = popover.querySelector("textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }

  private closePopover(): void {
    this.activePopoverDrag?.destroy();
    this.activePopoverDrag = null;
    if (this.activePopoverId) {
      this.pins.get(this.activePopoverId)?.marker.removeAttribute("data-active");
    }
    this.removeActiveElementOutline();
    const popover = this.layer.querySelector(".obv-pin-popover");
    popover?.remove();
    this.activePopoverId = null;
  }

  private ensureActiveElementOutline(): HTMLDivElement {
    if (this.activeElementOutline?.isConnected) {
      return this.activeElementOutline;
    }
    const outline = document.createElement("div");
    outline.className = "obv-pin-target-outline";
    outline.setAttribute("aria-hidden", "true");
    this.layer.appendChild(outline);
    this.activeElementOutline = outline;
    return outline;
  }

  private removeActiveElementOutline(): void {
    this.activeElementOutline?.remove();
    this.activeElementOutline = null;
  }

  private updateActiveElementOutline(id: string): void {
    const entry = this.pins.get(id);
    if (!entry) {
      this.removeActiveElementOutline();
      return;
    }
    const live = this.resolveLiveElement(entry);
    if (!live) {
      this.removeActiveElementOutline();
      return;
    }
    const rect = live.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      this.removeActiveElementOutline();
      return;
    }
    const outline = this.ensureActiveElementOutline();
    outline.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
  }

  private refreshPopoverHeader(id: string): void {
    const popover = this.layer.querySelector(".obv-pin-popover");
    if (!(popover instanceof HTMLElement)) {
      return;
    }
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    const header = popover.querySelector(".obv-pin-popover-title");
    if (header instanceof HTMLElement) {
      header.textContent = `Pin ${entry.number} of ${this.pins.size}`;
    }
  }

  private createPopover(pin: PinElement): HTMLDivElement {
    const wrapper = document.createElement("div");
    wrapper.className = "obv-pin-popover";
    wrapper.setAttribute("data-pin-id", pin.id);
    wrapper.style.pointerEvents = "auto";
    wrapper.innerHTML = `
      <div class="obv-pin-popover-header">
        <button type="button" class="obv-pin-popover-drag-handle" data-pin-drag-handle aria-label="Drag pin comment card" title="Drag card">
          ${createIcon("grip")}
          <span class="obv-pin-popover-drag-label">Drag</span>
        </button>
        <span class="obv-pin-popover-title">Pin ${pin.number} of ${this.pins.size}</span>
        <div class="obv-pin-popover-actions">
          <button type="button" class="obv-pin-icon-button" data-pin-action="delete" aria-label="Delete pin ${pin.number}" title="Delete pin">${createIcon("close")}</button>
        </div>
      </div>
      <textarea
        class="obv-pin-popover-textarea"
        placeholder="Describe what's wrong here…"
        rows="3"
        autocomplete="off"
        spellcheck="true"
      >${escapeHtml(pin.comment)}</textarea>
      ${this.renderTweakPanel(pin)}
      <div class="obv-pin-popover-footer">
        <span class="obv-pin-popover-hint">Esc to close · ⌘/Ctrl+Enter to finish</span>
        <button type="button" class="obv-pin-popover-done" data-pin-action="close">Done</button>
      </div>
    `;
    this.bindPopover(wrapper, pin);
    return wrapper;
  }

  private bindPopoverDrag(
    popover: HTMLDivElement,
    pinId: string,
    initialPosition: DraggablePosition,
  ): void {
    const handle = popover.querySelector("[data-pin-drag-handle]");
    if (!(handle instanceof HTMLElement)) {
      return;
    }
    this.activePopoverDrag?.destroy();
    this.activePopoverDrag = createDraggable({
      target: popover,
      handle,
      initialPosition,
      viewportMargin: VIEWPORT_MARGIN_PX,
      onDragStart: () => {
        popover.setAttribute("data-dragging", "true");
      },
      onDragMove: (position) => {
        this.popoverPositions.set(pinId, position);
      },
      onDragEnd: (position) => {
        popover.removeAttribute("data-dragging");
        this.popoverPositions.set(pinId, position);
      },
    });
  }

  private renderTweakPanel(pin: PinElement): string {
    if (pin.controlPlans.length === 0) {
      return "";
    }
    const rows = pin.controlPlans
      .map((plan) => this.renderTweakRow(pin, plan))
      .filter((row) => row.length > 0)
      .join("");
    if (!rows) {
      return "";
    }
    return `
      <div class="obv-pin-popover-tweaks" role="group" aria-label="Live tweaks">
        ${rows}
      </div>
    `;
  }

  private renderTweakRow(pin: PinElement, plan: TweakControlPlan): string {
    const property = plan.property;
    const original = pin.originals.get(property);
    if (!original) {
      return "";
    }
    // Tokens-only contract: when no design-system tokens cover this property
    // we hide the row. The user comments in prose instead of inventing
    // free-form values that don't map back to the design system.
    if (plan.tokenChips.length === 0) {
      return "";
    }
    const record = pin.overrides.get(property);
    const hasOverride = record !== undefined;
    const activeTokenName = getSelectedTokenName(plan, original.computed, record);
    const headerValue = renderHeaderValue(plan, original.computed, record);
    const resetAttr = hasOverride ? "" : "hidden";
    const tokenChips = plan.tokenChips
      .map((chip) => renderTokenChip(chip, activeTokenName))
      .join("");
    return `
      <div class="obv-pin-tweak-row" data-prop="${escapeHtml(property)}">
        <div class="obv-pin-tweak-row-header">
          <span class="obv-pin-tweak-label">${escapeHtml(plan.label)}</span>
          <span class="obv-pin-tweak-row-meta">${headerValue}</span>
          <button
            type="button"
            class="obv-pin-tweak-reset"
            data-tweak-action="reset"
            data-prop="${escapeHtml(property)}"
            aria-label="Reset ${escapeHtml(plan.label)}"
            title="Reset"
            ${resetAttr}
          >×</button>
        </div>
        <div class="obv-pin-tweak-chip-row" role="group" aria-label="${escapeHtml(plan.label)} tokens">${tokenChips}</div>
      </div>
    `;
  }

  private bindPopover(wrapper: HTMLDivElement, pin: PinElement): void {
    const textarea = wrapper.querySelector("textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.value = pin.comment;
      textarea.addEventListener("input", () => {
        this.updatePinComment(pin.id, textarea.value);
      });
      textarea.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.closePopover();
          return;
        }
        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          this.closePopover();
        }
      });
    }

    wrapper.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }
      const tweakAction = target.closest("[data-tweak-action]");
      if (tweakAction instanceof HTMLElement) {
        const action = tweakAction.getAttribute("data-tweak-action");
        const propertyAttr = tweakAction.getAttribute("data-prop");
        if (action === "reset" && propertyAttr) {
          event.preventDefault();
          if (isVisualSuggestionProperty(propertyAttr)) {
            this.handleReset(pin.id, propertyAttr, wrapper);
          }
          return;
        }
      }
      const tokenChip = target.closest(".obv-pin-tweak-token-chip");
      if (tokenChip instanceof HTMLElement) {
        const propertyAttr = tokenChip.getAttribute("data-prop");
        const tokenName = tokenChip.getAttribute("data-token-name");
        if (
          propertyAttr &&
          tokenName &&
          isVisualSuggestionProperty(propertyAttr)
        ) {
          event.preventDefault();
          this.handleTokenChipPick(pin.id, propertyAttr, tokenName, wrapper);
        }
        return;
      }
      const action = target.closest("[data-pin-action]")?.getAttribute("data-pin-action");
      if (action === "delete") {
        event.preventDefault();
        this.removePin(pin.id);
      } else if (action === "close") {
        event.preventDefault();
        this.closePopover();
      }
    });
  }

  private handleTokenChipPick(
    pinId: string,
    property: FeedbackVisualSuggestionProperty,
    tokenName: string,
    wrapper: HTMLDivElement,
  ): void {
    const entry = this.pins.get(pinId);
    if (!entry) {
      return;
    }
    const plan = entry.controlPlans.find((candidate) => candidate.property === property);
    const chip = plan?.tokenChips.find((candidate) => candidate.token.name === tokenName);
    if (!plan || !chip) {
      return;
    }
    const existing = entry.overrides.get(property);
    if (existing && existing.token?.name === tokenName) {
      this.clearOverride(pinId, property);
      this.refreshTweakRow(pinId, property, wrapper);
      return;
    }
    const original = entry.originals.get(property);
    if (!existing && original && tokenMatchesValue(chip, original.computed)) {
      return;
    }
    this.setOverride(pinId, property, chip.applyValue, {
      source: "token",
      token: toPublicToken(chip.token),
      previewValue: chip.token.applyValue ?? chip.applyValue,
    });
    this.refreshTweakRow(pinId, property, wrapper);
  }

  private handleReset(
    pinId: string,
    property: FeedbackVisualSuggestionProperty,
    wrapper: HTMLDivElement,
  ): void {
    this.clearOverride(pinId, property);
    this.refreshTweakRow(pinId, property, wrapper);
  }

  private refreshTweakRow(
    pinId: string,
    property: FeedbackVisualSuggestionProperty,
    wrapper: HTMLDivElement,
  ): void {
    const entry = this.pins.get(pinId);
    if (!entry) {
      return;
    }
    const plan = entry.controlPlans.find(
      (candidate) => candidate.property === property,
    );
    if (!plan) {
      return;
    }
    const row = wrapper.querySelector(
      `.obv-pin-tweak-row[data-prop="${cssEscape(property)}"]`,
    );
    if (!(row instanceof HTMLElement)) {
      return;
    }
    const original = entry.originals.get(property);
    if (!original) {
      return;
    }
    const record = entry.overrides.get(property);
    const meta = row.querySelector(".obv-pin-tweak-row-meta");
    if (meta instanceof HTMLElement) {
      meta.innerHTML = renderHeaderValue(plan, original.computed, record);
    }
    const tokenChips = Array.from(
      row.querySelectorAll(".obv-pin-tweak-token-chip"),
    );
    const activeTokenName = getSelectedTokenName(plan, original.computed, record);
    for (const chip of tokenChips) {
      if (!(chip instanceof HTMLElement)) {
        continue;
      }
      const tokenName = chip.getAttribute("data-token-name") ?? "";
      chip.setAttribute(
        "data-active",
        tokenName && tokenName === activeTokenName ? "true" : "false",
      );
      chip.setAttribute(
        "aria-pressed",
        tokenName && tokenName === activeTokenName ? "true" : "false",
      );
    }
    toggleResetVisibility(row, record !== undefined);
  }

  private resolveLiveElement(entry: PinElement): HTMLElement | null {
    if (entry.liveElement && entry.liveElement.isConnected) {
      return entry.liveElement;
    }
    if (entry.anchor.selector) {
      try {
        const found = document.querySelector(entry.anchor.selector);
        if (found instanceof HTMLElement) {
          entry.liveElement = found;
          return found;
        }
      } catch {
        // Selector may be invalid in some hosts; fall through.
      }
    }
    return null;
  }

  private restorePinStyles(entry: PinElement): void {
    if (entry.overrides.size === 0) {
      return;
    }
    const live = this.resolveLiveElement(entry);
    for (const property of entry.overrides.keys()) {
      const original = entry.originals.get(property);
      if (live && original) {
        try {
          live.style.removeProperty(property);
          if (original.previousInline !== null && original.previousInline !== "") {
            live.style.setProperty(property, original.previousInline);
          }
        } catch {
          // Ignore — element may have detached.
        }
      }
    }
    entry.overrides.clear();
  }

  private restoreAllPinStyles(): void {
    for (const entry of this.pins.values()) {
      this.restorePinStyles(entry);
    }
  }

  private repositionPopover(id: string): DraggablePosition | null {
    const popover = this.layer.querySelector(".obv-pin-popover");
    if (!(popover instanceof HTMLElement)) {
      return null;
    }
    const entry = this.pins.get(id);
    if (!entry) {
      return null;
    }
    const viewport = readViewport();
    const live = this.resolveLiveElement(entry);
    const elementRect = live ? live.getBoundingClientRect() : null;
    const popoverHeight = popover.offsetHeight || 380;
    const popoverWidth = POPOVER_WIDTH_PX;
    const storedPosition = this.popoverPositions.get(id);
    const placement: DraggablePosition = storedPosition
      ? clampPopoverPosition(
          storedPosition,
          popoverWidth,
          popoverHeight,
          viewport,
          VIEWPORT_MARGIN_PX,
        )
      : toDraggablePosition(
          placePopover({
            elementRect,
            fallbackPoint: resolveAnchorPoint(entry.anchor, viewport),
            popoverWidth,
            popoverHeight,
            viewport,
            gap: POPOVER_OFFSET_PX,
            margin: VIEWPORT_MARGIN_PX,
          }),
        );
    if (storedPosition) {
      this.popoverPositions.set(id, placement);
    }
    popover.style.transform = `translate3d(${placement.x}px, ${placement.y}px, 0)`;
    popover.style.width = `${popoverWidth}px`;
    this.activePopoverDrag?.setPosition(placement);
    return placement;
  }

  private notifyCount(): void {
    const count = this.pins.size;
    for (const listener of this.listeners) {
      try {
        listener(count);
      } catch (error) {
        console.warn("[ObviousFeedback] pin count listener threw", error);
      }
    }
  }

  private boundOnScroll = (): void => {
    this.scheduleRecompute();
  };

  private boundOnResize = (): void => {
    this.scheduleRecompute();
  };

  private boundOnDocumentClick = (event: MouseEvent): void => {
    if (!this.activePopoverId) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (this.host.contains(target)) {
      return;
    }
    this.closePopover();
  };

  private boundOnDocumentKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.activePopoverId) {
      this.closePopover();
    }
  };

  private installListeners(): void {
    window.addEventListener("scroll", this.boundOnScroll, { passive: true, capture: true });
    window.addEventListener("resize", this.boundOnResize);
    document.addEventListener("click", this.boundOnDocumentClick, true);
    document.addEventListener("keydown", this.boundOnDocumentKey);
  }

  private uninstallListeners(): void {
    window.removeEventListener("scroll", this.boundOnScroll, true);
    window.removeEventListener("resize", this.boundOnResize);
    document.removeEventListener("click", this.boundOnDocumentClick, true);
    document.removeEventListener("keydown", this.boundOnDocumentKey);
  }
}

function captureOriginals(
  element: HTMLElement,
  applicableProperties: readonly FeedbackVisualSuggestionProperty[],
): Map<FeedbackVisualSuggestionProperty, OriginalStyleEntry> {
  const map = new Map<FeedbackVisualSuggestionProperty, OriginalStyleEntry>();
  for (const property of applicableProperties) {
    const computed = getComputedSuggestionValue(element, property);
    const previousInline = element.style.getPropertyValue(property) || null;
    map.set(property, { computed, previousInline });
  }
  return map;
}

function isVisualSuggestionProperty(
  value: string,
): value is FeedbackVisualSuggestionProperty {
  return VISUAL_SUGGESTION_PROPERTIES.some((property) => property === value);
}

function renderTokenChip(chip: TweakTokenChip, activeTokenName: string): string {
  const isActive = chip.token.name === activeTokenName ? "true" : "false";
  const pressedAttr =
    isActive === "true" ? 'aria-pressed="true"' : 'aria-pressed="false"';
  if (chip.token.valueKind === "color") {
    const swatch = chip.token.resolvedValue || "transparent";
    return `
      <button
        type="button"
        class="obv-pin-tweak-token-chip obv-pin-tweak-token-chip--color"
        data-prop="${escapeHtml(chip.property)}"
        data-token-name="${escapeHtml(chip.token.name)}"
        data-active="${isActive}"
        ${pressedAttr}
        title="${escapeHtml(chip.token.shortName)} (${escapeHtml(chip.token.resolvedValue)})"
        aria-label="Use ${escapeHtml(chip.token.shortName)}"
      >
        <span class="obv-pin-tweak-token-chip-swatch" style="background:${escapeHtml(swatch)}"></span>
        <span class="obv-pin-tweak-token-chip-label">${escapeHtml(chip.label)}</span>
      </button>
    `;
  }
  return `
    <button
      type="button"
      class="obv-pin-tweak-token-chip obv-pin-tweak-token-chip--length"
      data-prop="${escapeHtml(chip.property)}"
      data-token-name="${escapeHtml(chip.token.name)}"
      data-active="${isActive}"
      ${pressedAttr}
      title="${escapeHtml(chip.token.shortName)} (${escapeHtml(chip.token.resolvedValue)})"
      aria-label="Use ${escapeHtml(chip.token.shortName)}"
    >
      <span class="obv-pin-tweak-token-chip-label">${escapeHtml(chip.label)}</span>
      <span class="obv-pin-tweak-token-chip-value">${escapeHtml(chip.token.resolvedValue)}</span>
    </button>
  `;
}

function getSelectedTokenName(
  plan: TweakControlPlan,
  originalComputed: string,
  record: OverrideRecord | undefined,
): string {
  if (record?.token?.name) {
    return record.token.name;
  }
  const matchingChip = plan.tokenChips.find((chip) =>
    tokenMatchesValue(chip, originalComputed),
  );
  return matchingChip?.token.name ?? "";
}

function tokenMatchesValue(chip: TweakTokenChip, value: string): boolean {
  return cssValuesMatch(chip.property, chip.token.resolvedValue, value);
}

function cssValuesMatch(
  property: FeedbackVisualSuggestionProperty,
  a: string,
  b: string,
): boolean {
  if (isColorProperty(property)) {
    return normalizeColorValue(a) === normalizeColorValue(b);
  }
  const aLength = normalizeLengthValue(a);
  const bLength = normalizeLengthValue(b);
  if (aLength !== null && bLength !== null) {
    return Math.abs(aLength - bLength) < 0.01;
  }
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function normalizeColorValue(value: string): string {
  return cssColorToHex(value).toLowerCase();
}

function normalizeLengthValue(value: string): number | null {
  const first = value.trim().split(/\s+/)[0] ?? "";
  const parsed = parseNumericValue(first);
  if (parsed === null) {
    return null;
  }
  if (parsed.unit === "px" || parsed.unit === "") {
    return parsed.value;
  }
  if (parsed.unit === "rem" || parsed.unit === "em") {
    return parsed.value * getRootFontSizePx();
  }
  return null;
}

function getRootFontSizePx(): number {
  try {
    const parsed = parseNumericValue(
      window.getComputedStyle(document.documentElement).fontSize,
    );
    if (parsed?.unit === "px") {
      return parsed.value;
    }
  } catch {
    return 16;
  }
  return 16;
}

function renderHeaderValue(
  plan: TweakControlPlan,
  originalComputed: string,
  record: OverrideRecord | undefined,
): string {
  if (!record) {
    return escapeHtml(formatHeaderValue(plan, originalComputed));
  }
  if (record.source === "token" && record.token) {
    return `<span class="obv-pin-tweak-row-token">${escapeHtml(record.token.shortName)}</span>`;
  }
  if (record.source === "intent" && record.intent) {
    return `<span class="obv-pin-tweak-row-intent">${escapeHtml(record.intent.replace(/-/g, " "))}</span>`;
  }
  return escapeHtml(formatHeaderValue(plan, record.appliedValue));
}

/**
 * Header value formatter — keeps the row header scannable regardless of
 * what the browser returned for the computed style.
 *
 * Handles three pathological cases that surfaced from real `getComputedStyle`
 * output:
 *   - Padding shorthand (`6px 12px 6px 12px`) — we display the first edge.
 *     Rendering the full shorthand felt noisy and most reporters scan the
 *     top number.
 *   - Implausibly large numbers (e.g. `1.67772e+07px` for unset border-radius
 *     in some browsers) — we collapse to `—` so the header doesn't flicker
 *     to nonsense.
 *   - Transparent / `none` / 0-alpha rgba — we collapse to `—` rather than
 *     showing `#000000`, which would imply an actual color.
 */
function formatHeaderValue(plan: TweakControlPlan, value: string): string {
  return formatHeaderRaw(plan.property, value);
}

function formatHeaderRaw(
  property: FeedbackVisualSuggestionProperty,
  value: string,
): string {
  if (!value) {
    return "—";
  }
  const trimmed = value.trim();
  if (isColorProperty(property)) {
    if (!trimmed || /^(transparent|none|inherit|initial|unset|currentcolor)$/i.test(trimmed)) {
      return "—";
    }
    if (/^rgba?\([^)]*?,\s*0(?:\.0+)?\s*\)$/i.test(trimmed)) {
      return "—";
    }
    const hex = cssColorToHex(trimmed);
    if (hex === "#000000" && !trimmed.startsWith("#") && !/^rgb/i.test(trimmed)) {
      return "—";
    }
    return hex.toUpperCase();
  }
  const first = trimmed.split(/\s+/)[0] ?? "";
  if (!first) {
    return "—";
  }
  const parsed = parseNumericValue(first);
  if (parsed === null) {
    return first;
  }
  if (!Number.isFinite(parsed.value) || Math.abs(parsed.value) > 10000) {
    return "—";
  }
  const num = Number.isInteger(parsed.value)
    ? parsed.value.toString()
    : parsed.value.toFixed(2).replace(/\.?0+$/, "");
  return `${num}${parsed.unit}`;
}

function toPublicToken(token: DesignToken): FeedbackVisualSuggestionToken {
  return {
    shortName: token.shortName,
    name: token.name,
    resolvedValue: token.resolvedValue,
    category: token.category,
    semanticScore: token.semanticScore,
    source: token.source ?? "runtime",
  };
}

function toggleResetVisibility(row: HTMLElement, hasOverride: boolean): void {
  const reset = row.querySelector(".obv-pin-tweak-reset");
  if (reset instanceof HTMLElement) {
    if (hasOverride) {
      reset.removeAttribute("hidden");
    } else {
      reset.setAttribute("hidden", "");
    }
  }
}

/**
 * Minimal CSS selector escape — the property tokens we use are all alpha +
 * hyphens so this is mostly defensive against future additions.
 */
function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "");
}

function readViewport(): PinViewport {
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
  };
}

export interface PopoverPlacementRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface PopoverPlacementInput {
  /** Live bounding rect of the picked element, or null when the selector lost its target. */
  elementRect: PopoverPlacementRect | null;
  /** Anchor point fallback when no live rect is available. */
  fallbackPoint: { x: number; y: number };
  popoverWidth: number;
  popoverHeight: number;
  viewport: PinViewport;
  /** Gap between popover and the picked element. */
  gap: number;
  /** Minimum gap between popover and viewport edges. */
  margin: number;
}

/**
 * Position the tweak popover so it never sits on top of the picked element.
 * The user is editing live styles — they need to *see* the element react.
 *
 * Resolution order:
 *   1. Right of the element (preferred — natural reading order, body still visible).
 *   2. Left of the element.
 *   3. Below the element.
 *   4. Above the element.
 *   5. If none of those fit (huge or full-bleed element), pin to the viewport
 *      corner farthest from the element's center; the user gets the most
 *      uncovered visible area possible.
 *
 * When no live rect is available, fall back to the captured anchor point and
 * clamp into the viewport — the same behaviour the SDK had before.
 */
export function placePopover(input: PopoverPlacementInput): {
  left: number;
  top: number;
} {
  const {
    elementRect,
    fallbackPoint,
    popoverWidth,
    popoverHeight,
    viewport,
    gap,
    margin,
  } = input;
  const minLeft = margin;
  const maxLeft = Math.max(margin, viewport.innerWidth - popoverWidth - margin);
  const minTop = margin;
  const maxTop = Math.max(
    margin,
    viewport.innerHeight - popoverHeight - margin,
  );

  if (elementRect) {
    const fitsRight =
      elementRect.right + gap + popoverWidth + margin <= viewport.innerWidth;
    if (fitsRight) {
      return {
        left: elementRect.right + gap,
        top: clampNumber(elementRect.top, minTop, maxTop),
      };
    }
    const fitsLeft = elementRect.left - gap - popoverWidth >= margin;
    if (fitsLeft) {
      return {
        left: elementRect.left - gap - popoverWidth,
        top: clampNumber(elementRect.top, minTop, maxTop),
      };
    }
    const fitsBelow =
      elementRect.bottom + gap + popoverHeight + margin <=
      viewport.innerHeight;
    if (fitsBelow) {
      return {
        left: clampNumber(elementRect.left, minLeft, maxLeft),
        top: elementRect.bottom + gap,
      };
    }
    const fitsAbove = elementRect.top - gap - popoverHeight >= margin;
    if (fitsAbove) {
      return {
        left: clampNumber(elementRect.left, minLeft, maxLeft),
        top: elementRect.top - gap - popoverHeight,
      };
    }
    // Element fills the available space: drop the popover into the corner
    // furthest from the element's centre so as much of the page stays
    // visible as possible.
    return cornerPlacement(
      elementRect,
      viewport,
      popoverWidth,
      popoverHeight,
      margin,
    );
  }

  return {
    left: clampNumber(fallbackPoint.x + gap, minLeft, maxLeft),
    top: clampNumber(fallbackPoint.y + gap, minTop, maxTop),
  };
}

function cornerPlacement(
  elementRect: PopoverPlacementRect,
  viewport: PinViewport,
  popoverWidth: number,
  popoverHeight: number,
  margin: number,
): { left: number; top: number } {
  const elementCenterX = (elementRect.left + elementRect.right) / 2;
  const elementCenterY = (elementRect.top + elementRect.bottom) / 2;
  const onLeftHalf = elementCenterX < viewport.innerWidth / 2;
  const onTopHalf = elementCenterY < viewport.innerHeight / 2;
  const leftCorner = Math.max(
    margin,
    viewport.innerWidth - popoverWidth - margin,
  );
  const topCorner = Math.max(
    margin,
    viewport.innerHeight - popoverHeight - margin,
  );
  return {
    left: onLeftHalf ? leftCorner : margin,
    top: onTopHalf ? topCorner : margin,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

function clampPopoverPosition(
  position: DraggablePosition,
  popoverWidth: number,
  popoverHeight: number,
  viewport: PinViewport,
  margin: number,
): DraggablePosition {
  return {
    x: clampNumber(
      position.x,
      margin,
      Math.max(margin, viewport.innerWidth - popoverWidth - margin),
    ),
    y: clampNumber(
      position.y,
      margin,
      Math.max(margin, viewport.innerHeight - popoverHeight - margin),
    ),
  };
}

function toDraggablePosition(position: { left: number; top: number }): DraggablePosition {
  return { x: position.left, y: position.top };
}

function resolveAnchorPoint(
  anchor: PinAnchor,
  viewport: PinViewport,
): { x: number; y: number } {
  // Prefer a live element lookup so the pin tracks layout changes (DOM
  // re-renders, animation, etc.). Fall back to the captured page coordinates
  // when the selector no longer matches.
  if (anchor.selector) {
    try {
      const element = document.querySelector(anchor.selector);
      if (element instanceof Element) {
        const rect = element.getBoundingClientRect();
        return {
          x: rect.left + Math.min(rect.width, 32) / 2,
          y: rect.top + Math.min(rect.height, 32) / 2,
        };
      }
    } catch {
      // Invalid selector falls through to captured coordinates.
    }
  }
  return {
    x: anchor.pageX - viewport.scrollX,
    y: anchor.pageY - viewport.scrollY,
  };
}

function createResizeObserver(callback: () => void): ResizeObserver | null {
  if (typeof ResizeObserver === "undefined") {
    return null;
  }
  return new ResizeObserver(() => callback());
}

function createPinStyles(): string {
  return `
    :host {
      all: initial;
    }
    .obv-pin-layer {
      position: fixed;
      inset: 0;
      font-family: -apple-system, "system-ui", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #111827;
    }
    .obv-pin-layer[data-theme="dark"] {
      color: #f9fafb;
    }
    .obv-pin {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 2;
      width: ${PIN_RADIUS_PX * 2}px;
      height: ${PIN_RADIUS_PX * 2}px;
      border-radius: 999px;
      background: #facc15;
      border: 1px solid rgba(0, 0, 0, 0.22);
      color: #1f2937;
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      will-change: transform;
      transition: transform 60ms ease-out, box-shadow 120ms ease;
      padding: 0;
      font-family: inherit;
    }
    .obv-pin:hover {
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.28);
    }
    .obv-pin[data-active="true"] {
      opacity: 0;
      pointer-events: none;
    }
    .obv-pin:focus-visible {
      outline: 2px solid #facc15;
      outline-offset: 2px;
    }
    .obv-pin-target-outline {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1;
      box-sizing: border-box;
      border: 2px solid #facc15;
      border-radius: 10px;
      background: rgba(250, 204, 21, 0.1);
      box-shadow: 0 0 0 3px rgba(250, 204, 21, 0.22), 0 8px 24px rgba(250, 204, 21, 0.16);
      pointer-events: none;
      will-change: transform, width, height;
    }
    .obv-pin-popover {
      position: absolute;
      top: 0;
      left: 0;
      z-index: 3;
      width: ${POPOVER_WIDTH_PX}px;
      background: #ffffff;
      color: #111827;
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18), 0 0 0 1px rgba(15, 23, 42, 0.08);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      will-change: transform;
    }
    .obv-pin-popover[data-dragging="true"] {
      user-select: none;
      cursor: grabbing;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover {
      background: #18181b;
      color: #f4f4f5;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    .obv-pin-popover-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .obv-pin-popover-drag-handle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 24px;
      padding: 0 8px;
      border: 1px solid rgba(15, 23, 42, 0.1);
      background: rgba(15, 23, 42, 0.04);
      color: rgba(15, 23, 42, 0.58);
      cursor: grab;
      touch-action: none;
      user-select: none;
      border-radius: 999px;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
    }
    .obv-pin-popover-drag-handle:active {
      cursor: grabbing;
    }
    .obv-pin-popover-drag-handle:hover {
      background: rgba(15, 23, 42, 0.07);
      color: rgba(15, 23, 42, 0.78);
    }
    .obv-pin-popover-drag-handle:focus-visible {
      outline: 2px solid #facc15;
      outline-offset: 2px;
    }
    .obv-pin-popover-drag-handle .obv-icon {
      width: 14px;
      height: 14px;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover-drag-handle {
      border-color: rgba(255, 255, 255, 0.1);
      background: rgba(255, 255, 255, 0.06);
      color: rgba(244, 244, 245, 0.68);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover-drag-handle:hover {
      background: rgba(255, 255, 255, 0.1);
      color: rgba(244, 244, 245, 0.88);
    }
    .obv-pin-popover-title {
      flex: 1 1 auto;
      min-width: 0;
      font-size: 12px;
      font-weight: 600;
      color: rgba(15, 23, 42, 0.7);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover-title {
      color: rgba(244, 244, 245, 0.65);
    }
    .obv-pin-popover-actions {
      display: flex;
      gap: 4px;
    }
    .obv-pin-icon-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: rgba(15, 23, 42, 0.52);
      cursor: pointer;
      transition: background-color 120ms ease, color 120ms ease;
    }
    .obv-pin-icon-button:hover {
      background: rgba(239, 68, 68, 0.1);
      color: #dc2626;
    }
    .obv-pin-icon-button:focus-visible {
      outline: 2px solid #facc15;
      outline-offset: 2px;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-icon-button {
      color: rgba(244, 244, 245, 0.58);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-icon-button:hover {
      background: rgba(248, 113, 113, 0.14);
      color: #f87171;
    }
    .obv-pin-icon-button .obv-icon {
      width: 17px;
      height: 17px;
    }
    .obv-pin-layer .obv-icon {
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }
    .obv-pin-popover-textarea {
      width: 100%;
      min-height: 72px;
      resize: none;
      border: 1px solid rgba(15, 23, 42, 0.16);
      border-radius: 8px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.4;
      color: inherit;
      background: transparent;
      box-sizing: border-box;
    }
    .obv-pin-popover-textarea:focus-visible,
    .obv-pin-popover-textarea:focus {
      outline: 2px solid #facc15;
      outline-offset: -1px;
      border-color: transparent;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover-textarea {
      border-color: rgba(255, 255, 255, 0.18);
    }
    .obv-pin-popover-tweaks {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-top: 8px;
      margin-top: 2px;
      border-top: 1px solid rgba(15, 23, 42, 0.08);
      max-height: min(420px, 60vh);
      overflow-y: auto;
      overflow-x: hidden;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover-tweaks {
      border-top-color: rgba(255, 255, 255, 0.08);
    }
    .obv-pin-tweak-heading {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgba(15, 23, 42, 0.45);
      margin-bottom: 2px;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-heading {
      color: rgba(244, 244, 245, 0.45);
    }
    .obv-pin-tweak-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 12px;
      padding: 4px 0;
    }
    .obv-pin-tweak-row + .obv-pin-tweak-row {
      border-top: 1px dashed rgba(15, 23, 42, 0.06);
      padding-top: 8px;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-row + .obv-pin-tweak-row {
      border-top-color: rgba(255, 255, 255, 0.06);
    }
    .obv-pin-tweak-row-header {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .obv-pin-tweak-label {
      flex: 0 0 auto;
      font-weight: 600;
      color: rgba(15, 23, 42, 0.85);
      font-size: 11px;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-label {
      color: rgba(244, 244, 245, 0.85);
    }
    .obv-pin-tweak-row-meta {
      flex: 1 1 auto;
      font-size: 11px;
      color: rgba(15, 23, 42, 0.55);
      font-variant-numeric: tabular-nums;
      text-align: right;
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-row-meta {
      color: rgba(244, 244, 245, 0.6);
    }
    .obv-pin-tweak-row-token,
    .obv-pin-tweak-row-intent {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10.5px;
      color: rgba(15, 23, 42, 0.85);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-row-token,
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-row-intent {
      color: rgba(244, 244, 245, 0.85);
    }
    .obv-pin-tweak-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }
    .obv-pin-tweak-token-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      border: 1px solid rgba(15, 23, 42, 0.12);
      border-radius: 999px;
      background: transparent;
      color: inherit;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
      max-width: 100%;
      min-width: 0;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-token-chip {
      border-color: rgba(255, 255, 255, 0.16);
    }
    .obv-pin-tweak-token-chip:hover {
      border-color: rgba(15, 23, 42, 0.3);
      background: rgba(15, 23, 42, 0.04);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-token-chip:hover {
      border-color: rgba(255, 255, 255, 0.32);
      background: rgba(255, 255, 255, 0.04);
    }
    .obv-pin-tweak-token-chip[data-active="true"] {
      border-color: #facc15;
      background: rgba(250, 204, 21, 0.18);
      color: #92400e;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-token-chip[data-active="true"] {
      color: #fde68a;
      background: rgba(250, 204, 21, 0.18);
    }
    .obv-pin-tweak-token-chip:focus-visible {
      outline: 2px solid #facc15;
      outline-offset: 1px;
    }
    .obv-pin-tweak-token-chip-swatch {
      display: inline-block;
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 1px solid rgba(15, 23, 42, 0.16);
      flex: 0 0 12px;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-token-chip-swatch {
      border-color: rgba(255, 255, 255, 0.18);
    }
    .obv-pin-tweak-token-chip-label {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 10.5px;
      letter-spacing: -0.01em;
      max-width: 140px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .obv-pin-tweak-token-chip-value {
      font-size: 10px;
      color: rgba(15, 23, 42, 0.5);
      font-variant-numeric: tabular-nums;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-token-chip-value {
      color: rgba(244, 244, 245, 0.55);
    }
    .obv-pin-tweak-token-chip[data-active="true"] .obv-pin-tweak-token-chip-value {
      color: inherit;
    }
    .obv-pin-tweak-reset {
      flex: 0 0 18px;
      width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: rgba(15, 23, 42, 0.45);
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      border-radius: 4px;
      transition: color 120ms ease, background-color 120ms ease;
    }
    .obv-pin-tweak-reset:hover {
      color: #a16207;
      background: rgba(15, 23, 42, 0.05);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-reset {
      color: rgba(244, 244, 245, 0.45);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-reset:hover {
      color: #fde047;
      background: rgba(255, 255, 255, 0.06);
    }
    .obv-pin-tweak-reset[hidden] {
      display: none;
    }
    .obv-pin-popover-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .obv-pin-popover-hint {
      font-size: 11px;
      color: rgba(15, 23, 42, 0.5);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover-hint {
      color: rgba(244, 244, 245, 0.55);
    }
    .obv-pin-popover-done {
      border: none;
      background: #facc15;
      color: #111827;
      font-size: 12px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    .obv-pin-popover-done:hover {
      background: #fde047;
    }
    .obv-pin-popover-done:focus-visible {
      outline: 2px solid #facc15;
      outline-offset: 2px;
    }
  `;
}

export function buildPinAnchor(element: Element, selector: string): PinAnchor {
  const rect = element.getBoundingClientRect();
  return {
    selector,
    rect: {
      left: Math.round(rect.left),
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    pageX: Math.round(rect.left + rect.width / 2 + window.scrollX),
    pageY: Math.round(rect.top + Math.min(rect.height, 32) / 2 + window.scrollY),
  };
}

export const PIN_OVERLAY_STORAGE_KEY = STORAGE_KEY;
