import type {
  ElementGrabItem,
  FeedbackVisualSuggestion,
  FeedbackVisualSuggestionElementRef,
  FeedbackVisualSuggestionProperty,
  FeedbackVisualSuggestionScope,
  FeedbackVisualSuggestionsPayload,
} from "./index";
import {
  buildVisualSuggestionPrompt,
  createVisualSuggestionElementRef,
  createVisualSuggestionId,
  getVisualSuggestionComputedValue,
  sanitizeVisualSuggestionValue,
  VISUAL_SUGGESTION_PROPERTIES,
} from "./visual-suggestion-helpers";

const MAX_VISUAL_SUGGESTIONS_PER_SUBMISSION = 10;
const VISUAL_SUGGESTION_PAYLOAD_VERSION = 1 as const;

export interface ActiveElement {
  element: HTMLElement;
  ref: FeedbackVisualSuggestionElementRef;
  originals: Map<
    FeedbackVisualSuggestionProperty,
    { computedValue: string; previousInlineValue: string | null }
  >;
  targets: ActiveElementTarget[];
  scope: FeedbackVisualSuggestionScope;
}

export interface ActiveElementTarget {
  element: HTMLElement;
  ref: FeedbackVisualSuggestionElementRef;
  originals: Map<
    FeedbackVisualSuggestionProperty,
    { computedValue: string; previousInlineValue: string | null }
  >;
}

export interface VisualSuggestionTargetInput {
  element: HTMLElement;
  ref: FeedbackVisualSuggestionElementRef;
}

interface PersistentPreviewEntry {
  id: string;
  elementId: string;
  property: FeedbackVisualSuggestionProperty;
  targets: Array<{
    element: HTMLElement;
    previousInlineValue: string | null;
  }>;
  appliedValue: string;
}

export interface ElementOverrideGroup {
  ref: FeedbackVisualSuggestionElementRef;
  items: FeedbackVisualSuggestion[];
}

export class VisualSuggestionManager {
  private active: ActiveElement | null = null;
  private items: FeedbackVisualSuggestion[] = [];
  private previews: Map<string, PersistentPreviewEntry> = new Map();

  getActiveElement(): ActiveElement | null {
    return this.active;
  }

  getItems(): readonly FeedbackVisualSuggestion[] {
    return this.items;
  }

  hasItems(): boolean {
    return this.items.length > 0;
  }

  isFull(): boolean {
    return this.items.length >= MAX_VISUAL_SUGGESTIONS_PER_SUBMISSION;
  }

  setActiveElement(target: HTMLElement, grab: ElementGrabItem): void {
    this.active = this.createActiveElementState(
      target,
      createVisualSuggestionElementRef(grab),
    );
  }

  setActiveElementTargets(
    selectedTarget: HTMLElement,
    selectedRef: FeedbackVisualSuggestionElementRef,
    targets: readonly VisualSuggestionTargetInput[],
    scope: FeedbackVisualSuggestionScope,
  ): void {
    const active = this.active;
    const existingActiveItemProperties =
      active?.ref.id === selectedRef.id
        ? this.items
            .filter((item) => item.element.id === selectedRef.id)
            .map((item) => ({
              property: item.property,
              suggestedValue: item.suggestedValue,
            }))
        : [];

    for (const item of this.items.filter(
      (candidate) => candidate.element.id === selectedRef.id,
    )) {
      const preview = this.previews.get(item.id);
      if (preview) {
        this.restoreInlineStyle(preview);
        this.previews.delete(item.id);
      }
    }
    this.items = this.items.filter(
      (candidate) => candidate.element.id !== selectedRef.id,
    );

    this.active = this.createActiveElementState(
      selectedTarget,
      selectedRef,
      targets.map((target) =>
        this.createActiveElementTarget(target.element, target.ref),
      ),
      scope,
    );

    for (const item of existingActiveItemProperties) {
      this.setPropertyOverride(item.property, item.suggestedValue);
    }
  }

  activateElementWithSuggestions(
    target: HTMLElement,
    ref: FeedbackVisualSuggestionElementRef,
    suggestions: readonly FeedbackVisualSuggestion[],
  ): void {
    this.active = this.createActiveElementState(target, ref);
    this.items = suggestions.map((suggestion) => ({ ...suggestion }));
  }

  closeActiveElement(): void {
    this.active = null;
  }

  getOriginalValue(property: FeedbackVisualSuggestionProperty): string {
    if (!this.active) return "";
    return this.active.originals.get(property)?.computedValue ?? "";
  }

  getOverrideForActiveElement(
    property: FeedbackVisualSuggestionProperty,
  ): FeedbackVisualSuggestion | null {
    if (!this.active) return null;
    const ref = this.active.ref;
    return (
      this.items.find(
        (i) => i.element.id === ref.id && i.property === property,
      ) ?? null
    );
  }

  getCurrentDisplayValue(property: FeedbackVisualSuggestionProperty): string {
    const override = this.getOverrideForActiveElement(property);
    if (override) return override.suggestedValue;
    return this.getOriginalValue(property);
  }

  setPropertyOverride(
    property: FeedbackVisualSuggestionProperty,
    suggestedValue: string,
  ): void {
    const active = this.active;
    if (!active) return;
    const sanitized = sanitizeVisualSuggestionValue(suggestedValue);
    if (!sanitized) return;
    const original = active.originals.get(property);
    if (!original) return;

    if (sanitized === original.computedValue) {
      this.clearPropertyOverride(property);
      return;
    }

    const existingIndex = this.items.findIndex(
      (i) => i.element.id === active.ref.id && i.property === property,
    );
    const basePrompt = buildVisualSuggestionPrompt(
      active.ref,
      property,
      original.computedValue,
      sanitized,
    );
    const prompt =
      active.scope.kind === "similar-siblings"
        ? `${basePrompt} Apply the same visual intent to ${active.scope.matchedCount} similar nearby elements in the same row/group.`
        : basePrompt;
    const suggestion: FeedbackVisualSuggestion = {
      id:
        existingIndex >= 0
          ? this.items[existingIndex].id
          : createVisualSuggestionId(),
      property,
      originalValue: original.computedValue,
      suggestedValue: sanitized,
      prompt,
      element: active.ref,
      scope: active.scope.kind === "element" ? undefined : active.scope,
      capturedAt: new Date().toISOString(),
    };

    if (existingIndex >= 0) {
      this.items = this.items.map((item, i) =>
        i === existingIndex ? suggestion : item,
      );
    } else {
      this.items = [...this.items, suggestion];
    }

    const appliedTargets: PersistentPreviewEntry["targets"] = [];
    for (const target of active.targets) {
      const targetOriginal = target.originals.get(property);
      if (!targetOriginal) continue;
      try {
        target.element.style.setProperty(property, sanitized);
        appliedTargets.push({
          element: target.element,
          previousInlineValue: targetOriginal.previousInlineValue,
        });
      } catch {
        // Keep previewing the other matched elements.
      }
    }

    this.previews.set(suggestion.id, {
      id: suggestion.id,
      elementId: active.ref.id,
      property,
      targets: appliedTargets,
      appliedValue: sanitized,
    });
  }

  clearPropertyOverride(property: FeedbackVisualSuggestionProperty): void {
    const active = this.active;
    if (!active) return;
    const original = active.originals.get(property);
    if (!original) return;
    const existing = this.items.find(
      (i) => i.element.id === active.ref.id && i.property === property,
    );
    if (!existing) return;

    const preview = this.previews.get(existing.id);
    if (preview) {
      this.restoreInlineStyle(preview);
    } else if (original.previousInlineValue) {
      active.element.style.setProperty(property, original.previousInlineValue);
    } else {
      active.element.style.removeProperty(property);
    }

    this.previews.delete(existing.id);
    this.items = this.items.filter((i) => i.id !== existing.id);
  }

  removeElement(elementId: string): void {
    const ids = this.items
      .filter((item) => item.element.id === elementId)
      .map((item) => item.id);
    this.removeSuggestions(ids);
    if (this.active && this.active.ref.id === elementId) {
      this.active = null;
    }
  }

  getPreviewedElement(elementId: string): HTMLElement | null {
    for (const entry of this.previews.values()) {
      if (entry.elementId === elementId) {
        return entry.targets[0]?.element ?? null;
      }
    }
    return null;
  }

  commitCurrentLine(): FeedbackVisualSuggestion[] {
    const committed = [...this.items];
    this.items = [];
    this.active = null;
    return committed;
  }

  removeSuggestions(ids: string[]): void {
    const idSet = new Set(ids);
    for (const id of idSet) {
      const entry = this.previews.get(id);
      if (entry) {
        this.restoreInlineStyle(entry);
        this.previews.delete(id);
      }
    }
    this.items = this.items.filter((item) => !idSet.has(item.id));
    if (this.active) {
      const stillActive = this.items.some(
        (item) => item.element.id === this.active?.ref.id,
      );
      if (!stillActive) {
        this.active = null;
      }
    }
  }

  getElementsWithOverrides(): ElementOverrideGroup[] {
    const grouped = new Map<string, ElementOverrideGroup>();
    for (const item of this.items) {
      const existing = grouped.get(item.element.id);
      if (existing) {
        existing.items.push(item);
      } else {
        grouped.set(item.element.id, { ref: item.element, items: [item] });
      }
    }
    return [...grouped.values()];
  }

  restoreAll(): void {
    for (const entry of this.previews.values()) {
      this.restoreInlineStyle(entry);
    }
    this.previews.clear();
    this.items = [];
    this.active = null;
  }

  getPayload(): FeedbackVisualSuggestionsPayload | undefined {
    if (this.items.length === 0) return undefined;
    return {
      version: VISUAL_SUGGESTION_PAYLOAD_VERSION,
      suggestions: this.items,
    };
  }

  private createActiveElementState(
    target: HTMLElement,
    ref: FeedbackVisualSuggestionElementRef,
    targets: readonly ActiveElementTarget[] = [],
    scope: FeedbackVisualSuggestionScope = {
      kind: "element",
      label: "This element",
      matchedCount: 1,
    },
  ): ActiveElement {
    const fallbackTarget = this.createActiveElementTarget(target, ref);
    const activeTargets = targets.length > 0 ? [...targets] : [fallbackTarget];
    const selectedTarget =
      activeTargets.find((candidate) => candidate.ref.id === ref.id) ??
      fallbackTarget;
    return {
      element: selectedTarget.element,
      ref,
      originals: selectedTarget.originals,
      targets: activeTargets,
      scope,
    };
  }

  private createActiveElementTarget(
    element: HTMLElement,
    ref: FeedbackVisualSuggestionElementRef,
  ): ActiveElementTarget {
    const originals = new Map<
      FeedbackVisualSuggestionProperty,
      { computedValue: string; previousInlineValue: string | null }
    >();
    for (const prop of VISUAL_SUGGESTION_PROPERTIES) {
      originals.set(prop, {
        computedValue: getVisualSuggestionComputedValue(element, prop),
        previousInlineValue: element.style.getPropertyValue(prop) || null,
      });
    }
    return { element, ref, originals };
  }

  private restoreInlineStyle(entry: PersistentPreviewEntry): void {
    for (const target of entry.targets) {
      try {
        if (target.previousInlineValue) {
          target.element.style.setProperty(
            entry.property,
            target.previousInlineValue,
          );
        } else {
          target.element.style.removeProperty(entry.property);
        }
      } catch {
        // element may have been removed from the DOM
      }
    }
  }
}
