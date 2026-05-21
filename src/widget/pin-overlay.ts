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
  FeedbackSdkTheme,
  FeedbackVisualSuggestion,
  FeedbackVisualSuggestionProperty,
} from "../public-types";
import { escapeHtml } from "../utils/html";
import { createIcon } from "./icons";
import {
  cssColorToHex,
  getApplicableProperties,
  getComputedSuggestionValue,
  getSliderConfig,
  isColorProperty,
  parseNumericValue,
  sanitizeSuggestionValue,
  VISUAL_SUGGESTION_PROPERTIES,
  VISUAL_SUGGESTION_PROPERTY_LABELS,
} from "./visual-suggestions";

const PIN_LAYER_Z_INDEX = 2147483646;
const PIN_RADIUS_PX = 14;
const POPOVER_WIDTH_PX = 320;
const POPOVER_OFFSET_PX = 12;
const VIEWPORT_MARGIN_PX = 12;
const STORAGE_KEY = "obvious.feedback.draftPins";

/**
 * Curated palette covering the most common feedback intents
 * ("make it red", "make it green", brand yellow, etc). Tuned so each row
 * fits in the popover without scrolling. The native browser color picker
 * stays accessible behind the trailing custom trigger for arbitrary hex.
 */
const COLOR_SWATCHES: ReadonlyArray<{ name: string; value: string }> = [
  { name: "White", value: "#ffffff" },
  { name: "Slate", value: "#1e293b" },
  { name: "Red", value: "#ef4444" },
  { name: "Orange", value: "#f97316" },
  { name: "Yellow", value: "#facc15" },
  { name: "Green", value: "#22c55e" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Purple", value: "#a855f7" },
];

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
  /** Per-origin storage key suffix; pins persist while the host page is open. */
  storageNamespace?: string;
}

interface PinViewport {
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
  /** Properties relevant for this element (filtered by tag/role/style). */
  applicableProperties: FeedbackVisualSuggestionProperty[];
  /** Original computed value + previous inline value at pick time. */
  originals: Map<FeedbackVisualSuggestionProperty, OriginalStyleEntry>;
  /** Currently-applied override values by property. */
  overrides: Map<FeedbackVisualSuggestionProperty, string>;
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
  private rafHandle: number | null = null;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly listeners = new Set<(count: number) => void>();

  constructor(options: PinOverlayOptions) {
    this.theme = options.theme;
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
    const applicableProperties = liveElement
      ? getApplicableProperties(liveElement)
      : [];
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

  removePin(id: string): void {
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    this.restorePinStyles(entry);
    entry.marker.remove();
    this.pins.delete(id);
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
    if (sanitized === original.computed) {
      this.clearOverride(id, property);
      return;
    }
    entry.overrides.set(property, sanitized);
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
        if (original.previousInline !== null) {
          live.style.setProperty(property, original.previousInline);
        } else {
          live.style.removeProperty(property);
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
    for (const [property, value] of entry.overrides) {
      const original = entry.originals.get(property);
      if (!original) {
        continue;
      }
      overrides.push({
        property,
        originalValue: original.computed,
        suggestedValue: value,
      });
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
    this.repositionPopover(id);
    const textarea = popover.querySelector("textarea");
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }

  private closePopover(): void {
    const popover = this.layer.querySelector(".obv-pin-popover");
    popover?.remove();
    this.activePopoverId = null;
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
        <span class="obv-pin-popover-title">Pin ${pin.number} of ${this.pins.size}</span>
        <div class="obv-pin-popover-actions">
          <button type="button" class="obv-pin-icon-button" data-pin-action="delete" aria-label="Delete pin ${pin.number}">${createIcon("close")}</button>
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
        <span class="obv-pin-popover-hint">Press Esc to close</span>
        <button type="button" class="obv-pin-popover-done" data-pin-action="close">Done</button>
      </div>
    `;
    this.bindPopover(wrapper, pin);
    return wrapper;
  }

  private renderTweakPanel(pin: PinElement): string {
    if (pin.applicableProperties.length === 0) {
      return "";
    }
    const rows = pin.applicableProperties
      .map((property) => this.renderTweakRow(pin, property))
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

  private renderTweakRow(
    pin: PinElement,
    property: FeedbackVisualSuggestionProperty,
  ): string {
    const label = VISUAL_SUGGESTION_PROPERTY_LABELS[property];
    const original = pin.originals.get(property);
    if (!original) {
      return "";
    }
    const currentValue = pin.overrides.get(property) ?? original.computed;
    const hasOverride = pin.overrides.has(property);
    const resetAttr = hasOverride ? "" : "hidden";

    if (isColorProperty(property)) {
      const hex = cssColorToHex(currentValue);
      const isCustom = !COLOR_SWATCHES.some(
        (entry) => entry.value.toLowerCase() === hex.toLowerCase(),
      );
      const swatchButtons = COLOR_SWATCHES.map((entry) => {
        const isActive =
          entry.value.toLowerCase() === hex.toLowerCase() ? "true" : "false";
        return `
          <button
            type="button"
            class="obv-pin-tweak-swatch"
            data-prop="${escapeHtml(property)}"
            data-color="${escapeHtml(entry.value)}"
            data-active="${isActive}"
            style="background:${escapeHtml(entry.value)}"
            aria-label="${escapeHtml(entry.name)}"
            title="${escapeHtml(entry.name)} ${escapeHtml(entry.value)}"
          ></button>
        `;
      }).join("");
      return `
        <div class="obv-pin-tweak-row obv-pin-tweak-row--color" data-prop="${escapeHtml(property)}">
          <label class="obv-pin-tweak-label">${escapeHtml(label)}</label>
          <div class="obv-pin-tweak-swatches" role="radiogroup" aria-label="${escapeHtml(label)} color">
            ${swatchButtons}
            <button
              type="button"
              class="obv-pin-tweak-swatch obv-pin-tweak-swatch--custom"
              data-prop="${escapeHtml(property)}"
              data-tweak-action="custom-color"
              data-active="${isCustom ? "true" : "false"}"
              aria-label="Custom color"
              title="Custom color (${escapeHtml(hex)})"
            ></button>
            <input
              type="color"
              class="obv-pin-tweak-color-input"
              data-prop="${escapeHtml(property)}"
              value="${escapeHtml(hex)}"
              tabindex="-1"
              aria-hidden="true"
            />
          </div>
          <button
            type="button"
            class="obv-pin-tweak-reset"
            data-tweak-action="reset"
            data-prop="${escapeHtml(property)}"
            aria-label="Reset ${escapeHtml(label)}"
            title="Reset"
            ${resetAttr}
          >×</button>
        </div>
      `;
    }

    const slider = getSliderConfig(property);
    if (!slider) {
      return "";
    }
    const parsed = parseNumericValue(currentValue);
    const numeric = parsed !== null ? parsed.value : slider.min;
    const clamped = Math.min(Math.max(numeric, slider.min), slider.max);
    const display = formatSliderValue(clamped, slider.unit);
    return `
      <div class="obv-pin-tweak-row obv-pin-tweak-row--slider" data-prop="${escapeHtml(property)}">
        <label class="obv-pin-tweak-label">${escapeHtml(label)}</label>
        <input
          type="range"
          class="obv-pin-tweak-slider"
          data-prop="${escapeHtml(property)}"
          min="${slider.min}"
          max="${slider.max}"
          step="${slider.step}"
          value="${clamped}"
          aria-label="${escapeHtml(label)}"
        />
        <output class="obv-pin-tweak-value">${escapeHtml(display)}</output>
        <button
          type="button"
          class="obv-pin-tweak-reset"
          data-tweak-action="reset"
          data-prop="${escapeHtml(property)}"
          aria-label="Reset ${escapeHtml(label)}"
          title="Reset"
          ${resetAttr}
        >×</button>
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
        if (action === "custom-color" && propertyAttr) {
          event.preventDefault();
          if (isVisualSuggestionProperty(propertyAttr)) {
            this.openNativeColorPicker(propertyAttr, wrapper);
          }
          return;
        }
      }
      const swatch = target.closest(".obv-pin-tweak-swatch");
      if (
        swatch instanceof HTMLElement &&
        !swatch.classList.contains("obv-pin-tweak-swatch--custom")
      ) {
        const propertyAttr = swatch.getAttribute("data-prop");
        const colorAttr = swatch.getAttribute("data-color");
        if (
          propertyAttr &&
          colorAttr &&
          isVisualSuggestionProperty(propertyAttr)
        ) {
          event.preventDefault();
          this.handleSwatchPick(pin.id, propertyAttr, colorAttr, wrapper);
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

    const sliders = Array.from(wrapper.querySelectorAll(".obv-pin-tweak-slider"));
    for (const node of sliders) {
      if (!(node instanceof HTMLInputElement)) {
        continue;
      }
      node.addEventListener("input", (event) => {
        const propertyAttr = node.getAttribute("data-prop");
        if (!propertyAttr || !isVisualSuggestionProperty(propertyAttr)) {
          return;
        }
        const slider = getSliderConfig(propertyAttr);
        if (!slider) {
          return;
        }
        const numeric = Number.parseFloat(node.value);
        if (!Number.isFinite(numeric)) {
          return;
        }
        const value = formatSliderValue(numeric, slider.unit);
        this.setOverride(pin.id, propertyAttr, value);
        const row = node.closest(".obv-pin-tweak-row");
        updateRowAfterChange(row, value, true);
        event.stopPropagation();
      });
    }

    const colorInputs = Array.from(wrapper.querySelectorAll(".obv-pin-tweak-color-input"));
    for (const node of colorInputs) {
      if (!(node instanceof HTMLInputElement)) {
        continue;
      }
      const handler = (): void => {
        const propertyAttr = node.getAttribute("data-prop");
        if (!propertyAttr || !isVisualSuggestionProperty(propertyAttr)) {
          return;
        }
        const value = node.value;
        if (!value) {
          return;
        }
        this.setOverride(pin.id, propertyAttr, value);
        const row = node.closest(".obv-pin-tweak-row");
        updateColorRowState(row, value, true);
      };
      node.addEventListener("input", handler);
      node.addEventListener("change", handler);
    }
  }

  /** Apply a color from a curated swatch and refresh active-state styling. */
  private handleSwatchPick(
    pinId: string,
    property: FeedbackVisualSuggestionProperty,
    color: string,
    wrapper: HTMLDivElement,
  ): void {
    this.setOverride(pinId, property, color);
    const row = wrapper.querySelector(
      `.obv-pin-tweak-row--color[data-prop="${cssEscape(property)}"]`,
    );
    const entry = this.pins.get(pinId);
    const stillHasOverride = entry?.overrides.has(property) ?? false;
    updateColorRowState(row, color, stillHasOverride);
    const input = row?.querySelector(".obv-pin-tweak-color-input");
    if (input instanceof HTMLInputElement) {
      input.value = cssColorToHex(color);
    }
  }

  /** Programmatically open the native picker for free-form hex selection. */
  private openNativeColorPicker(
    property: FeedbackVisualSuggestionProperty,
    wrapper: HTMLDivElement,
  ): void {
    const row = wrapper.querySelector(
      `.obv-pin-tweak-row--color[data-prop="${cssEscape(property)}"]`,
    );
    const input = row?.querySelector(".obv-pin-tweak-color-input");
    if (input instanceof HTMLInputElement) {
      input.click();
    }
  }

  private handleReset(
    pinId: string,
    property: FeedbackVisualSuggestionProperty,
    wrapper: HTMLDivElement,
  ): void {
    this.clearOverride(pinId, property);
    const entry = this.pins.get(pinId);
    if (!entry) {
      return;
    }
    const original = entry.originals.get(property);
    if (!original) {
      return;
    }
    const row = wrapper.querySelector(
      `.obv-pin-tweak-row[data-prop="${cssEscape(property)}"]`,
    );
    if (!row) {
      return;
    }
    if (isColorProperty(property)) {
      const hex = cssColorToHex(original.computed);
      const input = row.querySelector(".obv-pin-tweak-color-input");
      if (input instanceof HTMLInputElement) {
        input.value = hex;
      }
      updateColorRowState(row, hex, false);
      return;
    }
    const slider = row.querySelector(".obv-pin-tweak-slider");
    if (slider instanceof HTMLInputElement) {
      const config = getSliderConfig(property);
      const parsed = parseNumericValue(original.computed);
      const numeric =
        parsed !== null && config !== null
          ? Math.min(Math.max(parsed.value, config.min), config.max)
          : config?.min ?? 0;
      slider.value = String(numeric);
      const display =
        config !== null ? formatSliderValue(numeric, config.unit) : original.computed;
      updateRowAfterChange(row, display, false);
    }
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
          if (original.previousInline !== null) {
            live.style.setProperty(property, original.previousInline);
          } else {
            live.style.removeProperty(property);
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

  private repositionPopover(id: string): void {
    const popover = this.layer.querySelector(".obv-pin-popover");
    if (!(popover instanceof HTMLElement)) {
      return;
    }
    const entry = this.pins.get(id);
    if (!entry) {
      return;
    }
    const viewport = readViewport();
    const anchorPoint = resolveAnchorPoint(entry.anchor, viewport);
    const popoverHeight = popover.offsetHeight || 200;
    const popoverWidth = POPOVER_WIDTH_PX;
    let left = anchorPoint.x + POPOVER_OFFSET_PX;
    let top = anchorPoint.y + POPOVER_OFFSET_PX;
    if (left + popoverWidth + VIEWPORT_MARGIN_PX > viewport.innerWidth) {
      left = anchorPoint.x - popoverWidth - POPOVER_OFFSET_PX;
    }
    if (left < VIEWPORT_MARGIN_PX) {
      left = VIEWPORT_MARGIN_PX;
    }
    if (top + popoverHeight + VIEWPORT_MARGIN_PX > viewport.innerHeight) {
      top = anchorPoint.y - popoverHeight - POPOVER_OFFSET_PX;
    }
    if (top < VIEWPORT_MARGIN_PX) {
      top = VIEWPORT_MARGIN_PX;
    }
    popover.style.transform = `translate3d(${left}px, ${top}px, 0)`;
    popover.style.width = `${popoverWidth}px`;
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

function formatSliderValue(value: number, unit: "px"): string {
  const rounded = Number.isInteger(value)
    ? value.toString()
    : value.toFixed(2).replace(/\.?0+$/, "");
  return `${rounded}${unit}`;
}

function updateRowAfterChange(
  row: Element | null,
  display: string,
  hasOverride: boolean,
): void {
  if (!(row instanceof HTMLElement)) {
    return;
  }
  const output = row.querySelector(".obv-pin-tweak-value");
  if (output instanceof HTMLElement) {
    output.textContent = display;
  }
  toggleResetVisibility(row, hasOverride);
}

/**
 * Refresh active swatch + custom-trigger highlight + reset visibility for a
 * color row whenever the underlying value changes (swatch click, native
 * picker, or programmatic reset).
 */
function updateColorRowState(
  row: Element | null,
  rawValue: string,
  hasOverride: boolean,
): void {
  if (!(row instanceof HTMLElement)) {
    return;
  }
  const hex = cssColorToHex(rawValue).toLowerCase();
  let matchedPreset = false;
  const swatches = Array.from(row.querySelectorAll(".obv-pin-tweak-swatch"));
  for (const swatch of swatches) {
    if (!(swatch instanceof HTMLElement)) {
      continue;
    }
    if (swatch.classList.contains("obv-pin-tweak-swatch--custom")) {
      continue;
    }
    const swatchValue = (swatch.getAttribute("data-color") ?? "").toLowerCase();
    const isActive = swatchValue === hex;
    swatch.setAttribute("data-active", isActive ? "true" : "false");
    if (isActive) {
      matchedPreset = true;
    }
  }
  const customTrigger = row.querySelector(".obv-pin-tweak-swatch--custom");
  if (customTrigger instanceof HTMLElement) {
    customTrigger.setAttribute(
      "data-active",
      matchedPreset ? "false" : "true",
    );
    customTrigger.setAttribute(
      "title",
      `Custom color (${hex})`,
    );
  }
  toggleResetVisibility(row, hasOverride);
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
      width: ${PIN_RADIUS_PX * 2}px;
      height: ${PIN_RADIUS_PX * 2}px;
      border-radius: 999px;
      background: #facc15;
      border: 2px solid rgba(0, 0, 0, 0.18);
      color: #1f2937;
      font-size: 12px;
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
    .obv-pin:focus-visible {
      outline: 2px solid #facc15;
      outline-offset: 2px;
    }
    .obv-pin-popover {
      position: absolute;
      top: 0;
      left: 0;
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
    .obv-pin-layer[data-theme="dark"] .obv-pin-popover {
      background: #18181b;
      color: #f4f4f5;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
    }
    .obv-pin-popover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .obv-pin-popover-title {
      font-size: 12px;
      font-weight: 600;
      color: rgba(15, 23, 42, 0.7);
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
      width: 24px;
      height: 24px;
      border-radius: 6px;
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    .obv-pin-icon-button:hover {
      background: rgba(15, 23, 42, 0.08);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-icon-button:hover {
      background: rgba(255, 255, 255, 0.1);
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
      align-items: center;
      gap: 10px;
      font-size: 12px;
      min-height: 24px;
    }
    .obv-pin-tweak-label {
      flex: 0 0 60px;
      color: rgba(15, 23, 42, 0.65);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-label {
      color: rgba(244, 244, 245, 0.65);
    }
    .obv-pin-tweak-slider {
      -webkit-appearance: none;
      appearance: none;
      flex: 1 1 auto;
      min-width: 0;
      height: 3px;
      background: rgba(15, 23, 42, 0.12);
      border-radius: 999px;
      outline: none;
      cursor: pointer;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-slider {
      background: rgba(255, 255, 255, 0.14);
    }
    .obv-pin-tweak-slider::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #facc15;
      border: none;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
      cursor: pointer;
    }
    .obv-pin-tweak-slider::-moz-range-thumb {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #facc15;
      border: none;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
      cursor: pointer;
    }
    .obv-pin-tweak-slider:hover::-webkit-slider-thumb {
      transform: scale(1.15);
    }
    .obv-pin-tweak-slider:hover::-moz-range-thumb {
      transform: scale(1.15);
    }
    .obv-pin-tweak-slider:focus-visible {
      outline: 2px solid #facc15;
      outline-offset: 4px;
    }
    .obv-pin-tweak-swatches {
      flex: 1 1 auto;
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
    }
    .obv-pin-tweak-swatch {
      width: 16px;
      height: 16px;
      flex: 0 0 16px;
      padding: 0;
      border: 1px solid rgba(15, 23, 42, 0.18);
      border-radius: 999px;
      background: transparent;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-swatch {
      border-color: rgba(255, 255, 255, 0.22);
    }
    .obv-pin-tweak-swatch:hover {
      transform: scale(1.15);
    }
    .obv-pin-tweak-swatch[data-active="true"] {
      box-shadow: 0 0 0 2px #facc15, 0 0 0 3px rgba(15, 23, 42, 0.08);
      transform: scale(1.05);
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-swatch[data-active="true"] {
      box-shadow: 0 0 0 2px #facc15, 0 0 0 3px rgba(255, 255, 255, 0.08);
    }
    .obv-pin-tweak-swatch:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px #facc15, 0 0 0 3px rgba(15, 23, 42, 0.08);
    }
    .obv-pin-tweak-swatch--custom {
      background: conic-gradient(
        from 90deg,
        #ef4444,
        #f97316,
        #facc15,
        #22c55e,
        #3b82f6,
        #a855f7,
        #ec4899,
        #ef4444
      );
      position: relative;
      margin-left: 2px;
    }
    .obv-pin-tweak-swatch--custom::after {
      content: "";
      position: absolute;
      inset: 3px;
      border-radius: 999px;
      background: var(--obv-pin-popover-bg, #ffffff);
      opacity: 0.85;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-swatch--custom::after {
      background: #18181b;
    }
    .obv-pin-tweak-swatch--custom[data-active="true"]::after {
      opacity: 0;
    }
    .obv-pin-tweak-color-input {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      border: 0;
      overflow: hidden;
      clip: rect(0 0 0 0);
      pointer-events: none;
      opacity: 0;
    }
    .obv-pin-tweak-value {
      flex: 0 0 50px;
      font-variant-numeric: tabular-nums;
      font-size: 11px;
      color: rgba(15, 23, 42, 0.7);
      text-align: right;
    }
    .obv-pin-layer[data-theme="dark"] .obv-pin-tweak-value {
      color: rgba(244, 244, 245, 0.7);
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
