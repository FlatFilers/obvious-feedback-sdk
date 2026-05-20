import {
  cssColorToHex,
  createVisualSuggestionElementRef,
  formatCssNumericValue,
  getDefaultScrubStart,
  getVisualSuggestionSliderConfig,
  isVisualSuggestionColorProperty,
  isVisualSuggestionProperty,
  parseCssNumericValue,
  VISUAL_SUGGESTION_PROPERTIES,
  VISUAL_SUGGESTION_PROPERTY_LABELS,
} from "../visual-suggestion-helpers";
import { serializeDomSnapshot } from "../browser/dom-snapshot";
import {
  createConsoleBuffer,
  createNetworkBuffer,
  type ConsoleLogEntry,
  type NetworkLogEntry,
} from "../browser/log-capture";
import {
  currentTargetElement,
  isClipboardEvent,
  isDragEvent,
  isKeyboardEvent,
  isInputLikeElement,
  isPointerEvent,
  queryButtonElement,
  queryHtmlElement,
  queryInputElement,
  queryInputElements,
  targetElement,
} from "../dom-utils";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_ATTACHMENT_MIME_TYPE,
  DEFAULT_ENV,
  DEFAULT_FEEDBACK_ISSUE_SEVERITY,
  DEFAULT_FEEDBACK_ISSUE_TYPE,
  DEFAULT_TRIGGER_LABEL,
  DEFAULT_TRIGGER_SIZE_PX,
  DRAFT_ROUND_STORAGE_PREFIX,
  FEEDBACK_ATTACHMENT_SESSION_PREFIX,
  FEEDBACK_ATTACHMENT_UPLOAD_TIMEOUT_MS,
  FEEDBACK_CARD_MAX_WIDTH_PX,
  FEEDBACK_CARD_VIEWPORT_MARGIN_PX,
  FEEDBACK_FORM_ESTIMATED_HEIGHT_PX,
  FEEDBACK_STATUS_CARD_ESTIMATED_HEIGHT_PX,
  HISTORY_REFRESH_STALE_MS,
  INLINE_POPUP_ESTIMATED_HEIGHT_PX,
  INLINE_POPUP_WIDTH_PX,
  ISSUE_HISTORY_STORAGE_PREFIX,
  MAX_DRAFT_ROUND_STORAGE_BYTES,
  MAX_ELEMENT_GRABS,
  MAX_FEEDBACK_ATTACHMENTS,
  MAX_FEEDBACK_ATTACHMENT_SIZE_BYTES,
  MAX_HISTORY_REFRESH_PER_OPEN,
  MAX_ISSUE_HISTORY_ENTRIES,
  MAX_ROUND_ITEMS,
  MAX_TEXT_LENGTH,
  MAX_VISUAL_SUGGESTION_SCOPE_DEPTH,
  MAX_VISUAL_SUGGESTION_SCOPE_TARGETS,
  PIN_REANCHOR_THRESHOLD_PX,
  PIN_TICKER_INTERVAL_MS,
  SILLY_FEEDBACK_LOAD_PROBABILITY,
  SILLY_FEEDBACK_MESSAGES,
  TRIGGER_DOCK_OVERSCROLL_PX,
  TRIGGER_DRAG_THRESHOLD_PX,
  TRIGGER_HIDDEN_PEEK_PX,
  TRIGGER_POSITION_STORAGE_KEY,
  TRIGGER_VIEWPORT_MARGIN_PX,
} from "../constants";
import {
  computeInlinePopupPlacement,
  computePinAnchor,
  computePinAnchorFromPoint,
  isElementFixed,
  resolvePinElement,
} from "../pin-positioning";
import {
  type VisualSuggestionTargetInput,
  VisualSuggestionManager,
} from "../visual-suggestion-manager";
import { escapeHtml, truncateText } from "../utils/html";
import { redactUrl } from "../utils/url";
import { SDK_VERSION } from "../version";
import { createIcon } from "./icons";
import {
  buildCssSelector,
  createElementGrabId,
  createElementGrabRect,
  getElementGrabDisplayName,
  getElementGrabHoverLabel,
  truncateOuterHtml,
} from "./element-grab";
import {
  computeRulerDistances,
  createElementEdgeCache,
  createMeasurementId,
  createRulerId,
  findSnapPosition,
  renderRulerSvg,
  type ElementEdgeCache,
  type RulerLine,
  type SnapResult,
} from "./measurements";
import { getPointerPoint, type FeedbackPointerPoint } from "./pointer";
import {
  findSimilarSiblingScope,
  getVisualSuggestionElementLabel,
  getVisualSuggestionRefLabel,
  getVisualSuggestionTargetKind,
  getVisualSuggestionTargetLabel,
  getVisualSuggestionTargetProperties,
  isElementVisibleForScope,
  pluralizeVisualSuggestionTargetLabel,
  normalizeVisualSuggestionTarget,
  supportsVisualSuggestionSiblingScope,
  type VisualSuggestionTargetKind,
} from "../visual-suggestion-dom";
import {
  createRoundItemId,
  getDraftRoundStorageKey,
  parseStoredDraftRound,
  persistDraftRound,
  type FeedbackMeasurement,
  type FeedbackMeasurementDistance,
  type FeedbackMeasurementRuler,
  type FeedbackRoundItem,
} from "./draft-rounds";
import {
  getFeedbackIssueHistoryStorageKey,
  getIssueStatusVersion,
  isFeedbackClientStatus,
  isTerminalIssueStatus,
  parseStoredIssueHistory,
  persistIssueHistory,
  type FeedbackIssueHistoryEntry,
  type FeedbackIssueHistoryStatus,
} from "./issue-history";
import {
  getFeedbackIssueLinks,
  getSafeExternalUrl,
  normalizeFeedbackAiSummary,
  normalizeFeedbackIssueLinks,
  normalizeWorkerThreadLink,
} from "./feedback-normalizers";
import { createStyles } from "./styles";
import {
  clampTriggerPosition,
  createDockedTriggerPosition,
  createFeedbackCardPlacement,
  createTriggerDragPoint,
  createTriggerPositionStyle,
  getDockSideForRect,
  getFallbackTriggerPosition,
  isPointerInTriggerPeekZone,
  parseStoredTriggerPosition,
  persistTriggerPosition,
  positionToViewportPoint,
  type FeedbackAnchorRect,
  type FeedbackCardPlacement,
  type FeedbackTriggerDragState,
  type FeedbackTriggerDockSide,
  type FeedbackTriggerPosition,
  viewportPointToNearestCorner,
} from "./trigger-placement";
import {
  createAttachmentUploadUrl,
  createFeedbackRoundSubmitUrl,
  createFeedbackStatusRequest,
  createFeedbackSubmitUrl,
} from "./transport";
import type {
  ElementGrabHoverInfo,
  ElementGrabItem,
  ElementSourceInfo,
  ElementSourceResolver,
  ElementSourceStackFrame,
  FeedbackAiSummary,
  FeedbackClientStatus,
  FeedbackIssueLinks,
  FeedbackPin,
  FeedbackPullRequestLink,
  FeedbackSdkConfig,
  FeedbackSdkHandle,
  FeedbackSdkTheme,
  FeedbackSubmissionInput,
  FeedbackVisualSuggestion,
  FeedbackVisualSuggestionElementRef,
  FeedbackVisualSuggestionProperty,
  FeedbackVisualSuggestionScope,
  FeedbackVisualSuggestionScopeKind,
  FeedbackVisualSuggestionsPayload,
  FeedbackWorkerThreadLink,
} from "../public-types";
const SESSION_REPLAY_URL_RESOLVER_TIMEOUT_MS = 250;

type FeedbackPanel = "unified";

type FeedbackAttachmentUploadStatus = "uploading" | "ready" | "error";

interface FeedbackAttachmentUpload {
  id: string;
  file: File;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: FeedbackAttachmentUploadStatus;
  attachmentToken?: string;
  error?: string;
}

interface VisualSuggestionScopeOption {
  kind: FeedbackVisualSuggestionScopeKind;
  label: string;
  targets: VisualSuggestionTargetInput[];
  scope: FeedbackVisualSuggestionScope;
}

interface VisualSuggestionTargetOption {
  id: string;
  kind: VisualSuggestionTargetKind;
  label: string;
  element: HTMLElement;
  ref: FeedbackVisualSuggestionElementRef;
  scopeOptions: VisualSuggestionScopeOption[];
}

interface PendingPinAnchor {
  xPct: number;
  yPx: number;
  isFixed: boolean;
  element: HTMLElement;
  grab: ElementGrabItem;
  elementName: string;
}

function getRandomSillyFeedbackMessage(): string {
  return (
    SILLY_FEEDBACK_MESSAGES[
      Math.floor(Math.random() * SILLY_FEEDBACK_MESSAGES.length)
    ] ?? SILLY_FEEDBACK_MESSAGES[0]
  );
}

function shouldShowSillyFeedbackMessageOnLoad(): boolean {
  return Math.random() < SILLY_FEEDBACK_LOAD_PROBABILITY;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRecordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const field = value[key];
  return isRecord(field) ? field : null;
}

function getStringField(
  value: Record<string, unknown> | null,
  key: string,
): string | undefined {
  const field = value?.[key];
  return typeof field === "string" ? field : undefined;
}

function getNullableStringField(
  value: Record<string, unknown> | null,
  key: string,
): string | null | undefined {
  const field = value?.[key];
  if (field === null) return null;
  return typeof field === "string" ? field : undefined;
}

function parseVisualSuggestionScopeKind(
  value: unknown,
): FeedbackVisualSuggestionScopeKind | null {
  return value === "element" || value === "similar-siblings" ? value : null;
}

function parseSliderUnit(
  value: string,
): "px" | "rem" | "em" | "%" | "" {
  if (
    value === "px" ||
    value === "rem" ||
    value === "em" ||
    value === "%" ||
    value === ""
  ) {
    return value;
  }
  return "px";
}

function historyStatusLabel(status: FeedbackIssueHistoryStatus): string {
  return status === "unavailable" ? "Status unavailable" : statusLabel(status);
}

function statusLabel(status: FeedbackClientStatus): string {
  switch (status) {
    case "received":
      return "Received";
    case "under_review":
      return "Under review";
    case "in_progress":
      return "In progress";
    case "resolved":
      return "Resolved";
    case "no_action":
      return "No action";
    case "duplicate":
      return "Duplicate";
  }
}

function formatRelativeTime(rawTimestamp?: string): string {
  if (!rawTimestamp) {
    return "";
  }
  const timestamp = new Date(rawTimestamp).getTime();
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedSeconds = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 1000),
  );
  if (elapsedSeconds < 60) {
    return "just now";
  }
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m ago`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 48) {
    return `${elapsedHours}h ago`;
  }
  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays}d ago`;
}

function createFeedbackAttachmentId(): string {
  const randomId =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `attachment_${randomId}`;
}

function createFeedbackAttachmentSessionId(): string {
  const randomId =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${FEEDBACK_ATTACHMENT_SESSION_PREFIX}_${randomId}`;
}

function normalizeAttachmentMimeType(file: File): string {
  const normalized = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  return normalized.includes("/") ? normalized : DEFAULT_ATTACHMENT_MIME_TYPE;
}

function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${Math.round(sizeBytes / 1024)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export class ObviousFeedbackWidget {
  private readonly config: Required<
    Pick<
      FeedbackSdkConfig,
      | "publicKey"
      | "apiBaseUrl"
      | "env"
      | "redactSelectors"
      | "triggerLabel"
      | "assistantPosition"
      | "capturePageContext"
      | "captureConsole"
      | "captureNetwork"
      | "previewOnlyReason"
      | "previewOnly"
    >
  > &
    Pick<
      FeedbackSdkConfig,
      | "identityToken"
      | "prNumber"
      | "elementSourceResolver"
      | "sessionReplayUrlResolver"
      | "visualSuggestions"
      | "inlineAnnotations"
    >;
  private readonly host: HTMLDivElement;
  private readonly shadowRoot: ShadowRoot;
  private readonly consoleBuffer: {
    read: () => ConsoleLogEntry[];
    restore: () => void;
  };
  private readonly networkBuffer: {
    read: () => NetworkLogEntry[];
    restore: () => void;
  };
  private readonly issueHistoryStorageKey: string | null;
  private readonly draftRoundStorageKey: string | null;
  private readonly elementSourceCache = new WeakMap<
    Element,
    Promise<ElementSourceInfo | null>
  >();
  private issueHistory: FeedbackIssueHistoryEntry[] = [];
  private roundItems: FeedbackRoundItem[] = [];
  private focusedItemId: string | null = null;
  private issueId: string | null = null;
  private statusCardIssueId: string | null = null;
  private statusCardStatus: FeedbackClientStatus | null = null;
  private statusCardUpdatedAt: string | null = null;
  private statusCardReportedAt: string | null = null;
  private statusTimer: number | null = null;
  private statusPollIndex = 0;
  private selectedIssueId: string | null = null;
  private triggerPosition: FeedbackTriggerPosition;
  private triggerDragState: FeedbackTriggerDragState | null = null;
  private hiddenTriggerPeeking = false;
  private suppressNextTriggerClick = false;
  private elementGrabItems: ElementGrabItem[] = [];
  private activePanel: FeedbackPanel | null = null;
  private historyRefreshInFlight = false;
  private openIssueCountListeners = new Set<(count: number) => void>();
  private lastEmittedOpenIssueCount = -1;
  private elementGrabHoverTarget: Element | null = null;
  private elementGrabHoverInfo: ElementGrabHoverInfo | null = null;
  private elementGrabResolveTimer: number | null = null;
  private activeSillyFeedbackMessage: string | null = null;

  private elementPickerOpen = false;
  private annotationModeActive = false;
  private annotationReturnToCardAfterSubmit = false;
  private inlineAnnotationOpen = false;
  private editingPinItemId: string | null = null;
  private pendingPinSourceItemId: string | "__new" | null = null;
  private pendingPinAnchor: PendingPinAnchor | null = null;
  private pinPositionRafHandle: number | null = null;
  private pinResizeObserver: ResizeObserver | null = null;
  private pinScrollListenerInstalled = false;
  private inlinePopupShakeUntil = 0;
  private inlinePopupDraft: string = "";
  private inlinePopupAnimReady = false;
  private readonly freshPinIds: Set<string> = new Set();
  private readonly visualSuggestions: VisualSuggestionManager | null;
  private activeVisualSuggestionItemId: string | null = null;
  private visualSuggestionTargetOptions: VisualSuggestionTargetOption[] = [];
  private visualSuggestionScopeOptions: VisualSuggestionScopeOption[] = [];
  private measureOverlayOpen = false;
  private measurementSourceItemId: string | "__new" | null = null;
  private measurementItems: FeedbackMeasurement[] = [];
  private newRowDraft = "";
  private rulerLines: RulerLine[] = [];
  private readonly elementEdgeCache: ElementEdgeCache = createElementEdgeCache();
  private selectedRulerId: string | null = null;
  private rulerPreview: {
    orientation: "horizontal" | "vertical";
    position: number;
  } | null = null;
  private draggingRulerId: string | null = null;
  private rulerShiftHeld = false;
  private readonly attachmentSessionId = createFeedbackAttachmentSessionId();
  private feedbackAttachments: FeedbackAttachmentUpload[] = [];
  private feedbackFormError: string | null = null;
  private submittedIssueUrl: string | null = null;
  private cardResizeObserver: ResizeObserver | null = null;
  private placementFrame: number | null = null;
  private globalFileDropGuardsInstalled = false;
  private destroyed = false;
  private systemThemeCleanup: (() => void) | null = null;
  private useAdoptedStyleSheet = false;

  constructor(config: FeedbackSdkConfig) {
    this.config = {
      publicKey: config.publicKey ?? "",
      apiBaseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
      identityToken: config.identityToken,
      env: config.env ?? DEFAULT_ENV,
      prNumber: config.prNumber,
      redactSelectors: config.redactSelectors ?? [],
      triggerLabel: config.triggerLabel ?? DEFAULT_TRIGGER_LABEL,
      assistantPosition: config.assistantPosition ?? "bottom-right",
      capturePageContext: config.capturePageContext ?? false,
      captureConsole: config.captureConsole ?? false,
      previewOnlyReason:
        config.previewOnlyReason ?? "Preview only — submissions disabled.",
      captureNetwork: config.captureNetwork ?? false,
      previewOnly: config.previewOnly ?? false,
      elementSourceResolver: config.elementSourceResolver,
      sessionReplayUrlResolver: config.sessionReplayUrlResolver,
      visualSuggestions: config.visualSuggestions,
      inlineAnnotations: config.inlineAnnotations,
    };
    this.visualSuggestions =
      this.config.visualSuggestions?.enabled === true
        ? new VisualSuggestionManager()
        : null;
    this.consoleBuffer = this.config.captureConsole
      ? createConsoleBuffer()
      : { read: () => [], restore: () => {} };
    this.networkBuffer = this.config.captureNetwork
      ? createNetworkBuffer()
      : { read: () => [], restore: () => {} };
    this.issueHistoryStorageKey = getFeedbackIssueHistoryStorageKey(
      this.config.publicKey,
      this.config.env,
    );
    this.draftRoundStorageKey = getDraftRoundStorageKey(
      this.config.publicKey,
      this.config.env,
    );
    this.issueHistory = parseStoredIssueHistory(this.issueHistoryStorageKey);
    this.roundItems = parseStoredDraftRound(this.draftRoundStorageKey);
    this.triggerPosition = clampTriggerPosition(
      parseStoredTriggerPosition() ??
        getFallbackTriggerPosition(this.config.assistantPosition),
    );
    this.host = document.createElement("div");
    this.shadowRoot = this.host.attachShadow({ mode: "open" });
    this.installConstructableStylesheet();
    this.applyTheme(config.theme ?? "light");
    document.body.appendChild(this.host);
    this.renderTrigger();
    window.addEventListener("keydown", this.handleShortcut);
    window.addEventListener("pointermove", this.handleTriggerPeekPointerMove);
    window.addEventListener("resize", this.handleViewportChange);
    window.addEventListener("orientationchange", this.handleViewportChange);
    window.visualViewport?.addEventListener(
      "resize",
      this.handleViewportChange,
    );
  }

  getOpenIssueCount(): number {
    return this.getDraftItemCount() + this.getOpenIssueHistoryEntries().length;
  }

  subscribeToOpenIssueCount(listener: (count: number) => void): () => void {
    this.openIssueCountListeners.add(listener);
    listener(this.getOpenIssueCount());
    return () => {
      this.openIssueCountListeners.delete(listener);
    };
  }

  open(): void {
    if (this.isCardOpen()) {
      return;
    }
    this.openCard();
  }

  private emitOpenIssueCountChange(): void {
    const count = this.getOpenIssueCount();
    if (count === this.lastEmittedOpenIssueCount) {
      return;
    }
    this.lastEmittedOpenIssueCount = count;
    for (const listener of this.openIssueCountListeners) {
      listener(count);
    }
  }

  private getOpenIssueHistoryEntries(): FeedbackIssueHistoryEntry[] {
    return this.issueHistory.filter(
      (entry) =>
        !isTerminalIssueStatus(entry.status) && entry.status !== "unavailable",
    );
  }

  private getShortcutLabel(): string {
    return this.isMacPlatform() ? "⌘⇧." : "Ctrl+Shift+.";
  }

  private getDraftItemCount(): number {
    return this.roundItems.filter(
      (item) => item.description.trim().length > 0,
    ).length;
  }

  private isMacPlatform(): boolean {
    return (
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad/.test(navigator.userAgent)
    );
  }

  private getTriggerStatusLabel(): string {
    const draftCount = this.getDraftItemCount();
    if (draftCount > 0) {
      return `${this.config.triggerLabel} — ${draftCount} draft item${draftCount === 1 ? "" : "s"}`;
    }
    return this.config.triggerLabel;
  }

  private renderTriggerButton(): string {
    const draftCount = this.getDraftItemCount();
    const isHidden =
      this.triggerPosition.hidden === true &&
      this.triggerPosition.dockSide !== undefined &&
      !this.isCardOpen();
    const triggerPosition = isHidden
      ? this.triggerPosition
      : {
          corner: this.triggerPosition.corner,
          offsetX: this.triggerPosition.offsetX,
          offsetY: this.triggerPosition.offsetY,
          hidden: false,
        };
    const draftIndicator =
      draftCount > 0
        ? `<span class="obv-trigger-ring" data-status="draft" aria-hidden="true"></span>`
        : "";
    const triggerIconHtml = `<span class="obv-trigger-icon" aria-hidden="true"><span class="obv-trigger-icon-glyph obv-trigger-icon-glyph-pencil">${createIcon("compose")}</span><span class="obv-trigger-icon-glyph obv-trigger-icon-glyph-close">${createIcon("close")}</span></span>`;
    return `<button class="obv-trigger" data-assistant-position="${escapeHtml(this.config.assistantPosition)}" data-trigger-corner="${escapeHtml(this.triggerPosition.corner)}" data-issue-status="${draftCount > 0 ? "draft" : "idle"}" type="button" aria-label="${escapeHtml(this.getTriggerStatusLabel())}" data-tooltip="Feedback (${this.getShortcutLabel()})"${this.isCardOpen() ? ' data-card-open="true"' : ""}${isHidden ? ` data-trigger-hidden="true" data-trigger-dock-side="${escapeHtml(this.triggerPosition.dockSide ?? "")}"` : ""}${isHidden && this.hiddenTriggerPeeking ? ' data-trigger-peeking="true"' : ""} style="${createTriggerPositionStyle(triggerPosition)}">${triggerIconHtml}${draftIndicator}</button>`;
  }

  private updateTriggerPeekState(nextPeeking: boolean): void {
    if (this.hiddenTriggerPeeking === nextPeeking) {
      return;
    }
    const triggerBefore = queryHtmlElement(this.shadowRoot, ".obv-trigger");
    this.hiddenTriggerPeeking = nextPeeking;
    const trigger = triggerBefore;
    if (!trigger) {
      return;
    }
    if (nextPeeking) {
      trigger.setAttribute("data-trigger-peeking", "true");
    } else {
      trigger.removeAttribute("data-trigger-peeking");
    }
  }

  private installConstructableStylesheet(): void {
    if (
      typeof CSSStyleSheet === "undefined" ||
      !("adoptedStyleSheets" in this.shadowRoot)
    ) {
      return;
    }
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(createStyles());
      this.shadowRoot.adoptedStyleSheets = [
        ...this.shadowRoot.adoptedStyleSheets,
        sheet,
      ];
      this.useAdoptedStyleSheet = true;
    } catch {
      this.useAdoptedStyleSheet = false;
    }
  }

  private renderStyleTag(): string {
    return this.useAdoptedStyleSheet ? "" : `<style>${createStyles()}</style>`;
  }

  private bindTrigger(onClick: () => void): void {
    const trigger = this.shadowRoot.querySelector(".obv-trigger");
    trigger?.addEventListener("pointerdown", (event) => {
      if (isPointerEvent(event)) {
        this.handleTriggerPointerDown(event);
      }
    });
    trigger?.addEventListener("pointermove", (event) => {
      if (isPointerEvent(event)) {
        this.handleTriggerPointerMove(event);
      }
    });
    trigger?.addEventListener("pointerup", (event) => {
      if (isPointerEvent(event)) {
        this.handleTriggerPointerUp(event);
      }
    });
    trigger?.addEventListener("pointercancel", () => this.cancelTriggerDrag());
    trigger?.addEventListener("click", (event) => {
      if (this.suppressNextTriggerClick) {
        this.suppressNextTriggerClick = false;
        event.preventDefault();
        return;
      }
      onClick();
    });
  }

  private handleTriggerPointerDown(event: PointerEvent): void {
    const trigger = currentTargetElement(event);
    const rect = trigger?.getBoundingClientRect();
    const point =
      this.triggerPosition.hidden === true && rect
        ? { left: rect.left, top: rect.top }
        : positionToViewportPoint(this.triggerPosition);
    trigger?.setPointerCapture?.(event.pointerId);
    this.triggerDragState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: point.left,
      startTop: point.top,
      initialPosition: this.triggerPosition,
      moved: false,
    };
  }

  private handleTriggerPointerMove(event: PointerEvent): void {
    if (
      !this.triggerDragState ||
      event.pointerId !== this.triggerDragState.pointerId
    ) {
      return;
    }
    const deltaX = event.clientX - this.triggerDragState.startClientX;
    const deltaY = event.clientY - this.triggerDragState.startClientY;
    if (
      !this.triggerDragState.moved &&
      Math.hypot(deltaX, deltaY) < TRIGGER_DRAG_THRESHOLD_PX
    ) {
      return;
    }
    this.triggerDragState.moved = true;
    const dragPoint = createTriggerDragPoint(
      this.triggerDragState.startLeft + deltaX,
      this.triggerDragState.startTop + deltaY,
    );
    this.triggerPosition = viewportPointToNearestCorner(
      dragPoint.left,
      dragPoint.top,
    );
    const trigger = queryHtmlElement(this.shadowRoot, ".obv-trigger");
    if (trigger) {
      trigger.setAttribute("data-trigger-corner", this.triggerPosition.corner);
      trigger.removeAttribute("data-trigger-hidden");
      trigger.removeAttribute("data-trigger-peeking");
      trigger.removeAttribute("data-trigger-dock-side");
      trigger.setAttribute(
        "style",
        `left: ${Math.round(dragPoint.left)}px; top: ${Math.round(dragPoint.top)}px; right: auto; bottom: auto;`,
      );
    }
    this.updateAnchoredFeedbackCard();
    event.preventDefault();
  }

  private handleTriggerPointerUp(event: PointerEvent): void {
    if (
      !this.triggerDragState ||
      event.pointerId !== this.triggerDragState.pointerId
    ) {
      return;
    }
    if (this.triggerDragState.moved) {
      const deltaX = event.clientX - this.triggerDragState.startClientX;
      const deltaY = event.clientY - this.triggerDragState.startClientY;
      const releasePoint = createTriggerDragPoint(
        this.triggerDragState.startLeft + deltaX,
        this.triggerDragState.startTop + deltaY,
      );
      const releaseRect: FeedbackAnchorRect = {
        left: releasePoint.left,
        top: releasePoint.top,
        width: DEFAULT_TRIGGER_SIZE_PX,
        height: DEFAULT_TRIGGER_SIZE_PX,
      };
      const dockSide = getDockSideForRect(
        releaseRect,
        this.triggerPosition.dockSide,
      );
      const trigger = queryHtmlElement(this.shadowRoot, ".obv-trigger");
      if (dockSide) {
        this.triggerPosition = createDockedTriggerPosition(
          releaseRect,
          dockSide,
        );
        if (trigger) {
          trigger.setAttribute("data-trigger-hidden", "true");
          trigger.setAttribute("data-trigger-dock-side", dockSide);
          if (this.hiddenTriggerPeeking) {
            trigger.setAttribute("data-trigger-peeking", "true");
          }
          trigger.setAttribute(
            "style",
            createTriggerPositionStyle(this.triggerPosition),
          );
        }
      } else {
        this.triggerPosition = viewportPointToNearestCorner(
          releasePoint.left,
          releasePoint.top,
        );
        this.hiddenTriggerPeeking = false;
        if (trigger) {
          trigger.removeAttribute("data-trigger-hidden");
          trigger.removeAttribute("data-trigger-peeking");
          trigger.removeAttribute("data-trigger-dock-side");
          trigger.setAttribute(
            "style",
            createTriggerPositionStyle(this.triggerPosition),
          );
        }
      }
      this.suppressNextTriggerClick = true;
      persistTriggerPosition(this.triggerPosition);
      event.preventDefault();
    }
    this.triggerDragState = null;
  }

  private cancelTriggerDrag(): void {
    if (this.triggerDragState?.moved) {
      this.triggerPosition = this.triggerDragState.initialPosition;
      const trigger = queryHtmlElement(this.shadowRoot, ".obv-trigger");
      if (trigger) {
        trigger.setAttribute(
          "data-trigger-corner",
          this.triggerPosition.corner,
        );
        if (this.triggerPosition.hidden === true) {
          trigger.setAttribute("data-trigger-hidden", "true");
          if (this.triggerPosition.dockSide) {
            trigger.setAttribute(
              "data-trigger-dock-side",
              this.triggerPosition.dockSide,
            );
          } else {
            trigger.removeAttribute("data-trigger-dock-side");
          }
          if (this.hiddenTriggerPeeking) {
            trigger.setAttribute("data-trigger-peeking", "true");
          }
        } else {
          trigger.removeAttribute("data-trigger-hidden");
          trigger.removeAttribute("data-trigger-peeking");
          trigger.removeAttribute("data-trigger-dock-side");
        }
        trigger.setAttribute(
          "style",
          createTriggerPositionStyle(this.triggerPosition),
        );
      }
    }
    this.triggerDragState = null;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.issueId = null;
    this.visualSuggestions?.restoreAll();
    this.consoleBuffer.restore();
    this.networkBuffer.restore();
    window.removeEventListener("keydown", this.handleShortcut);
    window.removeEventListener("pointermove", this.handleTriggerPeekPointerMove);
    window.removeEventListener("resize", this.handleViewportChange);
    window.removeEventListener("orientationchange", this.handleViewportChange);
    window.visualViewport?.removeEventListener(
      "resize",
      this.handleViewportChange,
    );
    this.clearStatusTimer();
    this.uninstallGlobalFileDropGuards();
    this.disconnectCardPlacementObserver();
    this.stopPinPositionTicker();
    this.uninstallPinScrollListener();
    this.uninstallPinResizeObserver();
    this.systemThemeCleanup?.();
    this.systemThemeCleanup = null;
    this.host.remove();
  }

  private applyTheme(theme: FeedbackSdkTheme): void {
    this.systemThemeCleanup?.();
    this.systemThemeCleanup = null;

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = (): void => {
        this.host.setAttribute("data-theme", mq.matches ? "dark" : "light");
      };
      apply();
      mq.addEventListener("change", apply);
      this.systemThemeCleanup = () => mq.removeEventListener("change", apply);
    } else {
      this.host.setAttribute("data-theme", theme);
    }
  }

  private readonly handleShortcut = (event: KeyboardEvent): void => {
    if (
      (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key === "."
    ) {
      event.preventDefault();
      if (this.isCardOpen()) {
        this.dismissCard();
      } else {
        this.openCard();
      }
    }
  };

  private readonly handleTriggerPeekPointerMove = (event: PointerEvent): void => {
    if (
      this.triggerPosition.hidden !== true ||
      this.triggerDragState
    ) {
      this.updateTriggerPeekState(false);
      return;
    }
    const nextPeeking = isPointerInTriggerPeekZone(
      { x: event.clientX, y: event.clientY },
      this.triggerPosition,
    );
    this.updateTriggerPeekState(nextPeeking);
  };

  private readonly handleViewportChange = (): void => {
    this.triggerPosition = clampTriggerPosition(this.triggerPosition);
    const trigger = queryHtmlElement(this.shadowRoot, ".obv-trigger");
    if (trigger) {
      trigger.setAttribute("data-trigger-corner", this.triggerPosition.corner);
      const isHidden =
        this.triggerPosition.hidden === true &&
        this.triggerPosition.dockSide !== undefined &&
        !this.isCardOpen();
      if (isHidden) {
        trigger.setAttribute("data-trigger-hidden", "true");
        trigger.setAttribute(
          "data-trigger-dock-side",
          this.triggerPosition.dockSide ?? "",
        );
      } else {
        trigger.removeAttribute("data-trigger-hidden");
        trigger.removeAttribute("data-trigger-peeking");
        trigger.removeAttribute("data-trigger-dock-side");
      }
      const triggerPosition = isHidden
        ? this.triggerPosition
        : {
            corner: this.triggerPosition.corner,
            offsetX: this.triggerPosition.offsetX,
            offsetY: this.triggerPosition.offsetY,
            hidden: false,
          };
      trigger.setAttribute(
        "style",
        createTriggerPositionStyle(triggerPosition),
      );
    }
    this.updateAnchoredFeedbackCard();
  };

  private renderTrigger(): void {
    this.uninstallGlobalFileDropGuards();
    this.disconnectCardPlacementObserver();
    this.activePanel = null;
    this.focusedItemId = null;
    this.selectedIssueId = null;

    this.shadowRoot.innerHTML = `${this.renderStyleTag()}${this.renderTriggerButton()}${this.renderPinLayer()}`;
    this.bindTrigger(() => this.handleTriggerActivate());
    this.bindPinLayer();

    if (this.annotationModeActive) {
      this.handleAnnotationModeTriggerClick();
      return;
    }
    if (this.shouldEnterAnnotationModeOnTrigger()) {
      // Note: do not auto-enter annotation mode just because the trigger
      // re-rendered. We only enter from a real click via handleTriggerActivate.
    }
  }

  private handleTriggerActivate(): void {
    if (this.annotationModeActive) {
      this.handleAnnotationModeTriggerClick();
      return;
    }
    if (this.isCardOpen()) {
      this.dismissCard();
      return;
    }
    if (this.shouldEnterAnnotationModeOnTrigger()) {
      this.enterAnnotationMode();
      return;
    }
    this.openCard();
  }

  private dismissCard(): void {
    const card = queryHtmlElement(this.shadowRoot, ".obv-card");
    if (!card) {
      this.renderTrigger();
      return;
    }
    if (this.shouldReduceMotion()) {
      this.renderTrigger();
      return;
    }
    const trigger = queryHtmlElement(this.shadowRoot, ".obv-trigger");
    if (trigger) {
      trigger.removeAttribute("data-card-open");
    }
    this.applyCardFlipVariables(card, trigger);
    card.setAttribute("data-card-anim", "exit");
    let finalized = false;
    const finalize = (): void => {
      if (finalized) return;
      finalized = true;
      card.removeEventListener("animationend", finalize);
      this.renderTrigger();
    };
    card.addEventListener("animationend", finalize, { once: true });
    window.setTimeout(finalize, 260);
  }

  private shouldReduceMotion(): boolean {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  private applyCardFlipVariables(
    card: HTMLElement,
    trigger: HTMLElement | null,
  ): void {
    if (!trigger) {
      return;
    }
    if (
      typeof card.getBoundingClientRect !== "function" ||
      typeof trigger.getBoundingClientRect !== "function" ||
      typeof card.style?.setProperty !== "function"
    ) {
      return;
    }
    const cardRect = card.getBoundingClientRect();
    const triggerRect = trigger.getBoundingClientRect();
    if (
      cardRect.width <= 0 ||
      cardRect.height <= 0 ||
      triggerRect.width <= 0 ||
      triggerRect.height <= 0
    ) {
      return;
    }
    // The card's anchor corner is overlapping the trigger anchor corner. We
    // scale non-uniformly so the card collapses to a square the size of the
    // trigger (giving a clean circular shape with border-radius). transform-
    // origin is configured in CSS per dialog direction, so no translate is
    // needed.
    const scaleX = triggerRect.width / cardRect.width;
    const scaleY = triggerRect.height / cardRect.height;
    card.style.setProperty("--obv-card-anim-scale-x", scaleX.toFixed(4));
    card.style.setProperty("--obv-card-anim-scale-y", scaleY.toFixed(4));
  }

  private clearCardFlipVariables(card: HTMLElement): void {
    if (typeof card.style?.removeProperty !== "function") {
      return;
    }
    card.style.removeProperty("--obv-card-anim-scale-x");
    card.style.removeProperty("--obv-card-anim-scale-y");
  }

  private inlineAnnotationsEnabled(): boolean {
    return this.config.inlineAnnotations?.enabled === true;
  }

  private shouldEnterAnnotationModeOnTrigger(): boolean {
    if (!this.inlineAnnotationsEnabled()) return false;
    if (this.config.previewOnly) return false;
    if (this.submittedIssueUrl) return false;
    if (this.statusCardIssueId) return false;
    if (this.activePanel !== null) return false;
    if (this.roundItems.length > 0) return false;
    return true;
  }

  private getFeedbackCardPlacement(
    variant: "form" | "status",
    measuredSize?: { width: number; height: number },
  ): FeedbackCardPlacement {
    const trigger = this.shadowRoot.querySelector(".obv-trigger");
    const estimatedHeight =
      variant === "form"
        ? FEEDBACK_FORM_ESTIMATED_HEIGHT_PX
        : FEEDBACK_STATUS_CARD_ESTIMATED_HEIGHT_PX;
    return createFeedbackCardPlacement(
      trigger,
      this.triggerPosition,
      estimatedHeight,
      measuredSize,
    );
  }

  private scheduleAnchoredFeedbackCardUpdate(): void {
    if (this.placementFrame !== null) {
      return;
    }
    if (!window.requestAnimationFrame) {
      this.updateAnchoredFeedbackCard();
      return;
    }
    this.placementFrame = window.requestAnimationFrame(() => {
      this.placementFrame = null;
      this.updateAnchoredFeedbackCard();
    });
  }

  private disconnectCardPlacementObserver(): void {
    if (this.placementFrame !== null) {
      const cancelFrame = window.cancelAnimationFrame ?? window.clearTimeout;
      cancelFrame(this.placementFrame);
      this.placementFrame = null;
    }
    this.cardResizeObserver?.disconnect();
    this.cardResizeObserver = null;
  }

  private observeAnchoredFeedbackCard(): void {
    this.disconnectCardPlacementObserver();
    const card = queryHtmlElement(this.shadowRoot, ".obv-card");
    if (!card) {
      return;
    }
    this.scheduleAnchoredFeedbackCardUpdate();
    if (typeof ResizeObserver !== "undefined") {
      this.cardResizeObserver = new ResizeObserver(() =>
        this.scheduleAnchoredFeedbackCardUpdate(),
      );
      this.cardResizeObserver.observe(card);
    }
  }

  private updateAnchoredFeedbackCard(): void {
    const card = queryHtmlElement(this.shadowRoot, ".obv-card");
    if (!card) {
      return;
    }
    if (card.hasAttribute("data-card-anim")) {
      return;
    }
    const measuredSize = { width: card.offsetWidth, height: card.offsetHeight };
    const placement = this.getFeedbackCardPlacement("form", measuredSize);
    card.setAttribute("style", placement.style);
    card.setAttribute("data-dialog-direction", placement.direction);
    card.setAttribute("data-trigger-corner", this.triggerPosition.corner);
  }

  private openCard(options: { error?: string | null } = {}): void {
    if ("error" in options) {
      this.feedbackFormError = options.error ?? null;
    }
    const wasOpen = this.activePanel !== null;
    if (!wasOpen) {
      this.activeSillyFeedbackMessage = shouldShowSillyFeedbackMessageOnLoad()
        ? getRandomSillyFeedbackMessage()
        : null;
    }
    this.activePanel = "unified";
    this.elementPickerOpen = false;
    const feedbackCardPlacement = this.getFeedbackCardPlacement("form");
    const panelContent = this.renderUnifiedPanel();
    this.shadowRoot.innerHTML = `
      ${this.renderStyleTag()}
      ${this.renderTriggerButton()}
      ${this.renderPinLayer()}
      <div class="obv-card" data-assistant-position="${escapeHtml(this.config.assistantPosition)}" data-trigger-corner="${escapeHtml(this.triggerPosition.corner)}" data-dialog-direction="${escapeHtml(feedbackCardPlacement.direction)}" style="${escapeHtml(feedbackCardPlacement.style)}">
        ${panelContent}
      </div>
    `;

    this.installGlobalFileDropGuards();
    this.bindTrigger(() => this.dismissCard());
    this.bindPinLayer();
    this.bindUnifiedPanel();
    // The initial placement above used an estimated height. Re-place once
    // synchronously now that we can measure the real rendered card so the
    // anchor corner lines up with the trigger before the enter animation
    // begins. Without this the card animates to the wrong final position.
    this.placeAnchoredFeedbackCardNow();
    if (!wasOpen) {
      this.playCardEnterAnimation();
      this.refreshIssueHistoryStatuses().catch(() => undefined);
    }
    this.observeAnchoredFeedbackCard();
  }

  private placeAnchoredFeedbackCardNow(): void {
    const card = queryHtmlElement(this.shadowRoot, ".obv-card");
    if (!card) return;
    const width = card.offsetWidth;
    const height = card.offsetHeight;
    if (
      typeof width !== "number" ||
      typeof height !== "number" ||
      width <= 0 ||
      height <= 0
    ) {
      return;
    }
    const placement = this.getFeedbackCardPlacement("form", {
      width,
      height,
    });
    card.setAttribute("style", placement.style);
    card.setAttribute("data-dialog-direction", placement.direction);
    card.setAttribute("data-trigger-corner", this.triggerPosition.corner);
  }

  private playCardEnterAnimation(): void {
    const card = queryHtmlElement(this.shadowRoot, ".obv-card");
    if (!card) return;
    if (this.shouldReduceMotion()) return;
    const trigger = queryHtmlElement(this.shadowRoot, ".obv-trigger");
    this.applyCardFlipVariables(card, trigger);
    card.setAttribute("data-card-anim", "enter");
    const clear = (): void => {
      card.removeAttribute("data-card-anim");
      this.clearCardFlipVariables(card);
      card.removeEventListener("animationend", clear);
    };
    card.addEventListener("animationend", clear, { once: true });
    window.setTimeout(clear, 360);
  }

  private renderUnifiedPanel(): string {
    const submitLabel = this.config.previewOnly
      ? "Preview only"
      : `${createIcon("arrow")}Fix with Autobuild`;
    const isSubmitDisabled =
      this.config.previewOnly || !this.hasRoundSubmitContent();

    if (this.submittedIssueUrl) {
      const safeUrl = getSafeExternalUrl(this.submittedIssueUrl);
      const linkHtml = safeUrl
        ? `<div class="obv-success-sub">You can track progress <a href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer">here</a>.</div>`
        : "";
      const closeShortcut = this.getShortcutLabel();
      return `
        <div class="obv-unified-panel">
          <div class="obv-card-scroll">
            <div class="obv-card-header">
              <div class="obv-kicker">${escapeHtml(this.activeSillyFeedbackMessage ?? "Feedback")}</div>
            </div>
            <div class="obv-success">
              <div class="obv-success-message">${createIcon("check")} Sent to Autobuild</div>
              ${linkHtml}
              <div class="obv-success-action">
                <button class="obv-button obv-button-secondary" type="button" data-new-feedback="true">${createIcon("plus")}New feedback</button>
                <span class="obv-shortcut-hint">${escapeHtml(closeShortcut)} to close</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="obv-unified-panel">
        <div class="obv-card-scroll">
          <div class="obv-card-header">
            <div class="obv-kicker">${escapeHtml(this.activeSillyFeedbackMessage ?? "Feedback")}</div>
          </div>
          ${this.config.previewOnly ? `<div class="obv-preview-note">${escapeHtml(this.config.previewOnlyReason)}</div>` : ""}
          ${this.feedbackFormError ? `<div class="obv-form-error" role="alert">${escapeHtml(this.feedbackFormError)}</div>` : ""}
          <div class="obv-list-body">
            ${this.renderRoundItemList()}
            ${this.visualSuggestions ? this.renderVisualSuggestionPalette() : ""}
          </div>
        </div>
        <div class="obv-list-footer">
          <div class="obv-footer-tools">
            <button class="obv-icon-button obv-footer-tool-btn" type="button" data-element-select-start="true" data-tooltip="Select element" aria-label="Select element">${createIcon("element")}</button>
            <button class="obv-icon-button obv-footer-tool-btn" type="button" data-measure-start="true" data-tooltip="Measure spacing" aria-label="Measure spacing">${createIcon("ruler")}</button>
            <button class="obv-icon-button obv-footer-tool-btn" type="button" data-attach-trigger="true" data-tooltip="Attach file" aria-label="Attach file">${createIcon("paperclip")}</button>
            <input class="obv-attachment-input" data-attachment-input="true" type="file" multiple tabindex="-1" aria-hidden="true" style="display:none" />
          </div>
          <button class="obv-button" type="button" data-submit-round="true" ${isSubmitDisabled ? 'disabled aria-disabled="true"' : ""} aria-keyshortcuts="${this.isMacPlatform() ? "Meta+Enter" : "Control+Enter"}">${submitLabel}</button>
        </div>
      </div>
    `;
  }

  private hasRoundSubmitContent(): boolean {
    return (
      this.roundItems.some((item) => item.description.trim().length > 0) ||
      this.newRowDraft.trim().length > 0
    );
  }

  private updateRoundSubmitButtonState(): void {
    const button = queryButtonElement(
      this.shadowRoot,
      '[data-submit-round="true"]',
    );
    if (!button) {
      return;
    }
    const isDisabled = this.config.previewOnly || !this.hasRoundSubmitContent();
    button.disabled = isDisabled;
    if (isDisabled) {
      button.setAttribute("disabled", "");
      button.setAttribute("aria-disabled", "true");
    } else {
      button.removeAttribute("disabled");
      button.removeAttribute("aria-disabled");
    }
  }

  private updateDraftIndicators(): void {
    this.updateRoundSubmitButtonState();
    this.updateTriggerDraftIndicator();
    this.emitOpenIssueCountChange();
  }

  private updateTriggerDraftIndicator(): void {
    const trigger = queryHtmlElement(this.shadowRoot, ".obv-trigger");
    if (!trigger) {
      return;
    }
    const draftCount = this.getDraftItemCount();
    trigger.setAttribute(
      "data-issue-status",
      draftCount > 0 ? "draft" : "idle",
    );
    trigger.setAttribute("aria-label", this.getTriggerStatusLabel());

    const existingRing = trigger.querySelector(".obv-trigger-ring");
    const existingBadge = trigger.querySelector(".obv-trigger-badge");
    existingBadge?.remove();
    if (draftCount === 0) {
      existingRing?.remove();
      return;
    }

    if (!existingRing) {
      const ring = document.createElement("span");
      ring.className = "obv-trigger-ring";
      ring.setAttribute("data-status", "draft");
      ring.setAttribute("aria-hidden", "true");
      trigger.appendChild(ring);
    }

  }

  private bindUnifiedPanel(): void {
    this.shadowRoot
      .querySelector(".obv-card-header")
      ?.addEventListener("dblclick", (event) => {
        if (targetElement(event)?.closest(".obv-kicker")) {
          this.showSillyFeedbackMessage();
        }
      });

    this.shadowRoot
      .querySelector('[data-close-panel="true"]')
      ?.addEventListener("click", () => {
        this.renderTrigger();
      });

    this.shadowRoot
      .querySelector('[data-new-feedback="true"]')
      ?.addEventListener("click", () => {
        this.submittedIssueUrl = null;
        this.openCard();
      });

    if (this.submittedIssueUrl) {
      return;
    }

    this.bindListRows();
    this.bindFooterTools();
    this.bindVisualSuggestions();

    this.shadowRoot
      .querySelector('[data-submit-round="true"]')
      ?.addEventListener("click", () => {
        if (this.config.previewOnly) {
          this.feedbackFormError = this.config.previewOnlyReason;
          this.openCard();
          return;
        }
        this.syncAllInputsToRoundItems();
        const newText = this.newRowDraft.trim();
        if (newText && this.roundItems.length < MAX_ROUND_ITEMS) {
          const visualSuggestions =
            this.activeVisualSuggestionItemId === null
              ? (this.visualSuggestions?.commitCurrentLine() ?? [])
              : [];
          this.roundItems = [
            ...this.roundItems,
            {
              id: createRoundItemId(),
              description: newText,
              elementGrabs:
                this.elementGrabItems.length > 0
                  ? [...this.elementGrabItems]
                  : undefined,
              measurements:
                this.measurementItems.length > 0
                  ? [...this.measurementItems]
                  : undefined,
              visualSuggestions:
                visualSuggestions.length > 0 ? visualSuggestions : undefined,
              attachmentTokens:
                this.getReadyAttachmentTokens().length > 0
                  ? this.getReadyAttachmentTokens()
                  : undefined,
            },
          ];
          this.clearSubmissionDraftState();
        }
        this.roundItems = this.roundItems.filter(
          (item) => item.description.trim().length > 0,
        );
        this.feedbackFormError = null;
        this.handleSubmitRound();
      });

    const targetId = this.focusedItemId ?? "__new";
    const targetInput = queryInputElement(
      this.shadowRoot,
      `[data-item-input="${CSS.escape(targetId)}"]`,
    );
    if (targetInput) {
      targetInput.focus();
      const targetValue =
        typeof targetInput.value === "string" ? targetInput.value : "";
      if (typeof targetInput.setSelectionRange === "function") {
        targetInput.setSelectionRange(targetValue.length, targetValue.length);
      }
    }
  }

  private syncAllInputsToRoundItems(): void {
    for (const item of this.roundItems) {
      const input = queryInputElement(
        this.shadowRoot,
        `[data-item-input="${CSS.escape(item.id)}"]`,
      );
      if (input && typeof input.value === "string") {
        item.description = input.value;
      }
    }
    const newInput = queryInputElement(
      this.shadowRoot,
      '[data-item-input="__new"]',
    );
    if (newInput && typeof newInput.value === "string") {
      this.newRowDraft = newInput.value;
    }
  }

  private bindListRows(): void {
    queryInputElements(this.shadowRoot, "[data-item-input]").forEach((input) => {
      const itemId = input.getAttribute("data-item-input") ?? "";

      input.addEventListener("focus", () => {
        this.focusedItemId = itemId === "__new" ? "__new" : itemId;
      });

      input.addEventListener("blur", (event) => {
        if (itemId === "__new") {
          return;
        }
        if (typeof input.value === "string" && input.value.trim() !== "") {
          return;
        }
        const next =
          event instanceof FocusEvent ? event.relatedTarget : null;
        if (!(next instanceof HTMLElement)) {
          return;
        }
        if (!next.closest(".obv-unified-panel")) {
          return;
        }
        if (next.closest(".obv-list-footer")) {
          this.focusedItemId = itemId;
          return;
        }
        const stillExists = this.roundItems.some(
          (candidate) => candidate.id === itemId,
        );
        if (!stillExists) {
          return;
        }
        this.roundItems = this.roundItems.filter(
          (candidate) => candidate.id !== itemId,
        );
        const nextItemId = next.getAttribute("data-item-input");
        this.focusedItemId = nextItemId ?? null;
        this.persistDraftRound();
        this.emitOpenIssueCountChange();
        this.openCard();
      });

      input.addEventListener("input", () => {
        if (itemId === "__new") {
          this.newRowDraft = input.value;
          this.updateRoundSubmitButtonState();
          return;
        }
        const item = this.roundItems.find(
          (candidate) => candidate.id === itemId,
        );
        if (item) {
          item.description = input.value;
        }
        this.updateDraftIndicators();
      });

      input.addEventListener("keydown", (event) => {
        if (!isKeyboardEvent(event)) {
          return;
        }

        if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey) &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          const submitButton = queryHtmlElement(
            this.shadowRoot,
            '[data-submit-round="true"]',
          );
          if (submitButton instanceof HTMLButtonElement && !submitButton.disabled) {
            submitButton.click();
          }
          return;
        }

        if (event.key === "Enter") {
          event.preventDefault();
          if (itemId === "__new") {
            const text = input.value.trim();
            if (!text) {
              return;
            }
            if (this.roundItems.length >= MAX_ROUND_ITEMS) {
              this.feedbackFormError = `Round is full (max ${MAX_ROUND_ITEMS} items).`;
              this.openCard();
              return;
            }
            const visualSuggestions =
              this.activeVisualSuggestionItemId === null
                ? (this.visualSuggestions?.commitCurrentLine() ?? [])
                : [];
            const newItem: FeedbackRoundItem = {
              id: createRoundItemId(),
              description: text,
              elementGrabs:
                this.elementGrabItems.length > 0
                  ? [...this.elementGrabItems]
                  : undefined,
              measurements:
                this.measurementItems.length > 0
                  ? [...this.measurementItems]
                  : undefined,
              visualSuggestions:
                visualSuggestions.length > 0 ? visualSuggestions : undefined,
              attachmentTokens:
                this.getReadyAttachmentTokens().length > 0
                  ? this.getReadyAttachmentTokens()
                  : undefined,
            };
            this.roundItems = [...this.roundItems, newItem];
            this.clearSubmissionDraftState();
            this.newRowDraft = "";
            this.persistDraftRound();
            this.emitOpenIssueCountChange();
            this.openCard();
          } else {
            this.syncAllInputsToRoundItems();
            this.persistDraftRound();
            if (this.roundItems.length >= MAX_ROUND_ITEMS) {
              return;
            }
            const currentIndex = this.roundItems.findIndex(
              (candidate) => candidate.id === itemId,
            );
            const newItem: FeedbackRoundItem = {
              id: createRoundItemId(),
              description: "",
            };
            this.roundItems = [
              ...this.roundItems.slice(0, currentIndex + 1),
              newItem,
              ...this.roundItems.slice(currentIndex + 1),
            ];
            this.focusedItemId = newItem.id;
            this.persistDraftRound();
            this.emitOpenIssueCountChange();
            this.openCard();
          }
          return;
        }

        if (event.key === "Backspace" && input.value === "") {
          event.preventDefault();
          if (itemId === "__new") {
            if (this.roundItems.length > 0) {
              const lastItem = this.roundItems[this.roundItems.length - 1];
              this.focusedItemId = lastItem.id;
              this.openCard();
            }
            return;
          }
          const currentIndex = this.roundItems.findIndex(
            (candidate) => candidate.id === itemId,
          );
          this.roundItems = this.roundItems.filter(
            (candidate) => candidate.id !== itemId,
          );
          this.persistDraftRound();
          this.emitOpenIssueCountChange();
          const prevItem = this.roundItems[Math.max(0, currentIndex - 1)];
          this.focusedItemId = prevItem?.id ?? "__new";
          this.openCard();
          return;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          const allInputs = queryInputElements(
            this.shadowRoot,
            "[data-item-input]",
          );
          const currentIdx = allInputs.indexOf(input);
          const next = allInputs[currentIdx + 1];
          if (next) {
            next.focus();
            next.setSelectionRange?.(next.value.length, next.value.length);
          }
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          const allInputs = queryInputElements(
            this.shadowRoot,
            "[data-item-input]",
          );
          const currentIdx = allInputs.indexOf(input);
          const prev = allInputs[currentIdx - 1];
          if (prev) {
            prev.focus();
            prev.setSelectionRange?.(prev.value.length, prev.value.length);
          }
          return;
        }

        if (event.key === "Escape") {
          input.blur();
          this.focusedItemId = null;
        }
      });
    });

    this.shadowRoot
      .querySelectorAll("[data-pin-comment-open]")
      .forEach((target) => {
        target.addEventListener("click", (event) => {
          if (targetElement(event)?.closest(".obv-row-pill-x")) {
            return;
          }
          const itemId = target.getAttribute("data-pin-comment-open");
          if (!itemId) return;
          event.preventDefault();
          event.stopPropagation();
          this.openPinnedItemComment(itemId);
        });
        target.addEventListener("keydown", (event) => {
          if (!isKeyboardEvent(event)) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          const itemId = target.getAttribute("data-pin-comment-open");
          if (!itemId) return;
          event.preventDefault();
          event.stopPropagation();
          this.openPinnedItemComment(itemId);
        });
      });
  }

  private openPinnedItemComment(itemId: string): void {
    const item = this.roundItems.find((candidate) => candidate.id === itemId);
    if (!item?.pin) return;
    this.syncAllInputsToRoundItems();
    this.persistDraftRound();
    this.pendingPinSourceItemId = null;
    this.annotationReturnToCardAfterSubmit = true;
    this.handlePinClick(itemId);
  }

  private getPendingPinSourceItemId(): string | "__new" | null {
    if (
      this.focusedItemId &&
      this.focusedItemId !== "__new" &&
      this.roundItems.some((item) => item.id === this.focusedItemId)
    ) {
      return this.focusedItemId;
    }
    if (this.focusedItemId === "__new" || this.newRowDraft.trim().length > 0) {
      return "__new";
    }
    return null;
  }

  private getPendingPinSourceText(): string {
    const sourceId = this.pendingPinSourceItemId;
    if (!sourceId) return "";
    if (sourceId === "__new") return this.newRowDraft;
    return (
      this.roundItems.find((item) => item.id === sourceId)?.description ?? ""
    );
  }

  private bindFooterTools(): void {
    this.shadowRoot
      .querySelector('[data-element-select-start="true"]')
      ?.addEventListener("click", () => {
        this.syncAllInputsToRoundItems();
        if (this.inlineAnnotationsEnabled()) {
          this.pendingPinSourceItemId = this.getPendingPinSourceItemId();
          this.enterAnnotationMode({ returnToCardAfterSubmit: true });
          return;
        }
        this.renderElementPickerOverlay();
      });
    this.shadowRoot
      .querySelector('[data-attach-trigger="true"]')
      ?.addEventListener("click", () => {
        const fileInput = queryInputElement(
          this.shadowRoot,
          '[data-attachment-input="true"]',
        );
        fileInput?.click();
      });
    this.shadowRoot
      .querySelector('[data-measure-start="true"]')
      ?.addEventListener("click", () => {
        this.syncAllInputsToRoundItems();
        if (this.roundItems.length === 0 && this.newRowDraft.trim().length === 0) {
          this.focusedItemId = "__new";
        }
        this.measurementSourceItemId = this.getPendingPinSourceItemId();
        this.renderRulerOverlay();
      });
    const fileInput = queryInputElement(
      this.shadowRoot,
      '[data-attachment-input="true"]',
    );
    fileInput?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    fileInput?.addEventListener("change", () => {
      if (fileInput) {
        this.addAttachmentFiles(Array.from(fileInput.files ?? []));
        fileInput.value = "";
      }
    });
    this.shadowRoot
      .querySelector(".obv-list-body")
      ?.addEventListener("paste", (event) => {
        if (!isClipboardEvent(event)) {
          return;
        }
        const files = Array.from(event.clipboardData?.files ?? []);
        const itemFiles = Array.from(event.clipboardData?.items ?? [])
          .filter((item) => item.kind === "file")
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        this.addAttachmentFiles(files.length > 0 ? files : itemFiles);
      });
    this.bindElementGrabChips();
    this.shadowRoot
      .querySelectorAll("[data-attachment-remove]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute(
            "data-attachment-remove",
          );
          if (id) {
            this.removeAttachment(id);
          }
        });
      });
    this.shadowRoot.querySelectorAll("[data-remove-grab]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-remove-grab");
        if (id) {
          this.syncAllInputsToRoundItems();
          this.elementGrabItems = this.elementGrabItems.filter(
            (grab) => grab.id !== id,
          );
          this.openCard();
        }
      });
    });
    this.shadowRoot
      .querySelectorAll("[data-remove-attachment]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute(
            "data-remove-attachment",
          );
          if (id) {
            this.syncAllInputsToRoundItems();
            this.feedbackAttachments = this.feedbackAttachments.filter(
              (a) => a.id !== id,
            );
            this.openCard();
          }
        });
      });
    this.shadowRoot
      .querySelectorAll("[data-remove-measurement]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute(
            "data-remove-measurement",
          );
          if (id) {
            this.syncAllInputsToRoundItems();
            this.measurementItems = this.measurementItems.filter(
              (m) => m.id !== id,
            );
            this.openCard();
          }
        });
      });
    this.shadowRoot
      .querySelectorAll("[data-remove-vs-element]")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const id = button.getAttribute(
            "data-remove-vs-element",
          );
          if (id && this.visualSuggestions) {
            this.visualSuggestions.removeElement(id);
            this.openCard();
          }
        });
      });
    this.shadowRoot
      .querySelectorAll("[data-item-remove-grab]")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          event.preventDefault();
          const value = button.getAttribute(
            "data-item-remove-grab",
          );
          if (value) {
            const [itemId, grabId] = value.split(":");
            this.syncAllInputsToRoundItems();
            const item = this.roundItems.find((r) => r.id === itemId);
            if (item && item.elementGrabs) {
              item.elementGrabs = item.elementGrabs.filter(
                (g) => g.id !== grabId,
              );
              if (item.elementGrabs.length === 0) {
                item.elementGrabs = undefined;
              }
              if (item.pin?.elementGrabId === grabId) {
                if (item.visualSuggestions) {
                  this.visualSuggestions?.removeSuggestions(
                    item.visualSuggestions.map((suggestion) => suggestion.id),
                  );
                }
                item.pin = undefined;
                item.visualSuggestions = undefined;
              }
            }
            this.persistDraftRound();
            this.openCard();
          }
        });
      });
    this.shadowRoot
      .querySelectorAll("[data-item-remove-file]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const value = button.getAttribute(
            "data-item-remove-file",
          );
          if (value) {
            const [itemId, indexStr] = value.split(":");
            const index = Number(indexStr);
            this.syncAllInputsToRoundItems();
            const item = this.roundItems.find((r) => r.id === itemId);
            if (item && item.attachmentTokens) {
              item.attachmentTokens = item.attachmentTokens.filter(
                (_, i) => i !== index,
              );
              if (item.attachmentTokens.length === 0) {
                item.attachmentTokens = undefined;
              }
            }
            this.persistDraftRound();
            this.openCard();
          }
        });
      });
    this.shadowRoot
      .querySelectorAll("[data-item-remove-measurement]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const value = button.getAttribute(
            "data-item-remove-measurement",
          );
          if (value) {
            const [itemId, measurementId] = value.split(":");
            this.syncAllInputsToRoundItems();
            const item = this.roundItems.find((r) => r.id === itemId);
            if (item && item.measurements) {
              item.measurements = item.measurements.filter(
                (m) => m.id !== measurementId,
              );
              if (item.measurements.length === 0) {
                item.measurements = undefined;
              }
            }
            this.persistDraftRound();
            this.openCard();
          }
        });
      });
    this.shadowRoot
      .querySelectorAll("[data-item-remove-vs]")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const value = button.getAttribute(
            "data-item-remove-vs",
          );
          if (value) {
            const [itemId, idsValue] = value.split(":");
            const ids =
              idsValue?.split(",").filter((id) => id.length > 0) ?? [];
            this.syncAllInputsToRoundItems();
            const item = this.roundItems.find((r) => r.id === itemId);
            if (item && item.visualSuggestions) {
              item.visualSuggestions = item.visualSuggestions.filter(
                (suggestion) => !ids.includes(suggestion.id),
              );
              if (item.visualSuggestions.length === 0) {
                item.visualSuggestions = undefined;
              }
            }
            if (ids.length > 0) {
              this.visualSuggestions?.removeSuggestions(ids);
            }
            if (
              itemId === this.activeVisualSuggestionItemId &&
              !(item?.visualSuggestions && item.visualSuggestions.length > 0)
            ) {
              this.activeVisualSuggestionItemId = null;
            }
            this.persistDraftRound();
            this.openCard();
          }
        });
      });
    this.shadowRoot
      .querySelectorAll("[data-item-vs-activate]")
      .forEach((pill) => {
        pill.addEventListener("click", () => {
          const value = pill.getAttribute(
            "data-item-vs-activate",
          );
          if (!value) return;
          const [itemId, elementId] = value.split(":");
          const item = this.roundItems.find(
            (candidate) => candidate.id === itemId,
          );
          if (!item?.visualSuggestions) return;
          const group = this.groupVisualSuggestionsByElement(
            item.visualSuggestions,
          ).find((candidate) => candidate.element.id === elementId);
          if (!group) return;
          this.activateVisualSuggestionElement(
            group.element,
            group.items,
            itemId,
          );
        });
      });
  }

  private showSillyFeedbackMessage(): void {
    this.syncAllInputsToRoundItems();
    this.activeSillyFeedbackMessage = getRandomSillyFeedbackMessage();
    this.openCard();
  }

  private handleSubmitRound(): void {
    const itemsToSubmit = [...this.roundItems];
    if (itemsToSubmit.length === 0) {
      this.openCard({
        error: "Add at least one feedback item before submitting.",
      });
      return;
    }
    if (itemsToSubmit.length === 1) {
      const singleItem = itemsToSubmit[0];
      const input: FeedbackSubmissionInput = {
        type: DEFAULT_FEEDBACK_ISSUE_TYPE,
        severity: DEFAULT_FEEDBACK_ISSUE_SEVERITY,
        description: singleItem.description,
        attachmentTokens: singleItem.attachmentTokens,
      };
      this.elementGrabItems = singleItem.elementGrabs ?? this.elementGrabItems;
      this.measurementItems = singleItem.measurements ?? this.measurementItems;
      this.submitFeedback(input).catch((err: unknown) => {
        this.syncAllInputsToRoundItems();
        this.openCard({
          error:
            err instanceof Error ? err.message : "Failed to submit feedback",
        });
      });
      return;
    }
    this.submitFeedbackRound(itemsToSubmit).catch((err: unknown) => {
      this.syncAllInputsToRoundItems();
      this.openCard({
        error: err instanceof Error ? err.message : "Failed to submit feedback",
      });
    });
  }

  private async submitFeedbackRound(items: FeedbackRoundItem[]): Promise<void> {
    const sessionReplayUrl = await this.resolveSessionReplayUrl({
      type: "improvement",
      description: items.map((item) => item.description).join("\n\n---\n\n"),
    });
    const roundPayloadItems = items.map((item) => ({
      description: item.description,
      elementGrabs: item.elementGrabs ?? undefined,
      measurements: item.measurements ?? undefined,
      attachmentTokens: item.attachmentTokens ?? undefined,
    }));
    const response = await fetch(
      createFeedbackRoundSubmitUrl(this.config.apiBaseUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: this.config.publicKey,
          identityToken: this.config.identityToken,
          sessionReplayUrl,
          env: this.config.env,
          prNumber: this.config.prNumber,
          sourceUrl: redactUrl(window.location.href),
          sdkVersion: SDK_VERSION,
          items: roundPayloadItems,
          domSnapshot: this.config.capturePageContext
            ? serializeDomSnapshot(document.body, this.config.redactSelectors)
            : undefined,
          consoleLogs: this.consoleBuffer.read(),
          networkLog: this.networkBuffer.read(),
          context: this.buildSubmissionContext(),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Feedback submission failed (${response.status})`);
    }

    const payload = await response.json();
    const data = isRecord(payload) ? getRecordField(payload, "data") : null;
    const status = data?.status;
    if (this.destroyed) {
      return;
    }
    this.issueId = getStringField(data, "issueId") ?? null;
    this.statusPollIndex = 0;
    this.clearStatusTimer();
    if (this.issueId) {
      this.rememberIssueHistoryEntry({
        issueId: this.issueId,
        status: isFeedbackClientStatus(status) ? status : "received",
        title: getStringField(data, "title"),
        reportedAt: getStringField(data, "reportedAt"),
        workerThread: normalizeWorkerThreadLink(data?.workerThread),
      });
    }
    this.roundItems = [];
    this.focusedItemId = null;
    this.clearSubmissionDraftState();
    this.visualSuggestions?.restoreAll();
    this.feedbackFormError = null;
    this.submittedIssueUrl = getStringField(data, "issueUrl") ?? null;
    this.persistDraftRound();
    this.emitOpenIssueCountChange();
    this.openCard();
    this.scheduleStatusPoll(this.issueId);
  }

  private persistDraftRound(): void {
    persistDraftRound(this.draftRoundStorageKey, this.roundItems);
  }

  private bindElementGrabChips(): void {
    this.shadowRoot
      .querySelectorAll("[data-element-grab-remove]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute("data-element-grab-remove");
          if (id) {
            this.syncAllInputsToRoundItems();
            this.elementGrabItems = this.elementGrabItems.filter(
              (item) => item.id !== id,
            );
            this.openCard();
          }
        });
      });
  }

  private renderElementGrabChipList(): string {
    if (this.elementGrabItems.length === 0) {
      return "";
    }
    const chips = this.elementGrabItems
      .map((item) => {
        const displayName = getElementGrabDisplayName(item);
        return `<div class="obv-element-grab-chip"><span class="obv-element-grab-chip-name">${createIcon("element")}<span>${escapeHtml(displayName)}</span></span><button class="obv-icon-button obv-element-grab-remove" type="button" aria-label="Remove ${escapeHtml(displayName)}" data-element-grab-remove="${escapeHtml(item.id)}">${createIcon("close")}</button></div>`;
      })
      .join("");
    return `<div class="obv-element-grab-list">${chips}</div>`;
  }

  private renderAttachmentsDropzone(): string {
    const list =
      this.feedbackAttachments.length > 0
        ? `<div class="obv-attachment-list">${this.feedbackAttachments.map((attachment) => this.renderAttachmentChip(attachment)).join("")}</div>`
        : "";
    return `<div class="obv-attachment-dropzone" data-attachment-dropzone="true" role="button" tabindex="0" aria-label="Add feedback attachments"><span class="obv-attachment-prompt">${createIcon("paperclip")}<span>Drop files here or paste screenshots/files. ${this.feedbackAttachments.length}/${MAX_FEEDBACK_ATTACHMENTS} attached.</span></span><input class="obv-attachment-input" data-attachment-input="true" type="file" multiple tabindex="-1" aria-hidden="true" />${list}</div>`;
  }

  private renderAttachmentChip(attachment: FeedbackAttachmentUpload): string {
    const status =
      attachment.status === "ready"
        ? "Ready"
        : attachment.status === "uploading"
          ? "Uploading…"
          : "Upload failed";
    const statusDetail =
      attachment.status === "error" && attachment.error
        ? attachment.error
        : status;
    return `<div class="obv-attachment-chip" data-status="${escapeHtml(attachment.status)}"><div><span class="obv-attachment-name">${createIcon("paperclip")}<span class="obv-attachment-name-text">${escapeHtml(attachment.name)}</span></span><span class="obv-attachment-meta">${escapeHtml(statusDetail)} • ${escapeHtml(attachment.mimeType)} • ${formatAttachmentSize(attachment.sizeBytes)}</span></div><button class="obv-icon-button obv-attachment-remove" type="button" aria-label="Remove ${escapeHtml(attachment.name)}" data-attachment-remove="${escapeHtml(attachment.id)}">${createIcon("close")}</button></div>`;
  }

  private isFileDragEvent(event: DragEvent): boolean {
    const types = Array.from(event.dataTransfer?.types ?? []);
    return (
      types.includes("Files") || (event.dataTransfer?.files?.length ?? 0) > 0
    );
  }

  private eventTargetsFeedbackWidget(event: Event): boolean {
    const path: readonly unknown[] =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    return path.includes(this.host);
  }

  private readonly guardGlobalFileDragEvent = (event: Event): void => {
    if (!isDragEvent(event) || !this.isFileDragEvent(event)) {
      return;
    }
    event.preventDefault();
    if (!this.eventTargetsFeedbackWidget(event)) {
      event.stopImmediatePropagation?.();
      event.stopPropagation();
    }
  };

  private readonly guardGlobalFileDragLeaveEvent = (event: Event): void => {
    if (
      !isDragEvent(event) ||
      !this.isFileDragEvent(event) ||
      this.eventTargetsFeedbackWidget(event)
    ) {
      return;
    }
    event.stopImmediatePropagation?.();
    event.stopPropagation();
  };

  private readonly guardGlobalFileDropEvent = (event: Event): void => {
    if (!isDragEvent(event) || !this.isFileDragEvent(event)) {
      return;
    }
    event.preventDefault();
    if (!this.eventTargetsFeedbackWidget(event)) {
      return;
    }
    event.stopImmediatePropagation?.();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      this.addAttachmentFiles(files);
    }
  };
  private installGlobalFileDropGuards(): void {
    if (this.globalFileDropGuardsInstalled) {
      return;
    }
    const options = { capture: true };
    for (const target of [window, document]) {
      target.addEventListener(
        "dragenter",
        this.guardGlobalFileDragEvent,
        options,
      );
      target.addEventListener(
        "dragover",
        this.guardGlobalFileDragEvent,
        options,
      );
      target.addEventListener(
        "dragleave",
        this.guardGlobalFileDragLeaveEvent,
        options,
      );
      target.addEventListener("drop", this.guardGlobalFileDropEvent, options);
    }
    this.globalFileDropGuardsInstalled = true;
  }

  private uninstallGlobalFileDropGuards(): void {
    if (!this.globalFileDropGuardsInstalled) {
      return;
    }
    const options = { capture: true };
    for (const target of [window, document]) {
      target.removeEventListener(
        "dragenter",
        this.guardGlobalFileDragEvent,
        options,
      );
      target.removeEventListener(
        "dragover",
        this.guardGlobalFileDragEvent,
        options,
      );
      target.removeEventListener(
        "dragleave",
        this.guardGlobalFileDragLeaveEvent,
        options,
      );
      target.removeEventListener(
        "drop",
        this.guardGlobalFileDropEvent,
        options,
      );
    }
    this.globalFileDropGuardsInstalled = false;
  }

  private bindAttachmentControls(): void {
    const form = this.shadowRoot.querySelector("form");
    const dropzone = queryHtmlElement(this.shadowRoot, "[data-attachment-dropzone]");
    const fileInput = queryInputElement(this.shadowRoot, "[data-attachment-input]");
    const stopAttachmentDropEvent = (event: Event): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    const addDroppedFiles = (event: Event): void => {
      if (!isDragEvent(event)) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      stopAttachmentDropEvent(event);
      this.addAttachmentFiles(files);
    };
    form?.addEventListener("dragover", (event) => {
      if (isDragEvent(event) && event.dataTransfer?.types.includes("Files")) {
        stopAttachmentDropEvent(event);
      }
    });
    form?.addEventListener("drop", addDroppedFiles);
    dropzone?.addEventListener("dragenter", stopAttachmentDropEvent);
    dropzone?.addEventListener("dragover", stopAttachmentDropEvent);
    dropzone?.addEventListener("drop", addDroppedFiles);
    dropzone?.addEventListener("click", (event) => {
      if (targetElement(event)?.closest("[data-attachment-remove]")) {
        return;
      }
      fileInput?.click();
    });
    dropzone?.addEventListener("keydown", (event) => {
      if (!isKeyboardEvent(event)) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      fileInput?.click();
    });
    fileInput?.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    fileInput?.addEventListener("change", () => {
      this.addAttachmentFiles(Array.from(fileInput.files ?? []));
      fileInput.value = "";
    });
    form?.addEventListener("paste", (event) => {
      if (!isClipboardEvent(event)) {
        return;
      }
      const files = Array.from(event.clipboardData?.files ?? []);
      const itemFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      this.addAttachmentFiles(files.length > 0 ? files : itemFiles);
    });
    this.shadowRoot
      .querySelectorAll("[data-attachment-remove]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const id = button.getAttribute(
            "data-attachment-remove",
          );
          if (id) {
            this.removeAttachment(id);
          }
        });
      });
  }

  private isCardOpen(): boolean {
    return this.activePanel !== null;
  }

  private getCommittedVisualSuggestionIds(): Set<string> {
    const ids = new Set<string>();
    for (const item of this.roundItems) {
      for (const suggestion of item.visualSuggestions ?? []) {
        ids.add(suggestion.id);
      }
    }
    return ids;
  }

  private getUncommittedVisualSuggestions(): FeedbackVisualSuggestion[] {
    const all = this.visualSuggestions?.getItems() ?? [];
    const committed = this.getCommittedVisualSuggestionIds();
    return all.filter((suggestion) => !committed.has(suggestion.id));
  }

  private groupVisualSuggestionsByElement(
    suggestions: readonly FeedbackVisualSuggestion[],
  ): Array<{
    element: FeedbackVisualSuggestionElementRef;
    items: FeedbackVisualSuggestion[];
  }> {
    const groups = new Map<
      string,
      {
        element: FeedbackVisualSuggestionElementRef;
        items: FeedbackVisualSuggestion[];
      }
    >();
    for (const suggestion of suggestions) {
      const existing = groups.get(suggestion.element.id);
      if (existing) {
        existing.items.push(suggestion);
      } else {
        groups.set(suggestion.element.id, {
          element: suggestion.element,
          items: [suggestion],
        });
      }
    }
    return [...groups.values()];
  }

  private activateVisualSuggestionElement(
    element: FeedbackVisualSuggestionElementRef,
    suggestions: readonly FeedbackVisualSuggestion[],
    itemId: string | null,
  ): void {
    const manager = this.visualSuggestions;
    if (!manager) return;
    const previewedElement = manager.getPreviewedElement(element.id);
    if (!previewedElement) return;
    manager.activateElementWithSuggestions(
      previewedElement,
      element,
      suggestions,
    );
    this.visualSuggestionScopeOptions = [
      {
        kind: "element",
        label: "This",
        targets: [{ element: previewedElement, ref: element }],
        scope: {
          kind: "element",
          label: "This element",
          matchedCount: 1,
        },
      },
    ];
    this.visualSuggestionTargetOptions = [
      {
        id: element.id,
        kind: getVisualSuggestionTargetKind(previewedElement),
        label: getVisualSuggestionTargetLabel(previewedElement),
        element: previewedElement,
        ref: element,
        scopeOptions: this.visualSuggestionScopeOptions,
      },
    ];
    this.activeVisualSuggestionItemId = itemId;
    this.openCard();
  }

  private syncActiveVisualSuggestionItem(): void {
    const manager = this.visualSuggestions;
    const itemId = this.activeVisualSuggestionItemId;
    if (!manager || !itemId) return;
    const active = manager.getActiveElement();
    if (!active) return;
    const item = this.roundItems.find((candidate) => candidate.id === itemId);
    if (!item) {
      this.activeVisualSuggestionItemId = null;
      return;
    }
    const activeSuggestions = manager
      .getItems()
      .filter((suggestion) => suggestion.element.id === active.ref.id);
    const remainingSuggestions = (item.visualSuggestions ?? []).filter(
      (suggestion) => suggestion.element.id !== active.ref.id,
    );
    item.visualSuggestions =
      remainingSuggestions.length > 0 || activeSuggestions.length > 0
        ? [...remainingSuggestions, ...activeSuggestions]
        : undefined;
    this.persistDraftRound();
  }

  private activateInlineVisualSuggestionsForItem(item: FeedbackRoundItem): void {
    const manager = this.visualSuggestions;
    const pin = item.pin;
    if (!manager || !pin) return;
    const grab = item.elementGrabs?.find(
      (candidate) => candidate.id === pin.elementGrabId,
    );
    if (!grab) return;
    const liveElement = resolvePinElement(grab.cssSelector, null);
    if (!(liveElement instanceof HTMLElement)) return;
    this.visualSuggestionTargetOptions = [];
    this.visualSuggestionScopeOptions = [];
    if (item.visualSuggestions && item.visualSuggestions.length > 0) {
      const ref = item.visualSuggestions[0].element;
      const previewedElement = manager.getPreviewedElement(ref.id);
      manager.applySuggestions(
        previewedElement ?? liveElement,
        ref,
        item.visualSuggestions,
      );
      return;
    }
    manager.setActiveElement(liveElement, grab);
  }

  private saveActiveInlineVisualSuggestionsToItem(itemId: string): void {
    const manager = this.visualSuggestions;
    if (!manager?.getActiveElement()) return;
    const visualSuggestions = manager.commitCurrentLine();
    this.roundItems = this.roundItems.map((item) =>
      item.id === itemId
        ? {
            ...item,
            visualSuggestions:
              visualSuggestions.length > 0 ? visualSuggestions : undefined,
          }
        : item,
    );
    this.persistDraftRound();
    this.emitOpenIssueCountChange();
  }

  private closeVisualSuggestionPalette(): void {
    const manager = this.visualSuggestions;
    if (!manager) return;
    if (this.activeVisualSuggestionItemId) {
      this.syncActiveVisualSuggestionItem();
      manager.commitCurrentLine();
      this.activeVisualSuggestionItemId = null;
    } else {
      manager.closeActiveElement();
    }
    this.visualSuggestionTargetOptions = [];
    this.visualSuggestionScopeOptions = [];
    this.openCard();
  }

  private renderItemPills(item: FeedbackRoundItem): string {
    const pills: string[] = [];
    if (item.elementGrabs) {
      for (const grab of item.elementGrabs) {
        const displayName = getElementGrabDisplayName(grab);
        const visualSummary =
          item.pin?.elementGrabId === grab.id && item.visualSuggestions
            ? this.getVisualSuggestionPillSummary(item.visualSuggestions)
            : null;
        const pillLabel = visualSummary
          ? `${displayName} · ${visualSummary}`
          : displayName;
        const pillActionClass = item.pin ? " obv-row-pill-action" : "";
        const openPinAttrs = item.pin
          ? ` data-pin-comment-open="${escapeHtml(item.id)}" role="button" tabindex="0" aria-label="Open comment for ${escapeHtml(displayName)}"`
          : "";
        pills.push(
          `<span class="obv-row-pill${pillActionClass}"${openPinAttrs}>${createIcon("element")}<span class="obv-row-pill-label">${escapeHtml(pillLabel)}</span><button class="obv-row-pill-x" type="button" data-item-remove-grab="${escapeHtml(item.id)}:${escapeHtml(grab.id)}" aria-label="Remove ${escapeHtml(displayName)}">${createIcon("close")}</button></span>`,
        );
      }
    }
    if (item.attachmentTokens && item.attachmentTokens.length > 0) {
      for (let i = 0; i < item.attachmentTokens.length; i++) {
        pills.push(
          `<span class="obv-row-pill">${createIcon("paperclip")}<span class="obv-row-pill-label">file ${i + 1}</span><button class="obv-row-pill-x" type="button" data-item-remove-file="${escapeHtml(item.id)}:${i}" aria-label="Remove file">${createIcon("close")}</button></span>`,
        );
      }
    }
    if (item.measurements) {
      for (const m of item.measurements) {
        pills.push(
          `<span class="obv-row-pill">${createIcon("ruler")}<span class="obv-row-pill-label">${escapeHtml(m.description)}</span><button class="obv-row-pill-x" type="button" data-item-remove-measurement="${escapeHtml(item.id)}:${escapeHtml(m.id)}" aria-label="Remove measurement">${createIcon("close")}</button></span>`,
        );
      }
    }
    if (item.visualSuggestions && !item.pin) {
      for (const group of this.groupVisualSuggestionsByElement(
        item.visualSuggestions,
      )) {
        const name = getVisualSuggestionRefLabel(group.element, group.items);
        const count = group.items.length;
        const summary =
          count === 1
            ? `${VISUAL_SUGGESTION_PROPERTY_LABELS[group.items[0].property] ?? group.items[0].property}`
            : `${count} changes`;
        const ids = group.items.map((suggestion) => suggestion.id).join(",");
        pills.push(
          `<span class="obv-row-pill obv-row-pill-vs obv-row-pill-action" data-item-vs-activate="${escapeHtml(item.id)}:${escapeHtml(group.element.id)}"><span class="obv-row-pill-label">${escapeHtml(name)} · ${escapeHtml(summary)}</span><button class="obv-row-pill-x" type="button" data-item-remove-vs="${escapeHtml(item.id)}:${escapeHtml(ids)}" aria-label="Remove visual suggestions for ${escapeHtml(name)}">${createIcon("close")}</button></span>`,
        );
      }
    }
    return pills.length > 0
      ? `<div class="obv-row-meta">${pills.join("")}</div>`
      : "";
  }

  private getVisualSuggestionPillSummary(
    suggestions: readonly FeedbackVisualSuggestion[],
  ): string {
    if (suggestions.length === 1) {
      const property = suggestions[0].property;
      return VISUAL_SUGGESTION_PROPERTY_LABELS[property] ?? property;
    }
    return `${suggestions.length} changes`;
  }

  private renderComposePills(): string {
    const pills: string[] = [];
    for (const grab of this.elementGrabItems) {
      pills.push(
        `<span class="obv-row-pill">${createIcon("element")}<span class="obv-row-pill-label">${escapeHtml(getElementGrabDisplayName(grab))}</span><button class="obv-row-pill-x" type="button" data-remove-grab="${escapeHtml(grab.id)}" aria-label="Remove ${escapeHtml(getElementGrabDisplayName(grab))}">${createIcon("close")}</button></span>`,
      );
    }
    for (const attachment of this.feedbackAttachments) {
      const statusSuffix = attachment.status === "uploading" ? "…" : "";
      pills.push(
        `<span class="obv-row-pill">${createIcon("paperclip")}<span class="obv-row-pill-label">${escapeHtml(attachment.name)}${statusSuffix}</span><button class="obv-row-pill-x" type="button" data-remove-attachment="${escapeHtml(attachment.id)}" aria-label="Remove ${escapeHtml(attachment.name)}">${createIcon("close")}</button></span>`,
      );
    }
    for (const m of this.measurementItems) {
      pills.push(
        `<span class="obv-row-pill">${createIcon("ruler")}<span class="obv-row-pill-label">${escapeHtml(m.description)}</span><button class="obv-row-pill-x" type="button" data-remove-measurement="${escapeHtml(m.id)}" aria-label="Remove measurement">${createIcon("close")}</button></span>`,
      );
    }
    if (this.visualSuggestions) {
      const groups = this.groupVisualSuggestionsByElement(
        this.getUncommittedVisualSuggestions(),
      );
      for (const group of groups) {
        const name = getVisualSuggestionRefLabel(group.element, group.items);
        const count = group.items.length;
        const summary =
          count === 1
            ? `${VISUAL_SUGGESTION_PROPERTY_LABELS[group.items[0].property] ?? group.items[0].property}`
            : `${count} changes`;
        pills.push(
          `<span class="obv-row-pill obv-row-pill-vs obv-row-pill-action" data-vs-activate="${escapeHtml(group.element.id)}"><span class="obv-row-pill-label">${escapeHtml(name)} · ${escapeHtml(summary)}</span><button class="obv-row-pill-x" type="button" data-remove-vs-element="${escapeHtml(group.element.id)}" aria-label="Remove visual suggestions for ${escapeHtml(name)}">${createIcon("close")}</button></span>`,
        );
      }
    }
    return pills.length > 0
      ? `<div class="obv-row-meta">${pills.join("")}</div>`
      : "";
  }

  private renderRoundItemList(): string {
    const rows = this.roundItems.map((item, index) => {
      const num = index + 1;
      const pillsRow = this.renderItemPills(item);
      return `<div class="obv-list-row" data-item-id="${escapeHtml(item.id)}"><span class="obv-row-number">${num}</span><input class="obv-row-input" type="text" value="${escapeHtml(item.description)}" data-item-input="${escapeHtml(item.id)}" /></div>${pillsRow}`;
    });

    const composePills = this.renderComposePills();
    const shouldRenderNewRow =
      this.roundItems.length === 0 ||
      this.focusedItemId === "__new" ||
      this.newRowDraft.trim().length > 0 ||
      composePills.length > 0;
    const newRow = shouldRenderNewRow
      ? `<div class="obv-list-row" data-item-id="__new"><span class="obv-row-number">${this.roundItems.length + 1}</span><input class="obv-row-input" type="text" value="${escapeHtml(this.newRowDraft)}" placeholder="What's wrong? (Enter for new line)" data-item-input="__new" /></div>`
      : "";

    return `${rows.join("")}${newRow}${composePills}`;
  }

  private removeRoundItem(id: string): void {
    this.syncAllInputsToRoundItems();
    const item = this.roundItems.find((candidate) => candidate.id === id);
    if (item?.visualSuggestions && item.visualSuggestions.length > 0) {
      this.visualSuggestions?.removeSuggestions(
        item.visualSuggestions.map((suggestion) => suggestion.id),
      );
    }
    if (this.activeVisualSuggestionItemId === id) {
      this.activeVisualSuggestionItemId = null;
    }
    this.roundItems = this.roundItems.filter((item) => item.id !== id);
    this.persistDraftRound();
    this.emitOpenIssueCountChange();
    this.openCard();
  }

  private renderIssueHistorySection(): string {
    if (this.issueHistory.length === 0) {
      return "";
    }
    const renderedEntries = this.issueHistory
      .map((entry, index) => ({ entry, index }))
      .sort(
        (left, right) =>
          Number(isTerminalIssueStatus(left.entry.status)) -
          Number(isTerminalIssueStatus(right.entry.status)),
      );
    return `
      <section class="obv-issue-section" aria-label="Recently reported feedback statuses">
        <div class="obv-issue-list">
          ${renderedEntries.map(({ entry, index }) => this.renderIssueHistoryEntry(entry, index)).join("")}
        </div>
      </section>
    `;
  }
  private renderIssueHistoryEntry(
    entry: FeedbackIssueHistoryEntry,
    index: number,
  ): string {
    const title = entry.title?.trim() || `Issue ${entry.issueId.slice(0, 8)}`;
    const titleButton = `<button class="obv-issue-title obv-button obv-button-secondary" type="button" data-history-detail-index="${index}" aria-label="Open status details for ${escapeHtml(title)}">${escapeHtml(title)}</button>`;
    const icon =
      entry.status === "resolved" ? createIcon("check") : createIcon("status");
    const meta = [
      formatRelativeTime(
        entry.reportedAt ?? entry.updatedAt ?? entry.checkedAt,
      ),
      historyStatusLabel(entry.status),
    ]
      .filter(Boolean)
      .join(" • ");
    const isTerminal = isTerminalIssueStatus(entry.status);
    return `
      <div class="obv-issue-row" data-terminal="${isTerminal ? "true" : "false"}">
        <span class="obv-issue-status-icon" aria-hidden="true">${icon}</span>
        ${titleButton}
        <span class="obv-issue-meta">${escapeHtml(meta)}</span>
        <button class="obv-icon-button obv-issue-dismiss" type="button" aria-label="Dismiss ${escapeHtml(title)}" data-history-dismiss-index="${index}">${createIcon("close")}</button>
      </div>
    `;
  }

  private renderSelectedIssueDetail(): string {
    const entry = this.issueHistory.find(
      (candidate) => candidate.issueId === this.selectedIssueId,
    );
    if (!entry) {
      return "";
    }
    const title = entry.title?.trim() || `Issue ${entry.issueId.slice(0, 8)}`;
    const timestamps = [
      entry.reportedAt
        ? `Reported ${formatRelativeTime(entry.reportedAt)}`
        : null,
      entry.updatedAt ? `Updated ${formatRelativeTime(entry.updatedAt)}` : null,
    ]
      .filter(Boolean)
      .join(" • ");
    const aiHeadline = entry.aiSummary?.headline?.trim();
    const aiProgress = entry.aiSummary?.progress?.trim();
    const workerThreadUrl = getSafeExternalUrl(
      entry.links?.workerThread?.url ?? entry.workerThread?.url,
    );
    const pullRequest = entry.links?.pullRequest;
    const pullRequestUrl = getSafeExternalUrl(pullRequest?.url);
    const links = [
      workerThreadUrl
        ? `<a href="${escapeHtml(workerThreadUrl)}" target="_blank" rel="noreferrer">Worker thread</a>`
        : "",
      pullRequest && pullRequestUrl
        ? `<a href="${escapeHtml(pullRequestUrl)}" target="_blank" rel="noreferrer">PR #${pullRequest.number}</a>`
        : "",
    ].filter(Boolean);
    return `
      <section class="obv-issue-detail" aria-label="Issue status details" tabindex="-1" data-issue-detail="true">
        <div class="obv-issue-detail-header">
          <div>
            <div class="obv-kicker">Current status</div>
            <div class="obv-issue-detail-title">${escapeHtml(title)}</div>
          </div>
          <button class="obv-icon-button" type="button" aria-label="Close issue status details" data-issue-detail-close="true">${createIcon("close")}</button>
        </div>
        <div class="obv-issue-detail-status">${entry.status === "resolved" ? createIcon("check") : createIcon("status")}${escapeHtml(historyStatusLabel(entry.status))}</div>
        ${aiHeadline ? `<div class="obv-issue-detail-body"><strong>${escapeHtml(aiHeadline)}</strong></div>` : ""}
        ${aiProgress ? `<div class="obv-issue-detail-body">${escapeHtml(aiProgress)}</div>` : ""}
        ${entry.resolvedNote ? `<div class="obv-issue-detail-body">${escapeHtml(entry.resolvedNote)}</div>` : ""}
        ${timestamps ? `<div class="obv-issue-detail-meta">${escapeHtml(timestamps)}</div>` : ""}
        ${links.length > 0 ? `<div class="obv-issue-detail-links">${links.join("")}</div>` : ""}
      </section>
    `;
  }

  private openIssueDetail(issueId: string): void {
    this.syncAllInputsToRoundItems();
    this.selectedIssueId = issueId;
    this.refreshIssueHistoryEntry(issueId)
      .catch(() => undefined)
      .finally(() => {
        if (
          !this.destroyed &&
          this.selectedIssueId === issueId &&
          this.isCardOpen()
        ) {
          const activeElement = document.activeElement;
          const detailElementBeforeRefresh = this.shadowRoot.querySelector(
            '[data-issue-detail="true"]',
          );
          const hadDetailFocus =
            !!activeElement &&
            detailElementBeforeRefresh?.contains(activeElement);
          this.openCard();
          const detailElement = queryHtmlElement(
            this.shadowRoot,
            '[data-issue-detail="true"]',
          );
          if (hadDetailFocus) {
            detailElement?.focus();
          }
        }
      });
    this.openCard();
    queryHtmlElement(this.shadowRoot, '[data-issue-detail="true"]')?.focus();
  }

  private bindIssueStatusTray(): void {
    this.issueHistory.forEach((entry, index) => {
      this.shadowRoot
        .querySelector(`[data-history-detail-index="${index}"]`)
        ?.addEventListener("click", () => {
          this.openIssueDetail(entry.issueId);
        });
      this.shadowRoot
        .querySelector(`[data-history-dismiss-index="${index}"]`)
        ?.addEventListener("click", () => {
          this.syncAllInputsToRoundItems();
          this.issueHistory = this.issueHistory.filter(
            (candidate) => candidate.issueId !== entry.issueId,
          );
          if (this.selectedIssueId === entry.issueId) {
            this.selectedIssueId = null;
          }
          this.persistIssueHistory();
          this.emitOpenIssueCountChange();
          this.openCard();
        });
    });
    this.shadowRoot
      .querySelector('[data-issue-detail-close="true"]')
      ?.addEventListener("click", () => {
        this.selectedIssueId = null;
        this.openCard();
      });
  }

  private clearSubmissionDraftState(): void {
    this.elementGrabItems = [];
    this.measurementItems = [];
    this.clearElementGrabHoverState();
    this.feedbackAttachments = [];
    this.newRowDraft = "";
  }

  private clearElementGrabHoverState(): void {
    this.elementGrabHoverTarget = null;
    this.elementGrabHoverInfo = null;
    if (this.elementGrabResolveTimer !== null) {
      window.clearTimeout(this.elementGrabResolveTimer);
      this.elementGrabResolveTimer = null;
    }
  }

  private getElementAtPoint(
    point: FeedbackPointerPoint,
    overlaySelector: string,
  ): Element | null {
    if (typeof document.elementFromPoint !== "function") {
      return null;
    }
    const overlay = this.shadowRoot.querySelector(overlaySelector);
    if (!(overlay instanceof HTMLElement)) {
      return null;
    }
    const previousPointerEvents = overlay.style.pointerEvents;
    overlay.style.pointerEvents = "none";
    const element = document.elementFromPoint(point.x, point.y);
    overlay.style.pointerEvents = previousPointerEvents;
    if (!element || element === this.host || this.host.contains(element)) {
      return null;
    }
    return element;
  }

  private createHoverInfo(
    target: Element,
    sourceInfo: ElementSourceInfo | null,
  ): ElementGrabHoverInfo {
    return {
      tagName: target.tagName,
      componentName: sourceInfo?.componentName ?? null,
      sourceFile: sourceInfo?.source?.filePath ?? null,
      lineNumber: sourceInfo?.source?.lineNumber ?? null,
    };
  }

  private async resolveElementSourceInfo(
    target: Element,
  ): Promise<ElementSourceInfo | null> {
    if (!this.config.elementSourceResolver) {
      return null;
    }
    const cachedResult = this.elementSourceCache.get(target);
    if (cachedResult) {
      return cachedResult;
    }
    const resolverResult = this.config
      .elementSourceResolver(target)
      .catch(() => null);
    this.elementSourceCache.set(target, resolverResult);
    return resolverResult;
  }

  private queueElementGrabHoverResolution(target: Element): void {
    if (!this.config.elementSourceResolver) {
      return;
    }
    if (this.elementGrabResolveTimer !== null) {
      window.clearTimeout(this.elementGrabResolveTimer);
    }
    this.elementGrabResolveTimer = window.setTimeout(() => {
      this.elementGrabResolveTimer = null;
      this.resolveElementSourceInfo(target)
        .then((sourceInfo) => {
          if (
            this.destroyed ||
            !this.elementPickerOpen ||
            this.elementGrabHoverTarget !== target
          ) {
            return;
          }
          this.elementGrabHoverInfo = this.createHoverInfo(target, sourceInfo);
          this.updateElementPickerHoverOverlay();
        })
        .catch(() => undefined);
    }, 150);
  }

  private updateElementGrabHover(point: FeedbackPointerPoint): void {
    const target = this.getElementAtPoint(point, ".obv-element-picker-overlay");
    if (target === this.elementGrabHoverTarget) {
      this.updateElementPickerHoverOverlay();
      return;
    }
    this.elementGrabHoverTarget = target;
    this.elementGrabHoverInfo = target
      ? this.createHoverInfo(target, null)
      : null;
    this.updateElementPickerHoverOverlay();
    if (target) {
      this.queueElementGrabHoverResolution(target);
    } else if (this.elementGrabResolveTimer !== null) {
      window.clearTimeout(this.elementGrabResolveTimer);
      this.elementGrabResolveTimer = null;
    }
  }

  private async createElementGrabItem(
    target: Element,
  ): Promise<ElementGrabItem> {
    const sourceInfo = await this.resolveElementSourceInfo(target);
    return {
      id: createElementGrabId(),
      tagName: target.tagName,
      cssSelector: buildCssSelector(target),
      outerHtml: truncateOuterHtml(target),
      textContent: truncateText(
        (target.textContent ?? "").trim().replace(/\s+/g, " "),
        MAX_TEXT_LENGTH,
      ),
      boundingRect: createElementGrabRect(target.getBoundingClientRect()),
      componentName: sourceInfo?.componentName ?? null,
      sourceFile: sourceInfo?.source?.filePath ?? null,
      lineNumber: sourceInfo?.source?.lineNumber ?? null,
      componentStack:
        sourceInfo?.stack.map((frame) => ({
          filePath: frame.filePath,
          lineNumber: frame.lineNumber,
          componentName: frame.componentName,
        })) ?? [],
    };
  }

  private renderElementPickerOverlay(): void {
    this.elementPickerOpen = true;
    this.shadowRoot.innerHTML = `
      ${this.renderStyleTag()}
      <div class="obv-element-picker-overlay" role="application" aria-label="Select an element on the page. Click to attach it, press Escape to cancel." tabindex="0">
        <div class="obv-element-grab-highlight" hidden></div>
        <div class="obv-element-grab-label" hidden></div>
      </div>
      <div class="obv-element-picker-bar">
        <span>Click an element to attach it</span>
        <button class="obv-button" type="button" data-element-picker-done="true">${createIcon("close")}Cancel</button>
      </div>
    `;
    this.bindElementPickerOverlay();
  }

  private bindElementPickerOverlay(): void {
    const overlay = this.shadowRoot.querySelector(
      ".obv-element-picker-overlay",
    );
    if (overlay instanceof HTMLElement) {
      if (!this.inlineAnnotationOpen) {
        overlay.focus();
      }
      overlay.addEventListener("pointermove", (event) => {
        this.updateElementGrabHover(getPointerPoint(event));
        event.preventDefault();
      });
      overlay.addEventListener("pointerup", (event) => {
        void this.handleElementPickerClick(event);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          this.handleElementPickerEscape();
        }
      });
    }
    this.shadowRoot
      .querySelector('[data-element-picker-done="true"]')
      ?.addEventListener("click", () => {
        this.handleElementPickerCancel();
      });
  }

  private handleElementPickerEscape(): void {
    if (this.annotationModeActive) {
      if (this.inlineAnnotationOpen) {
        this.closeInlineAnnotationPopup();
        return;
      }
      this.exitAnnotationMode({ openCard: this.hasDraftPins() });
      return;
    }
    this.clearElementGrabHoverState();
    this.elementPickerOpen = false;
    this.openCard();
  }

  private handleElementPickerCancel(): void {
    if (this.annotationModeActive) {
      this.exitAnnotationMode({ openCard: this.hasDraftPins() });
      return;
    }
    this.clearElementGrabHoverState();
    this.elementPickerOpen = false;
    this.openCard();
  }

  private async handleElementPickerClick(event: PointerEvent): Promise<void> {
    const point = getPointerPoint(event);
    this.updateElementGrabHover(point);
    const target =
      this.elementGrabHoverTarget ??
      this.getElementAtPoint(point, ".obv-element-picker-overlay");
    if (!target) {
      event.preventDefault();
      return;
    }
    if (this.annotationModeActive) {
      event.preventDefault();
      if (!(target instanceof HTMLElement)) {
        return;
      }
      if (this.inlineAnnotationOpen) {
        this.shakeInlineAnnotationPopup();
        return;
      }
      if (this.editingPinItemId !== null) {
        this.closeInlineAnnotationPopup();
      }
      await this.handleAnnotationPick(target, point);
      return;
    }
    if (this.elementGrabItems.length >= MAX_ELEMENT_GRABS) {
      event.preventDefault();
      return;
    }
    const nextItem = await this.createElementGrabItem(target);
    if (this.destroyed || !this.elementPickerOpen) {
      return;
    }
    this.elementGrabItems = [...this.elementGrabItems, nextItem];
    this.clearElementGrabHoverState();
    this.elementPickerOpen = false;
    await this.activateVisualSuggestionForSelectedElement(target, nextItem);
    this.openCard();
  }

  // ---- Visual suggestion flow (feature-flagged, palette UX) ----

  private async activateVisualSuggestionForSelectedElement(
    target: Element,
    grab: ElementGrabItem,
  ): Promise<void> {
    const mgr = this.visualSuggestions;
    if (!mgr || mgr.isFull()) return;
    if (!(target instanceof HTMLElement)) return;
    const targetOptions = await this.createVisualSuggestionTargetOptions(
      target,
      grab,
    );
    if (this.destroyed) return;
    const selectedTarget = targetOptions[0];
    if (!selectedTarget) return;
    this.visualSuggestionTargetOptions = targetOptions;
    this.visualSuggestionScopeOptions = selectedTarget.scopeOptions;
    const defaultScope = selectedTarget.scopeOptions[0];
    mgr.setActiveElementTargets(
      selectedTarget.element,
      selectedTarget.ref,
      defaultScope?.targets ?? [
        { element: selectedTarget.element, ref: selectedTarget.ref },
      ],
      defaultScope?.scope ?? {
        kind: "element",
        label: "This element",
        matchedCount: 1,
      },
    );
    this.activeVisualSuggestionItemId = null;
  }

  private getActiveVisualSuggestionTargetOption(): VisualSuggestionTargetOption | null {
    const active = this.visualSuggestions?.getActiveElement();
    if (!active) return null;
    return (
      this.visualSuggestionTargetOptions.find(
        (option) => option.ref.id === active.ref.id,
      ) ?? null
    );
  }

  private async createVisualSuggestionTargetOptions(
    rawTarget: HTMLElement,
    selectedGrab?: ElementGrabItem,
  ): Promise<VisualSuggestionTargetOption[]> {
    const normalizedTarget = normalizeVisualSuggestionTarget(rawTarget);
    if (!isElementVisibleForScope(normalizedTarget)) {
      return [];
    }

    const grab =
      selectedGrab && normalizedTarget === rawTarget
        ? selectedGrab
        : await this.createElementGrabItem(normalizedTarget);
    const ref = createVisualSuggestionElementRef(grab);
    const label = getVisualSuggestionTargetLabel(normalizedTarget);
    return [
      {
        id: ref.id,
        kind: getVisualSuggestionTargetKind(normalizedTarget),
        label,
        element: normalizedTarget,
        ref,
        scopeOptions: await this.createVisualSuggestionScopeOptions(
          normalizedTarget,
          ref,
          label,
        ),
      },
    ];
  }

  private async createVisualSuggestionScopeOptions(
    selectedTarget: HTMLElement,
    selectedRef: FeedbackVisualSuggestionElementRef,
    targetLabel = getVisualSuggestionTargetLabel(selectedTarget),
  ): Promise<VisualSuggestionScopeOption[]> {
    const singleTarget = { element: selectedTarget, ref: selectedRef };
    const options: VisualSuggestionScopeOption[] = [
      {
        kind: "element",
        label: supportsVisualSuggestionSiblingScope(targetLabel)
          ? `This ${targetLabel.toLowerCase()}`
          : "This",
        targets: [singleTarget],
        scope: {
          kind: "element",
          label: "This element",
          matchedCount: 1,
        },
      },
    ];

    const siblingScope = findSimilarSiblingScope(selectedTarget);
    if (!siblingScope || !supportsVisualSuggestionSiblingScope(targetLabel)) {
      return options;
    }

    const siblingTargets: VisualSuggestionTargetInput[] = [];
    for (const element of siblingScope.elements) {
      if (element === selectedTarget) {
        siblingTargets.push(singleTarget);
        continue;
      }
      const grab = await this.createElementGrabItem(element);
      siblingTargets.push({
        element,
        ref: createVisualSuggestionElementRef(grab),
      });
    }

    const pluralTargetLabel = pluralizeVisualSuggestionTargetLabel(targetLabel);
    options.push({
      kind: "similar-siblings",
      label: `All ${pluralTargetLabel}`,
      targets: siblingTargets,
      scope: {
        kind: "similar-siblings",
        label: `All ${pluralTargetLabel} in this row/group`,
        matchedCount: siblingTargets.length,
        parentElement: {
          tagName: siblingScope.parent.tagName,
          cssSelector: buildCssSelector(siblingScope.parent),
        },
        matchedElements: siblingTargets.map(({ element, ref }) => ({
          tagName: ref.tagName,
          cssSelector: ref.cssSelector,
          textContent: getVisualSuggestionElementLabel(element),
          componentName: ref.componentName,
        })),
      },
    });

    return options;
  }

  private renderVisualSuggestionPalette(): string {
    const mgr = this.visualSuggestions;
    const active = mgr?.getActiveElement();
    if (!active) return "";
    const targetOption = this.getActiveVisualSuggestionTargetOption();
    const displayName =
      targetOption?.label ??
      active.ref.componentName ??
      active.ref.tagName.toLowerCase();
    const scopeControls =
      this.visualSuggestionScopeOptions.length > 1
        ? `<div class="obv-vs-scope" role="group" aria-label="Visual suggestion target scope">
            ${this.visualSuggestionScopeOptions
              .map((option) => {
                const isActive = option.kind === active.scope.kind;
                return `<button class="obv-button obv-vs-scope-button" type="button" data-vs-scope="${escapeHtml(option.kind)}" aria-pressed="${isActive}">${escapeHtml(option.label)}</button>`;
              })
              .join("")}
          </div>`
        : "";
    const properties = getVisualSuggestionTargetProperties(
      active.element,
      targetOption?.kind ?? getVisualSuggestionTargetKind(active.element),
    );
    const rows = properties.map((prop) => {
      const override = mgr?.getOverrideForActiveElement(prop) ?? null;
      const displayValue = mgr?.getCurrentDisplayValue(prop) ?? "";
      const hasOverride = override !== null;
      if (isVisualSuggestionColorProperty(prop)) {
        return this.renderVsPaletteColorRow(prop, displayValue, hasOverride);
      }
      return this.renderVsPaletteNumericRow(prop, displayValue, hasOverride);
    }).join("");
    return `
      <div class="obv-vs-palette" role="group" aria-label="Visual suggestions for ${escapeHtml(displayName)}">
        <div class="obv-vs-header">
          <span class="obv-vs-target">${createIcon("element")} ${escapeHtml(displayName)}</span>
          <button class="obv-icon-button obv-vs-close" type="button" data-vs-close="true" aria-label="Close palette">${createIcon("close")}</button>
        </div>
        ${scopeControls}
        ${rows}
      </div>
    `;
  }

  private renderVsPaletteNumericRow(
    property: FeedbackVisualSuggestionProperty,
    displayValue: string,
    hasOverride: boolean,
  ): string {
    const label = VISUAL_SUGGESTION_PROPERTY_LABELS[property] ?? property;
    const sliderConfig = getVisualSuggestionSliderConfig(property);
    const parsed = parseCssNumericValue(displayValue);
    const sliderMin = sliderConfig?.min ?? 0;
    const sliderMax = sliderConfig?.max ?? 100;
    const sliderStep = sliderConfig?.step ?? 1;
    const sliderUnit = parsed?.unit || sliderConfig?.unit || "px";
    const shown = parsed
      ? parsed.value > sliderMax
        ? `${formatCssNumericValue(sliderMax, parsed.unit || sliderUnit)}+`
        : formatCssNumericValue(parsed.value, parsed.unit)
      : displayValue || "—";
    const sliderValue = parsed
      ? Math.min(sliderMax, Math.max(sliderMin, parsed.value))
      : sliderMin;
    const sliderPercent =
      sliderMax > sliderMin
        ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100
        : 0;
    return `
      <div class="obv-vs-row" data-has-override="${hasOverride}" data-vs-prop="${escapeHtml(property)}">
        <span class="obv-vs-row-label">${escapeHtml(label)}</span>
        <div class="obv-vs-numeric-group">
          <div class="obv-vs-numeric-top">
            <span class="obv-vs-scrub" data-vs-scrub="${escapeHtml(property)}" data-has-override="${hasOverride}">${escapeHtml(shown)}</span>
          </div>
          <input type="range" class="obv-vs-slider" data-vs-slider="${escapeHtml(property)}" data-vs-slider-unit="${escapeHtml(sliderUnit)}" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${sliderValue}" style="--obv-vs-slider-percent: ${sliderPercent.toFixed(2)}%" aria-label="Adjust ${escapeHtml(label)}" />
        </div>
        <button class="obv-icon-button obv-vs-revert" type="button" data-vs-revert="${escapeHtml(property)}" aria-label="Revert ${escapeHtml(label)}">↺</button>
      </div>
    `;
  }

  private renderVsPaletteColorRow(
    property: FeedbackVisualSuggestionProperty,
    displayValue: string,
    hasOverride: boolean,
  ): string {
    const label = VISUAL_SUGGESTION_PROPERTY_LABELS[property] ?? property;
    const hex = cssColorToHex(displayValue);
    const isTransparent =
      !displayValue ||
      displayValue === "transparent" ||
      displayValue === "rgba(0, 0, 0, 0)";
    const shown = isTransparent ? "transparent" : hex;
    return `
      <div class="obv-vs-row" data-has-override="${hasOverride}" data-vs-prop="${escapeHtml(property)}">
        <span class="obv-vs-row-label">${escapeHtml(label)}</span>
        <input type="color" class="obv-vs-swatch" data-vs-color="${escapeHtml(property)}" value="${escapeHtml(hex)}" aria-label="Pick ${escapeHtml(label)}" />
        <span class="obv-vs-scrub" data-vs-scrub="${escapeHtml(property)}" data-has-override="${hasOverride}" data-vs-color-text="true">${escapeHtml(shown)}</span>
        <button class="obv-icon-button obv-vs-revert" type="button" data-vs-revert="${escapeHtml(property)}" aria-label="Revert ${escapeHtml(label)}">↺</button>
      </div>
    `;
  }

  private bindVisualSuggestions(): void {
    const mgr = this.visualSuggestions;
    if (!mgr) return;

    this.shadowRoot
      .querySelector('[data-vs-close="true"]')
      ?.addEventListener("click", () => {
        this.closeVisualSuggestionPalette();
      });

    this.shadowRoot.querySelectorAll("[data-vs-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        const kind = parseVisualSuggestionScopeKind(
          button.getAttribute("data-vs-scope"),
        );
        const active = mgr.getActiveElement();
        if (!kind || !active || kind === active.scope.kind) {
          return;
        }
        const option = this.visualSuggestionScopeOptions.find(
          (candidate) => candidate.kind === kind,
        );
        if (!option) {
          return;
        }
        mgr.setActiveElementTargets(
          active.element,
          active.ref,
          option.targets,
          option.scope,
        );
        this.syncActiveVisualSuggestionItem();
        this.openCard();
      });
    });

    this.shadowRoot.querySelectorAll("[data-vs-revert]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const prop = btn.getAttribute("data-vs-revert");
        if (isVisualSuggestionProperty(prop)) {
          mgr.clearPropertyOverride(prop);
          this.syncActiveVisualSuggestionItem();
          this.openCard();
        }
      });
    });

    this.shadowRoot.querySelectorAll("[data-vs-scrub]").forEach((el) => {
      if (el instanceof HTMLElement) {
        this.bindScrubInteraction(el, mgr);
      }
    });

    this.shadowRoot.querySelectorAll("[data-vs-color]").forEach((el) => {
      const prop = el.getAttribute("data-vs-color");
      if (!isVisualSuggestionProperty(prop)) return;
      el.addEventListener("input", () => {
        if (!isInputLikeElement(el)) return;
        const value = el.value;
        mgr.setPropertyOverride(prop, value);
        this.syncActiveVisualSuggestionItem();
        const textEl = this.shadowRoot.querySelector(
          `[data-vs-scrub="${prop}"]`,
        );
        if (textEl) textEl.textContent = value;
      });
      el.addEventListener("change", () => {
        this.openCard();
      });
    });

    this.shadowRoot.querySelectorAll("[data-vs-slider]").forEach((el) => {
      const prop = el.getAttribute("data-vs-slider");
      if (!isVisualSuggestionProperty(prop)) return;
      const sliderUnit = parseSliderUnit(
        el.getAttribute("data-vs-slider-unit") ?? "px",
      );
      el.addEventListener("input", () => {
        if (!isInputLikeElement(el)) return;
        const input = el;
        const next = `${input.value}${sliderUnit}`;
        const min = Number(input.min);
        const max = Number(input.max);
        const value = Number(input.value);
        const percent =
          Number.isFinite(min) && Number.isFinite(max) && max > min
            ? ((value - min) / (max - min)) * 100
            : 0;
        input.style.setProperty(
          "--obv-vs-slider-percent",
          `${Math.min(100, Math.max(0, percent)).toFixed(2)}%`,
        );
        mgr.setPropertyOverride(prop, next);
        this.syncActiveVisualSuggestionItem();
        const scrubEl = this.shadowRoot.querySelector(
          `[data-vs-scrub="${prop}"]`,
        );
        if (scrubEl) scrubEl.textContent = next;
      });
      el.addEventListener("change", () => {
        this.openCard();
      });
    });

    this.shadowRoot
      .querySelectorAll("[data-vs-activate]")
      .forEach((el) => {
        el.addEventListener("click", () => {
          const id = el.getAttribute("data-vs-activate");
          if (!id) return;
          const groups = mgr.getElementsWithOverrides();
          const group = groups.find((g) => g.ref.id === id);
          if (!group) return;
          this.activateVisualSuggestionElement(group.ref, group.items, null);
        });
      });
  }

  private bindScrubInteraction(
    el: HTMLElement,
    mgr: VisualSuggestionManager,
  ): void {
    const prop = el.getAttribute("data-vs-scrub");
    if (!isVisualSuggestionProperty(prop)) return;
    const isColor = el.hasAttribute("data-vs-color-text");
    let startX = 0;
    let startValue = 0;
    let dragging = false;
    let unit: "px" | "rem" | "em" | "%" | "" = "";
    let step = 1;

    el.addEventListener("pointerdown", (event) => {
      if (isColor) return;
      event.preventDefault();
      const currentDisplay = mgr.getCurrentDisplayValue(prop);
      const parsed = parseCssNumericValue(currentDisplay);
      const sliderConfig = getVisualSuggestionSliderConfig(prop);
      if (parsed) {
        startValue = parsed.value;
        unit = parsed.unit || sliderConfig?.unit || "px";
      } else {
        const defaults = getDefaultScrubStart(prop);
        startValue = defaults.value;
        unit = defaults.unit || "px";
      }
      step = sliderConfig?.step ?? 1;
      startX = event.clientX;
      dragging = false;
      el.setPointerCapture(event.pointerId);
    });

    el.addEventListener("pointermove", (event) => {
      if (!el.hasPointerCapture(event.pointerId)) return;
      const dx = event.clientX - startX;
      if (!dragging && Math.abs(dx) < 3) return;
      dragging = true;
      let multiplier = 1;
      if (event.shiftKey) multiplier = 10;
      if (event.altKey) multiplier = 0.1;
      const delta = Math.round(dx * multiplier * step);
      const next = startValue + delta;
      const formatted = formatCssNumericValue(next, unit);
      mgr.setPropertyOverride(prop, formatted);
      this.syncActiveVisualSuggestionItem();
      el.textContent = formatted;
      const override = mgr.getOverrideForActiveElement(prop);
      el.setAttribute("data-has-override", override ? "true" : "false");
    });

    el.addEventListener("pointerup", (event) => {
      if (el.hasPointerCapture(event.pointerId)) {
        el.releasePointerCapture(event.pointerId);
      }
      if (dragging) {
        dragging = false;
        this.openCard();
        return;
      }
      this.showScrubInlineInput(el, prop, mgr);
    });

    if (isColor) {
      el.addEventListener("click", () => {
        this.showScrubInlineInput(el, prop, mgr);
      });
    }
  }

  private showScrubInlineInput(
    el: HTMLElement,
    prop: FeedbackVisualSuggestionProperty,
    mgr: VisualSuggestionManager,
  ): void {
    const current = mgr.getCurrentDisplayValue(prop);
    const parsed = parseCssNumericValue(current);
    const inputValue = parsed ? String(parsed.value) : current;
    const sliderConfig = getVisualSuggestionSliderConfig(prop);
    const unit = parsed?.unit || sliderConfig?.unit || "";

    const input = document.createElement("input");
    input.className = "obv-vs-scrub-input";
    input.type = "text";
    input.inputMode = isVisualSuggestionColorProperty(prop)
      ? "text"
      : "decimal";
    input.value = inputValue;
    el.textContent = "";
    el.appendChild(input);
    input.focus();
    input.select();

    const commit = () => {
      const raw = input.value.trim();
      if (!raw) {
        this.openCard();
        return;
      }
      const isNumericOnly = unit && /^-?\d*\.?\d+$/.test(raw);
      const value = isNumericOnly ? `${raw}${unit}` : raw;
      mgr.setPropertyOverride(prop, value);
      this.syncActiveVisualSuggestionItem();
      this.openCard();
    };

    input.addEventListener("blur", commit);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        input.blur();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        input.removeEventListener("blur", commit);
        this.openCard();
      }
    });
  }

  private renderRulerOverlay(): void {
    this.measureOverlayOpen = true;
    this.elementPickerOpen = false;
    this.rulerLines = [];
    this.selectedRulerId = null;
    this.rulerPreview = null;
    this.draggingRulerId = null;
    this.rulerShiftHeld = false;
    this.shadowRoot.innerHTML = `
      ${this.renderStyleTag()}
      <div class="obv-ruler-overlay" role="application" aria-label="Click to place rulers. Shift+click for vertical. Press Escape to cancel." tabindex="0">
        <div class="obv-ruler-snap-highlight" hidden></div>
        <svg class="obv-ruler-svg"></svg>
      </div>
      <div class="obv-measure-bar">
        <span>Click to place ruler. Shift+click for vertical.</span>
        <button class="obv-button" type="button" data-measure-done="true">${createIcon("check")}Done</button>
        <button class="obv-button obv-button-secondary" type="button" data-measure-cancel="true">Cancel</button>
      </div>
    `;
    this.bindRulerOverlay();
  }

  private updateRulerSnapHighlight(snap: SnapResult | null): void {
    const highlight = queryHtmlElement(
      this.shadowRoot,
      ".obv-ruler-snap-highlight",
    );
    if (!highlight) {
      return;
    }
    if (!snap) {
      highlight.setAttribute("hidden", "true");
      return;
    }
    highlight.removeAttribute("hidden");
    highlight.setAttribute("data-edge", snap.edge);
    highlight.style.left = `${Math.round(snap.rect.left)}px`;
    highlight.style.top = `${Math.round(snap.rect.top)}px`;
    highlight.style.width = `${Math.round(snap.rect.width)}px`;
    highlight.style.height = `${Math.round(snap.rect.height)}px`;
  }

  private updateRulerSvg(): void {
    const svg = this.shadowRoot.querySelector(".obv-ruler-svg");
    if (svg) {
      svg.innerHTML = renderRulerSvg(
        this.rulerLines,
        this.rulerPreview,
        this.selectedRulerId,
        window.innerWidth,
        window.innerHeight,
      );
      this.bindRulerHandles();
    }
  }

  private bindRulerHandles(): void {
    this.shadowRoot
      .querySelectorAll("[data-ruler-handle]")
      .forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => {
          if (!isPointerEvent(event)) {
            return;
          }
          event.stopPropagation();
          event.preventDefault();
          const id = handle.getAttribute("data-ruler-handle");
          if (id) {
            this.selectedRulerId = id;
            this.draggingRulerId = id;
            handle.setPointerCapture?.(event.pointerId);
          }
        });
      });
  }

  private bindRulerOverlay(): void {
    const overlay = this.shadowRoot.querySelector(".obv-ruler-overlay");
    if (!(overlay instanceof HTMLElement)) {
      return;
    }
    overlay.focus();

    overlay.addEventListener("pointermove", (event) => {
      if (!isPointerEvent(event)) {
        return;
      }
      if (this.draggingRulerId) {
        const ruler = this.rulerLines.find(
          (r) => r.id === this.draggingRulerId,
        );
        if (ruler) {
          const rawPos =
            ruler.orientation === "horizontal"
              ? event.clientY
              : event.clientX;
          const snap = findSnapPosition(
            rawPos,
            ruler.orientation,
            event.clientX,
            event.clientY,
            this.elementEdgeCache,
          );
          ruler.position = snap ? snap.position : Math.round(rawPos);
          ruler.snappedTo = snap ? snap.selector : null;
          ruler.snappedElement = snap ? snap.element : null;
          ruler.snappedEdge = snap ? snap.edge : null;
          this.updateRulerSnapHighlight(snap);
          this.updateRulerSvg();
        }
        event.preventDefault();
        return;
      }
      const orientation: "horizontal" | "vertical" = this.rulerShiftHeld
        ? "vertical"
        : "horizontal";
      const rawPos =
        orientation === "horizontal"
          ? event.clientY
          : event.clientX;
      const snap = findSnapPosition(
        rawPos,
        orientation,
        event.clientX,
        event.clientY,
        this.elementEdgeCache,
      );
      this.rulerPreview = {
        orientation,
        position: snap ? snap.position : Math.round(rawPos),
      };
      this.updateRulerSnapHighlight(snap);
      this.updateRulerSvg();
      event.preventDefault();
    });

    overlay.addEventListener("pointerup", (event) => {
      if (!isPointerEvent(event)) {
        return;
      }
      if (this.draggingRulerId) {
        this.draggingRulerId = null;
        this.updateRulerSnapHighlight(null);
        event.preventDefault();
        return;
      }
      const orientation: "horizontal" | "vertical" = this.rulerShiftHeld
        ? "vertical"
        : "horizontal";
      const rawPos =
        orientation === "horizontal"
          ? event.clientY
          : event.clientX;
      const snap = findSnapPosition(
        rawPos,
        orientation,
        event.clientX,
        event.clientY,
        this.elementEdgeCache,
      );
      const position = snap ? snap.position : Math.round(rawPos);
      const newRuler: RulerLine = {
        id: createRulerId(),
        orientation,
        position,
        snappedTo: snap ? snap.selector : null,
        snappedElement: snap ? snap.element : null,
        snappedEdge: snap ? snap.edge : null,
      };
      this.rulerLines = [...this.rulerLines, newRuler];
      this.selectedRulerId = newRuler.id;
      this.updateRulerSnapHighlight(null);
      this.updateRulerSvg();
      event.preventDefault();
    });

    overlay.addEventListener("pointercancel", () => {
      this.draggingRulerId = null;
      this.updateRulerSnapHighlight(null);
    });

    overlay.addEventListener("keydown", (event) => {
      if (!isKeyboardEvent(event)) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.cancelMeasurement();
        return;
      }
      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        this.selectedRulerId
      ) {
        event.preventDefault();
        this.rulerLines = this.rulerLines.filter(
          (r) => r.id !== this.selectedRulerId,
        );
        this.selectedRulerId = null;
        this.updateRulerSvg();
        return;
      }
      if (event.key === "Shift") {
        this.rulerShiftHeld = true;
        if (this.rulerPreview) {
          this.rulerPreview = { ...this.rulerPreview, orientation: "vertical" };
          this.updateRulerSvg();
        }
      }
    });

    overlay.addEventListener("keyup", (event) => {
      if (isKeyboardEvent(event) && event.key === "Shift") {
        this.rulerShiftHeld = false;
        if (this.rulerPreview) {
          this.rulerPreview = {
            ...this.rulerPreview,
            orientation: "horizontal",
          };
          this.updateRulerSvg();
        }
      }
    });

    this.shadowRoot
      .querySelector('[data-measure-done="true"]')
      ?.addEventListener("click", () => {
        this.finishMeasurement();
      });
    this.shadowRoot
      .querySelector('[data-measure-cancel="true"]')
      ?.addEventListener("click", () => {
        this.cancelMeasurement();
      });
  }

  private async finishMeasurement(): Promise<void> {
    if (this.rulerLines.length === 0) {
      this.cancelMeasurement();
      return;
    }
    const rawDistances = computeRulerDistances(this.rulerLines);

    const serializeRuler = async (
      ruler: RulerLine,
    ): Promise<FeedbackMeasurementRuler> => {
      let snappedElement: FeedbackMeasurementRuler["snappedElement"] = null;
      if (ruler.snappedElement && document.contains(ruler.snappedElement)) {
        const sourceInfo = await this.resolveElementSourceInfo(
          ruler.snappedElement,
        );
        const rect = ruler.snappedElement.getBoundingClientRect();
        snappedElement = {
          cssSelector:
            ruler.snappedTo ?? buildCssSelector(ruler.snappedElement),
          tagName: ruler.snappedElement.tagName,
          componentName: sourceInfo?.componentName ?? null,
          sourceFile: sourceInfo?.source?.filePath ?? null,
          lineNumber: sourceInfo?.source?.lineNumber ?? null,
          boundingRect: createElementGrabRect(rect),
        };
      }
      return {
        orientation: ruler.orientation,
        position: ruler.position,
        edge: ruler.snappedEdge,
        snappedElement,
      };
    };

    const rulerMap = new Map<string, FeedbackMeasurementRuler>();
    for (const ruler of this.rulerLines) {
      rulerMap.set(ruler.id, await serializeRuler(ruler));
    }

    const rulers = this.rulerLines
      .map((r) => rulerMap.get(r.id))
      .filter((r): r is FeedbackMeasurementRuler => r !== undefined);

    const distances: FeedbackMeasurementDistance[] = rawDistances.map((d) => ({
      pixelDistance: d.distance,
      orientation: d.orientation,
      rulerA: rulerMap.get(d.rulerAId) ?? rulers[0],
      rulerB: rulerMap.get(d.rulerBId) ?? rulers[0],
    }));

    const descParts: string[] = [];
    for (const d of distances) {
      const labelA =
        d.rulerA.snappedElement?.componentName ??
        d.rulerA.snappedElement?.cssSelector ??
        `${d.rulerA.position}px`;
      const labelB =
        d.rulerB.snappedElement?.componentName ??
        d.rulerB.snappedElement?.cssSelector ??
        `${d.rulerB.position}px`;
      descParts.push(
        `${d.pixelDistance}px (${labelA} ${d.rulerA.edge ?? ""} → ${labelB} ${d.rulerB.edge ?? ""})`,
      );
    }
    if (descParts.length === 0 && rulers.length > 0) {
      descParts.push(`${rulers.length} ruler${rulers.length === 1 ? "" : "s"}`);
    }
    const description =
      descParts.length > 0 ? descParts.join(", ") : "Measurement";

    const measurement: FeedbackMeasurement = {
      id: createMeasurementId(),
      description,
      rulers,
      distances,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
    const sourceItemId = this.measurementSourceItemId;
    if (sourceItemId && sourceItemId !== "__new") {
      const targetId = sourceItemId;
      const existingItem = this.roundItems.find((item) => item.id === targetId);
      if (existingItem) {
        this.roundItems = this.roundItems.map((item) =>
          item.id === targetId
            ? {
                ...item,
                measurements: [...(item.measurements ?? []), measurement],
              }
            : item,
        );
        this.focusedItemId = targetId;
      } else {
        this.measurementItems = [...this.measurementItems, measurement];
      }
    } else {
      this.measurementItems = [...this.measurementItems, measurement];
    }
    this.rulerLines = [];
    this.selectedRulerId = null;
    this.rulerPreview = null;
    this.draggingRulerId = null;
    this.measurementSourceItemId = null;
    this.measureOverlayOpen = false;
    this.openCard();
  }

  private cancelMeasurement(): void {
    this.rulerLines = [];
    this.selectedRulerId = null;
    this.rulerPreview = null;
    this.draggingRulerId = null;
    this.measurementSourceItemId = null;
    this.measureOverlayOpen = false;
    this.openCard();
  }

  private updateElementPickerHoverOverlay(): void {
    const highlight = this.shadowRoot.querySelector(
      ".obv-element-grab-highlight",
    );
    const label = this.shadowRoot.querySelector(".obv-element-grab-label");
    if (
      !(highlight instanceof HTMLElement) ||
      !(label instanceof HTMLElement) ||
      !this.elementPickerOpen ||
      !this.elementGrabHoverTarget
    ) {
      if (highlight instanceof HTMLElement) {
        highlight.setAttribute("hidden", "true");
      }
      if (label instanceof HTMLElement) {
        label.setAttribute("hidden", "true");
      }
      return;
    }
    const rect = this.elementGrabHoverTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      highlight.setAttribute("hidden", "true");
      label.setAttribute("hidden", "true");
      return;
    }
    highlight.removeAttribute("hidden");
    highlight.style.left = `${Math.round(rect.left)}px`;
    highlight.style.top = `${Math.round(rect.top)}px`;
    highlight.style.width = `${Math.round(rect.width)}px`;
    highlight.style.height = `${Math.round(rect.height)}px`;

    const fallbackInfo: ElementGrabHoverInfo = {
      tagName: this.elementGrabHoverTarget.tagName,
      componentName: null,
      sourceFile: null,
      lineNumber: null,
    };
    const hoverInfo = this.elementGrabHoverInfo ?? fallbackInfo;
    label.removeAttribute("hidden");
    label.textContent = getElementGrabHoverLabel(hoverInfo);
    label.style.left = `${Math.max(8, Math.round(rect.left))}px`;
    label.style.top = `${Math.max(8, Math.round(rect.top - 36))}px`;
  }

  private addAttachmentFiles(files: File[]): void {
    if (files.length === 0 || this.config.previewOnly) {
      return;
    }
    this.syncAllInputsToRoundItems();
    const acceptedFiles = files.slice(
      0,
      Math.max(0, MAX_FEEDBACK_ATTACHMENTS - this.feedbackAttachments.length),
    );
    if (acceptedFiles.length === 0) {
      this.openCard({
        error: `Feedback supports up to ${MAX_FEEDBACK_ATTACHMENTS} attachments`,
      });
      return;
    }
    const partialWarning =
      acceptedFiles.length < files.length
        ? `Only ${acceptedFiles.length} of ${files.length} files accepted (limit: ${MAX_FEEDBACK_ATTACHMENTS} attachments)`
        : null;
    const newAttachments: FeedbackAttachmentUpload[] = acceptedFiles.map(
      (file) => ({
        id: createFeedbackAttachmentId(),
        file,
        name: file.name || "attachment",
        mimeType: normalizeAttachmentMimeType(file),
        sizeBytes: file.size,
        status: "uploading",
      }),
    );
    this.feedbackAttachments = [...this.feedbackAttachments, ...newAttachments];
    this.openCard({ error: partialWarning });
    for (const attachment of newAttachments) {
      this.uploadAttachment(attachment.id).catch(() => undefined);
    }
  }

  private removeAttachment(id: string): void {
    this.syncAllInputsToRoundItems();
    this.feedbackAttachments = this.feedbackAttachments.filter(
      (attachment) => attachment.id !== id,
    );
    this.openCard();
  }

  private hasBlockingAttachmentUpload(): boolean {
    return this.feedbackAttachments.some(
      (attachment) => attachment.status !== "ready",
    );
  }

  private getAttachmentSubmitBlocker(): string | null {
    if (
      this.feedbackAttachments.some(
        (attachment) => attachment.status === "uploading",
      )
    ) {
      return "Please wait for attachments to finish uploading before submitting.";
    }
    if (
      this.feedbackAttachments.some(
        (attachment) => attachment.status === "error",
      )
    ) {
      return "Remove failed attachments before submitting feedback.";
    }
    return null;
  }

  private getReadyAttachmentTokens(): string[] {
    return this.feedbackAttachments
      .filter((attachment) => attachment.status === "ready")
      .map((attachment) => attachment.attachmentToken)
      .filter(
        (attachmentToken): attachmentToken is string =>
          typeof attachmentToken === "string" && attachmentToken.length > 0,
      );
  }

  private async uploadAttachment(id: string): Promise<void> {
    const attachment = this.feedbackAttachments.find(
      (candidate) => candidate.id === id,
    );
    if (!attachment) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      FEEDBACK_ATTACHMENT_UPLOAD_TIMEOUT_MS,
    );
    try {
      if (attachment.sizeBytes < 1) throw new Error("Attachment is empty");
      if (attachment.sizeBytes > MAX_FEEDBACK_ATTACHMENT_SIZE_BYTES) {
        throw new Error(
          `File exceeds the ${formatAttachmentSize(MAX_FEEDBACK_ATTACHMENT_SIZE_BYTES)} size limit`,
        );
      }
      const presignResponse = await fetch(
        createAttachmentUploadUrl(this.config.apiBaseUrl),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            publicKey: this.config.publicKey,
            sessionId: this.attachmentSessionId,
            clientAttachmentId: attachment.id,
            name: attachment.name,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes,
          }),
        },
      );
      if (!presignResponse.ok)
        throw new Error(
          `Attachment upload setup failed (${presignResponse.status})`,
        );
      const payload = await presignResponse.json();
      const data = isRecord(payload) ? getRecordField(payload, "data") : null;
      const uploadUrl = getStringField(data, "uploadUrl");
      const attachmentToken = getStringField(data, "attachmentToken");
      if (!uploadUrl || !attachmentToken)
        throw new Error("Attachment upload setup response was incomplete");
      const putResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": attachment.mimeType },
        signal: controller.signal,
        body: attachment.file,
      });
      if (!putResponse.ok)
        throw new Error(`Attachment upload failed (${putResponse.status})`);
      this.updateAttachment(id, {
        status: "ready",
        attachmentToken,
        error: undefined,
      });
    } catch (err: unknown) {
      this.updateAttachment(id, {
        status: "error",
        error: controller.signal.aborted
          ? "Attachment upload timed out"
          : err instanceof Error
            ? err.message
            : "Attachment upload failed",
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  private updateAttachment(
    id: string,
    patch: Partial<FeedbackAttachmentUpload>,
  ): void {
    if (this.destroyed) {
      return;
    }
    let changed = false;
    this.feedbackAttachments = this.feedbackAttachments.map((attachment) => {
      if (attachment.id !== id) return attachment;
      changed = true;
      return { ...attachment, ...patch };
    });
    if (changed && this.isCardOpen()) {
      this.syncAllInputsToRoundItems();
      this.openCard();
    }
  }

  private async resolveSessionReplayUrl(
    input: FeedbackSubmissionInput,
  ): Promise<string | undefined> {
    const explicitUrl = input.sessionReplayUrl?.trim();
    if (explicitUrl) {
      return explicitUrl;
    }

    const resolver = this.config.sessionReplayUrlResolver;
    if (!resolver) {
      return undefined;
    }

    let timeoutHandle: number | undefined;
    try {
      const timeout = new Promise<null>((resolve) => {
        timeoutHandle = window.setTimeout(
          () => resolve(null),
          SESSION_REPLAY_URL_RESOLVER_TIMEOUT_MS,
        );
      });
      const resolvedUrl = await Promise.race([
        Promise.resolve(resolver()),
        timeout,
      ]);
      window.clearTimeout(timeoutHandle);
      const normalizedUrl = resolvedUrl?.trim();
      return normalizedUrl || undefined;
    } catch (error) {
      window.clearTimeout(timeoutHandle);
      console.debug(
        "[ObviousFeedback] Session replay URL resolver failed; continuing without replay URL",
        error,
      );
      return undefined;
    }
  }

  private buildSubmissionContext(): Record<string, unknown> | undefined {
    const basePageContext = this.config.capturePageContext
      ? {
          url: redactUrl(window.location.href),
          userAgent: navigator.userAgent,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          scroll: { x: window.scrollX, y: window.scrollY },
        }
      : undefined;
    const roundItemVisualSuggestions = this.roundItems.flatMap(
      (item) => item.visualSuggestions ?? [],
    );
    const currentVisualSuggestions = this.visualSuggestions?.getItems() ?? [];
    const visualSuggestionMap = new Map<string, FeedbackVisualSuggestion>();
    for (const suggestion of roundItemVisualSuggestions) {
      visualSuggestionMap.set(suggestion.id, suggestion);
    }
    for (const suggestion of currentVisualSuggestions) {
      visualSuggestionMap.set(suggestion.id, suggestion);
    }
    const allVisualSuggestions = [...visualSuggestionMap.values()];
    const visualSuggestions =
      allVisualSuggestions.length > 0
        ? ({
            version: 1,
            suggestions: allVisualSuggestions,
          } satisfies FeedbackVisualSuggestionsPayload)
        : undefined;
    if (!basePageContext && !visualSuggestions) return undefined;
    return {
      ...(basePageContext ?? {}),
      ...(visualSuggestions ? { visualSuggestions } : {}),
    };
  }

  private async submitFeedback(input: FeedbackSubmissionInput): Promise<void> {
    const sessionReplayUrl = await this.resolveSessionReplayUrl(input);
    const response = await fetch(
      createFeedbackSubmitUrl(this.config.apiBaseUrl),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: this.config.publicKey,
          identityToken: this.config.identityToken,
          env: this.config.env,
          prNumber: this.config.prNumber,
          sourceUrl: redactUrl(window.location.href),
          sdkVersion: SDK_VERSION,
          type: input.type,
          severity: input.severity,
          title: input.title,
          description: input.description,
          sessionReplayUrl,
          domSnapshot: this.config.capturePageContext
            ? serializeDomSnapshot(document.body, this.config.redactSelectors)
            : undefined,
          consoleLogs: this.consoleBuffer.read(),
          networkLog: this.networkBuffer.read(),
          elementGrabs:
            this.elementGrabItems.length > 0
              ? this.elementGrabItems
              : undefined,
          measurements:
            this.measurementItems.length > 0
              ? this.measurementItems
              : undefined,
          context: this.buildSubmissionContext(),
          attachmentTokens:
            input.attachmentTokens !== undefined
              ? input.attachmentTokens.filter((token) => token.length > 0)
              : this.getReadyAttachmentTokens(),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Feedback submission failed (${response.status})`);
    }

    const payload = await response.json();
    const data = isRecord(payload) ? getRecordField(payload, "data") : null;
    const status = data?.status;
    if (this.destroyed) {
      return;
    }
    this.issueId = getStringField(data, "issueId") ?? null;
    this.statusPollIndex = 0;
    this.clearStatusTimer();
    if (this.issueId) {
      this.rememberIssueHistoryEntry({
        issueId: this.issueId,
        status: isFeedbackClientStatus(status) ? status : "received",
        title: getStringField(data, "title"),
        reportedAt: getStringField(data, "reportedAt"),
        workerThread: normalizeWorkerThreadLink(data?.workerThread),
      });
    }
    this.roundItems = [];
    this.focusedItemId = null;
    this.clearSubmissionDraftState();
    this.visualSuggestions?.restoreAll();
    this.feedbackFormError = null;
    this.submittedIssueUrl = getStringField(data, "issueUrl") ?? null;
    this.persistDraftRound();
    this.emitOpenIssueCountChange();
    this.openCard();
    this.scheduleStatusPoll(this.issueId);
  }

  private rememberIssueHistoryEntry(entry: FeedbackIssueHistoryEntry): void {
    const checkedAt = entry.checkedAt ?? new Date().toISOString();
    const existingEntry = this.issueHistory.find(
      (candidate) => candidate.issueId === entry.issueId,
    );
    const updatedEntry = { ...existingEntry, ...entry, checkedAt };
    this.issueHistory = [
      updatedEntry,
      ...this.issueHistory.filter(
        (candidate) => candidate.issueId !== entry.issueId,
      ),
    ].slice(0, MAX_ISSUE_HISTORY_ENTRIES);
    this.persistIssueHistory();
    this.emitOpenIssueCountChange();
  }

  private updateIssueHistoryEntry(entry: FeedbackIssueHistoryEntry): void {
    const existingIndex = this.issueHistory.findIndex(
      (candidate) => candidate.issueId === entry.issueId,
    );
    if (existingIndex === -1) {
      this.rememberIssueHistoryEntry(entry);
      return;
    }
    this.issueHistory = this.issueHistory
      .map((candidate, index) =>
        index === existingIndex
          ? {
              ...candidate,
              ...entry,
              acknowledgedStatusVersions:
                entry.acknowledgedStatusVersions ??
                candidate.acknowledgedStatusVersions,
            }
          : candidate,
      )
      .sort(
        (left, right) =>
          Number(isTerminalIssueStatus(left.status)) -
          Number(isTerminalIssueStatus(right.status)),
      );
    this.persistIssueHistory();
    this.emitOpenIssueCountChange();
  }

  private acknowledgeIssueStatusVersion(
    issueId: string,
    status: FeedbackIssueHistoryStatus,
    updatedAt?: string | null,
    reportedAt?: string | null,
  ): void {
    const version = getIssueStatusVersion({ status, updatedAt, reportedAt });
    const existingEntry = this.issueHistory.find(
      (candidate) => candidate.issueId === issueId,
    );
    const acknowledgedStatusVersions = Array.from(
      new Set([...(existingEntry?.acknowledgedStatusVersions ?? []), version]),
    );
    this.rememberIssueHistoryEntry({
      ...existingEntry,
      issueId,
      status,
      updatedAt: updatedAt ?? existingEntry?.updatedAt,
      reportedAt: reportedAt ?? existingEntry?.reportedAt,
      acknowledgedStatusVersions,
    });
  }

  private acknowledgeOpenStatusCard(): void {
    if (!this.statusCardIssueId || !this.statusCardStatus) {
      return;
    }
    this.acknowledgeIssueStatusVersion(
      this.statusCardIssueId,
      this.statusCardStatus,
      this.statusCardUpdatedAt,
      this.statusCardReportedAt,
    );
    this.statusCardIssueId = null;
    this.statusCardStatus = null;
    this.statusCardUpdatedAt = null;
    this.statusCardReportedAt = null;
  }

  private persistIssueHistory(): void {
    persistIssueHistory(this.issueHistoryStorageKey, this.issueHistory);
  }

  private async refreshIssueHistoryStatuses(): Promise<void> {
    if (
      !this.config.publicKey ||
      this.issueHistory.length === 0 ||
      this.historyRefreshInFlight
    ) {
      return;
    }
    this.historyRefreshInFlight = true;
    try {
      const refreshCandidates = this.issueHistory
        .filter((entry) => !isTerminalIssueStatus(entry.status))
        .filter(
          (entry) =>
            !entry.checkedAt ||
            Date.now() - Date.parse(entry.checkedAt) > HISTORY_REFRESH_STALE_MS,
        )
        .slice(0, MAX_HISTORY_REFRESH_PER_OPEN);
      for (const entry of refreshCandidates) {
        await this.refreshIssueHistoryEntry(entry.issueId);
      }
      if (this.isCardOpen()) {
        this.syncAllInputsToRoundItems();
        this.openCard();
      }
    } finally {
      this.historyRefreshInFlight = false;
    }
  }

  private async refreshIssueHistoryEntry(issueId: string): Promise<void> {
    const checkedAt = new Date().toISOString();
    try {
      const { url, init } = this.createStatusRequest(issueId);
      const response = init
        ? await fetch(url.toString(), init)
        : await fetch(url.toString());
      if (!this.issueHistory.some((entry) => entry.issueId === issueId)) {
        return;
      }
      if (!response.ok) {
        this.updateIssueHistoryEntry({
          issueId,
          status: "unavailable",
          checkedAt,
        });
        return;
      }
      const payload = await response.json();
      const data = isRecord(payload) ? getRecordField(payload, "data") : null;
      if (!this.issueHistory.some((entry) => entry.issueId === issueId)) {
        return;
      }
      const responseIssueId = getStringField(data, "issueId");
      const responseStatus = data?.status;
      const title = getStringField(data, "title");
      const updatedAt = getStringField(data, "updatedAt");
      if (
        !data ||
        !responseIssueId ||
        !isFeedbackClientStatus(responseStatus) ||
        !title ||
        !updatedAt
      ) {
        this.updateIssueHistoryEntry({
          issueId,
          status: "unavailable",
          checkedAt,
        });
        return;
      }
      this.updateIssueHistoryEntry({
        issueId: responseIssueId,
        status: responseStatus,
        title,
        description: getNullableStringField(data, "description") ?? null,
        resolvedNote: getNullableStringField(data, "resolvedNote") ?? null,
        aiSummary: normalizeFeedbackAiSummary(data.aiSummary),
        links: getFeedbackIssueLinks(data),
        reportedAt: getStringField(data, "reportedAt"),
        updatedAt,
        checkedAt,
        workerThread: normalizeWorkerThreadLink(data.workerThread),
      });
    } catch {
      this.updateIssueHistoryEntry({
        issueId,
        status: "unavailable",
        checkedAt,
      });
    }
  }

  private renderStatusCard(
    status: FeedbackClientStatus,
    note?: string,
    issueId: string | null = this.issueId,
    updatedAt?: string | null,
    reportedAt?: string | null,
    issueUrl?: string,
  ): void {
    this.statusCardIssueId = issueId;
    this.statusCardStatus = status;
    this.statusCardUpdatedAt = updatedAt ?? null;
    this.statusCardReportedAt = reportedAt ?? null;
    this.activePanel = null;
    this.installGlobalFileDropGuards();
    const feedbackCardPlacement = this.getFeedbackCardPlacement("status");
    const safeIssueUrl = getSafeExternalUrl(issueUrl);
    const linkSentence = safeIssueUrl
      ? ` You can monitor its progress <a href="${escapeHtml(safeIssueUrl)}" target="_blank" rel="noreferrer" style="color: var(--obv-feedback-text); font-weight: 650;">here</a>.`
      : "";
    const statusMessage =
      note !== undefined
        ? `${escapeHtml(note)}${linkSentence}`
        : safeIssueUrl
          ? `Autobuild has started addressing your issues.${linkSentence}`
          : "Autobuild has started addressing your issues.";
    this.shadowRoot.innerHTML = `
      ${this.renderStyleTag()}
      ${this.renderTriggerButton()}
      <div class="obv-card" data-assistant-position="${escapeHtml(this.config.assistantPosition)}" data-trigger-corner="${escapeHtml(this.triggerPosition.corner)}" data-dialog-direction="${escapeHtml(feedbackCardPlacement.direction)}" style="${escapeHtml(feedbackCardPlacement.style)}">
        <div class="obv-kicker">Feedback state</div>
        <div class="obv-title obv-status-title">${createIcon("status")}${escapeHtml(statusLabel(status))}</div>
        <div class="obv-status">${statusMessage}</div>
        <div class="obv-actions" style="margin-top: 12px; justify-content: flex-end;">
          <button class="obv-button" type="button" data-new="true">${createIcon("compose")}New feedback</button>
        </div>
      </div>
    `;
    this.bindTrigger(() => {
      this.acknowledgeOpenStatusCard();
      this.renderTrigger();
    });
    this.observeAnchoredFeedbackCard();
    this.shadowRoot
      .querySelector('[data-new="true"]')
      ?.addEventListener("click", () => {
        this.acknowledgeOpenStatusCard();
        this.startNewFeedbackSession();
      });
  }

  private startNewFeedbackSession(): void {
    this.issueId = null;
    this.statusPollIndex = 0;
    this.clearStatusTimer();
    this.selectedIssueId = null;
    this.roundItems = [];
    this.focusedItemId = null;
    this.persistDraftRound();

    this.clearSubmissionDraftState();
    this.visualSuggestions?.restoreAll();
    this.feedbackFormError = null;
    this.emitOpenIssueCountChange();
    this.openCard();
  }

  private clearStatusTimer(): void {
    if (this.statusTimer) {
      window.clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
  }

  private scheduleStatusPoll(issueId: string | null): void {
    if (this.destroyed || !issueId || issueId !== this.issueId) {
      return;
    }
    this.clearStatusTimer();
    const delays = [120_000, 300_000, 600_000, 86_400_000];
    const delay =
      delays[Math.min(this.statusPollIndex, delays.length - 1)] ?? 86_400_000;
    this.statusTimer = window.setTimeout(() => {
      this.statusTimer = null;
      this.pollStatus(issueId).catch(() => undefined);
    }, delay);
    this.statusPollIndex += 1;
  }

  private async pollStatus(issueId: string): Promise<void> {
    if (this.destroyed || !this.issueId || issueId !== this.issueId) {
      if (!this.destroyed && this.isCardOpen()) {
        this.syncAllInputsToRoundItems();
        this.openCard();
      }
      return;
    }
    const { url, init } = this.createStatusRequest(issueId);
    const response = init
      ? await fetch(url.toString(), init)
      : await fetch(url.toString());
    if (this.destroyed || !this.issueId || issueId !== this.issueId) {
      return;
    }
    if (!response.ok) {
      this.scheduleStatusPoll(issueId);
      return;
    }
    const payload = await response.json();
    const data = isRecord(payload) ? getRecordField(payload, "data") : null;
    if (this.destroyed || !this.issueId || issueId !== this.issueId) {
      return;
    }
    const parsedStatus = data?.status;
    const status = isFeedbackClientStatus(parsedStatus)
      ? parsedStatus
      : "received";
    const responseIssueId = getStringField(data, "issueId");
    const title = getStringField(data, "title");
    if (data && responseIssueId && title) {
      this.rememberIssueHistoryEntry({
        issueId: responseIssueId,
        status,
        title,
        description: getNullableStringField(data, "description") ?? null,
        resolvedNote: getNullableStringField(data, "resolvedNote") ?? null,
        aiSummary: normalizeFeedbackAiSummary(data.aiSummary),
        links: getFeedbackIssueLinks(data),
        reportedAt: getStringField(data, "reportedAt"),
        updatedAt: getStringField(data, "updatedAt"),
        workerThread: normalizeWorkerThreadLink(data.workerThread),
      });
    }

    const isTerminalStatus =
      status === "resolved" || status === "no_action" || status === "duplicate";
    if (this.isCardOpen()) {
      this.syncAllInputsToRoundItems();
      this.openCard();
      if (!isTerminalStatus) {
        this.scheduleStatusPoll(issueId);
      }
      return;
    }
    this.acknowledgeIssueStatusVersion(
      issueId,
      status,
      payload.data?.updatedAt,
      payload.data?.reportedAt,
    );
    this.renderTrigger();
    if (!isTerminalStatus) {
      this.scheduleStatusPoll(issueId);
    }
  }

  private createStatusRequest(issueId: string): {
    url: URL;
    init?: RequestInit;
  } {
    return createFeedbackStatusRequest({
      apiBaseUrl: this.config.apiBaseUrl,
      identityToken: this.config.identityToken,
      issueId,
      publicKey: this.config.publicKey,
    });
  }

  // ---- Inline pin annotation flow ----

  private hasDraftPins(): boolean {
    return this.roundItems.some((item) => item.pin !== undefined);
  }

  private getPinnedItemsWithIndex(): Array<{
    item: FeedbackRoundItem;
    index: number;
  }> {
    const pinned: Array<{ item: FeedbackRoundItem; index: number }> = [];
    for (let i = 0; i < this.roundItems.length; i += 1) {
      const item = this.roundItems[i];
      if (item && item.pin) {
        pinned.push({ item, index: i + 1 });
      }
    }
    return pinned;
  }

  private enterAnnotationMode(
    options: { returnToCardAfterSubmit?: boolean } = {},
  ): void {
    this.annotationReturnToCardAfterSubmit =
      options.returnToCardAfterSubmit === true;
    if (!this.annotationReturnToCardAfterSubmit) {
      this.pendingPinSourceItemId = null;
    }
    if (this.annotationModeActive) {
      this.renderAnnotationModeShell();
      return;
    }
    this.annotationModeActive = true;
    this.editingPinItemId = null;
    this.pendingPinAnchor = null;
    this.inlineAnnotationOpen = false;
    this.inlinePopupDraft = "";
    this.activePanel = null;
    this.renderAnnotationModeShell();
    this.startPinPositionTicker();
    this.installPinScrollListener();
    this.installPinResizeObserver();
  }

  private exitAnnotationMode(options: { openCard?: boolean } = {}): void {
    if (!this.annotationModeActive) {
      if (options.openCard) {
        this.openCard();
      } else {
        this.renderTrigger();
      }
      return;
    }
    this.annotationModeActive = false;
    this.annotationReturnToCardAfterSubmit = false;
    this.inlineAnnotationOpen = false;
    this.inlinePopupAnimReady = false;
    this.editingPinItemId = null;
    this.pendingPinSourceItemId = null;
    this.pendingPinAnchor = null;
    this.elementPickerOpen = false;
    this.clearElementGrabHoverState();
    this.stopPinPositionTicker();
    this.uninstallPinScrollListener();
    this.uninstallPinResizeObserver();
    if (options.openCard) {
      this.openCard();
    } else {
      this.renderTrigger();
    }
  }

  private renderAnnotationModeShell(): void {
    if (!this.inlineAnnotationOpen) {
      this.inlinePopupAnimReady = false;
    }
    this.elementPickerOpen = true;
    this.activePanel = null;
    const pinnedCount = this.getPinnedItemsWithIndex().length;
    const limitReached = this.roundItems.length >= MAX_ROUND_ITEMS;
    const description = limitReached
      ? `Pin limit reached (${MAX_ROUND_ITEMS}). Open the list to review.`
      : pinnedCount === 0
        ? "Click any element on the page to leave feedback"
        : `Click another element to add feedback (${pinnedCount} pin${pinnedCount === 1 ? "" : "s"})`;
    const openListLabel = pinnedCount === 0
      ? "Open list (0)"
      : `Open list (${pinnedCount})`;
    const openListDisabled = pinnedCount === 0
      ? 'disabled aria-disabled="true"'
      : "";
    this.shadowRoot.innerHTML = `
      ${this.renderStyleTag()}
      <div class="obv-element-picker-overlay" data-annotation-overlay="true" role="application" aria-label="Click any element to add an annotation. Press Escape to exit." tabindex="0">
        <div class="obv-element-grab-highlight" hidden></div>
        <div class="obv-element-grab-label" hidden></div>
      </div>
      ${this.renderPinLayer()}
      ${this.renderTriggerButton()}
      <div class="obv-annotation-chrome" role="toolbar" aria-label="Annotation mode controls">
        <span class="obv-annotation-chrome-icon" aria-hidden="true">${createIcon("element")}</span>
        <span class="obv-annotation-chrome-text">${escapeHtml(description)}</span>
        <button class="obv-button obv-button-secondary obv-annotation-chrome-open-list" type="button" data-annotation-open-card="true" aria-label="Open feedback list" ${openListDisabled}>${createIcon("status")}<span>${escapeHtml(openListLabel)}</span></button>
        <button class="obv-icon-button obv-annotation-chrome-close" type="button" data-annotation-exit="true" aria-label="Exit annotation mode (Esc)" data-tooltip="Exit (Esc)">${createIcon("close")}</button>
      </div>
      ${this.inlineAnnotationOpen ? this.renderInlineAnnotationPopup() : ""}
    `;
    this.bindAnnotationModeShell();
    this.updateElementPickerHoverOverlay();
  }

  private bindAnnotationModeShell(): void {
    this.bindTrigger(() => this.handleAnnotationModeTriggerClick());
    this.bindElementPickerOverlay();
    this.bindAnnotationChrome();
    this.bindPinLayer();
    if (this.inlineAnnotationOpen) {
      this.bindInlineAnnotationPopup();
      this.bindInlineVisualSuggestionControls();
    }
  }

  private bindAnnotationChrome(): void {
    this.shadowRoot
      .querySelector('[data-annotation-exit="true"]')
      ?.addEventListener("click", () => {
        this.exitAnnotationMode({ openCard: false });
      });
    this.shadowRoot
      .querySelector('[data-annotation-open-card="true"]')
      ?.addEventListener("click", () => {
        if (this.getPinnedItemsWithIndex().length === 0) {
          return;
        }
        this.exitAnnotationMode({ openCard: true });
      });
  }

  private handleAnnotationModeTriggerClick(): void {
    if (this.inlineAnnotationOpen) {
      this.closeInlineAnnotationPopup();
      return;
    }
    if (this.getPinnedItemsWithIndex().length > 0) {
      this.exitAnnotationMode({ openCard: true });
      return;
    }
    this.exitAnnotationMode({ openCard: false });
  }

  private async handleAnnotationPick(
    target: HTMLElement,
    point: FeedbackPointerPoint,
  ): Promise<void> {
    const sourceItem =
      this.pendingPinSourceItemId && this.pendingPinSourceItemId !== "__new"
        ? this.roundItems.find(
            (item) => item.id === this.pendingPinSourceItemId,
          ) ?? null
        : null;
    if (this.roundItems.length >= MAX_ROUND_ITEMS && !sourceItem) {
      this.renderAnnotationModeShell();
      return;
    }
    const grab = await this.createElementGrabItem(target);
    if (this.destroyed || !this.annotationModeActive) {
      return;
    }
    const fixed = isElementFixed(target);
    const innerWidth = window.innerWidth || 1;
    const scrollY = window.scrollY || 0;
    const anchor = computePinAnchorFromPoint(
      point.x,
      point.y,
      fixed,
      innerWidth,
      scrollY,
    );
    const elementName = getElementGrabDisplayName(grab);
    this.pendingPinAnchor = {
      xPct: anchor.xPct,
      yPx: anchor.yPx,
      isFixed: fixed,
      element: target,
      grab,
      elementName,
    };
    this.editingPinItemId = null;
    this.inlineAnnotationOpen = true;
    this.inlinePopupDraft = this.getPendingPinSourceText();
    this.clearElementGrabHoverState();
    await this.activateVisualSuggestionForSelectedElement(target, grab);
    this.renderAnnotationModeShell();
  }

  private renderInlineAnnotationPopup(): string {
    if (!this.inlineAnnotationOpen) {
      return "";
    }
    const anchorRect = this.computeInlinePopupAnchorRect();
    if (!anchorRect) {
      return "";
    }
    const viewport = {
      width: window.innerWidth || 1,
      height: window.innerHeight || 1,
    };
    const placement = computeInlinePopupPlacement(
      anchorRect.rect,
      INLINE_POPUP_WIDTH_PX,
      INLINE_POPUP_ESTIMATED_HEIGHT_PX,
      viewport,
      anchorRect.scrollY,
      anchorRect.scrollX,
    );
    const isEditing =
      this.editingPinItemId !== null &&
      this.roundItems.some((item) => item.id === this.editingPinItemId);
    const editingItem = isEditing
      ? this.roundItems.find((item) => item.id === this.editingPinItemId) ?? null
      : null;
    const elementName = isEditing
      ? this.getInlinePopupElementName(editingItem)
      : this.pendingPinAnchor?.elementName ?? "Element";
    const draft = isEditing
      ? editingItem?.description ?? ""
      : this.inlinePopupDraft;
    const elementMissing =
      isEditing && !anchorRect.hasLiveElement
        ? '<span class="obv-inline-popup-missing">Element no longer on page</span>'
        : "";
    const submitLabel = isEditing ? "Save" : "Add";
    const positionStyle = `position: ${anchorRect.fixed ? "fixed" : "absolute"}; left: ${Math.round(placement.left)}px; top: ${Math.round(placement.top)}px;`;
    const arrowStyle = `left: ${Math.round(placement.arrowOffsetX)}px;`;
    const placementAttr = placement.placement;
    const shakeAttr =
      Date.now() < this.inlinePopupShakeUntil ? ' data-shake="true"' : "";
    const animReadyAttr = this.inlinePopupAnimReady ? "true" : "false";
    return `
      <div class="obv-inline-popup" data-annotation-popup="true" data-placement="${escapeHtml(placementAttr)}" data-fixed="${anchorRect.fixed ? "true" : "false"}" data-anim-ready="${animReadyAttr}"${shakeAttr} role="dialog" aria-modal="false" aria-label="${escapeHtml(isEditing ? `Edit annotation for ${elementName}` : `Add annotation for ${elementName}`)}" style="${positionStyle}">
        <div class="obv-inline-popup-arrow" style="${arrowStyle}" aria-hidden="true"></div>
        <div class="obv-inline-popup-header">
          <span class="obv-inline-popup-icon" aria-hidden="true">${createIcon("element")}</span>
          <span class="obv-inline-popup-element">${escapeHtml(elementName)}</span>
          ${elementMissing}
        </div>
        <textarea class="obv-inline-popup-textarea" data-inline-popup-textarea="true" rows="3" placeholder="What's the feedback?" aria-label="Annotation note">${escapeHtml(draft)}</textarea>
        ${this.renderInlineVisualSuggestionControls()}
        <div class="obv-inline-popup-actions">
          <div class="obv-inline-popup-actions-primary">
            <span class="obv-inline-popup-hint">${escapeHtml(this.getInlinePopupSubmitHint())}</span>
            <button class="obv-button obv-button-secondary" type="button" data-inline-popup-cancel="true">Cancel</button>
            <button class="obv-button" type="button" data-inline-popup-submit="true">${createIcon("check")}<span>${escapeHtml(submitLabel)}</span></button>
          </div>
        </div>
      </div>
    `;
  }

  private getInlinePopupSubmitHint(): string {
    return this.isMacPlatform() ? "\u2318 + Enter" : "Ctrl + Enter";
  }

  private renderInlineVisualSuggestionControls(): string {
    const manager = this.visualSuggestions;
    const active = manager?.getActiveElement();
    if (!manager || !active) return "";
    const targetOption = this.getActiveVisualSuggestionTargetOption();
    const properties = getVisualSuggestionTargetProperties(
      active.element,
      targetOption?.kind ?? getVisualSuggestionTargetKind(active.element),
    ).filter((property) => getVisualSuggestionSliderConfig(property) !== null);
    if (properties.length === 0) return "";

    const rows = properties
      .map((property) => {
        const label = VISUAL_SUGGESTION_PROPERTY_LABELS[property] ?? property;
        const sliderConfig = getVisualSuggestionSliderConfig(property);
        if (!sliderConfig) return "";
        const displayValue = manager.getCurrentDisplayValue(property);
        const override = manager.getOverrideForActiveElement(property);
        const parsed = parseCssNumericValue(displayValue);
        const sliderMin = sliderConfig.min;
        const sliderMax = sliderConfig.max;
        const sliderStep = sliderConfig.step;
        const sliderUnit = parsed?.unit || sliderConfig.unit || "px";
        const sliderValue = parsed
          ? Math.min(sliderMax, Math.max(sliderMin, parsed.value))
          : sliderMin;
        const shown = parsed
          ? parsed.value > sliderMax
            ? `${formatCssNumericValue(sliderMax, parsed.unit || sliderUnit)}+`
            : formatCssNumericValue(parsed.value, parsed.unit)
          : displayValue || "—";
        const sliderPercent =
          sliderMax > sliderMin
            ? ((sliderValue - sliderMin) / (sliderMax - sliderMin)) * 100
            : 0;
        return `
          <div class="obv-inline-vs-row" data-has-override="${override !== null}">
            <div class="obv-inline-vs-row-top">
              <span class="obv-inline-vs-label">${escapeHtml(label)}</span>
              <span class="obv-inline-vs-value" data-inline-vs-value="${escapeHtml(property)}">${escapeHtml(shown)}</span>
            </div>
            <div class="obv-inline-vs-control">
              <input type="range" class="obv-vs-slider obv-inline-vs-slider" data-inline-vs-slider="${escapeHtml(property)}" data-inline-vs-slider-unit="${escapeHtml(sliderUnit)}" min="${sliderMin}" max="${sliderMax}" step="${sliderStep}" value="${sliderValue}" style="--obv-vs-slider-percent: ${sliderPercent.toFixed(2)}%" aria-label="Adjust ${escapeHtml(label)}" />
              <button class="obv-inline-vs-revert" type="button" data-inline-vs-revert="${escapeHtml(property)}" aria-label="Revert ${escapeHtml(label)}">↺</button>
            </div>
          </div>
        `;
      })
      .join("");

    return `
      <div class="obv-inline-vs" role="group" aria-label="Preview visual changes">
        <div class="obv-inline-vs-header">
          <span>Preview changes</span>
          <span class="obv-inline-vs-sub">Optional</span>
        </div>
        ${rows}
      </div>
    `;
  }

  private getInlinePopupElementName(item: FeedbackRoundItem | null): string {
    if (!item) return "Element";
    const grab = item.elementGrabs?.find(
      (candidate) => candidate.id === item.pin?.elementGrabId,
    );
    const target = grab ?? item.elementGrabs?.[0];
    if (target) {
      return getElementGrabDisplayName(target);
    }
    return "Element";
  }

  private computeInlinePopupAnchorRect(): {
    rect: { left: number; top: number; width: number; height: number };
    scrollY: number;
    scrollX: number;
    fixed: boolean;
    hasLiveElement: boolean;
  } | null {
    if (this.editingPinItemId) {
      const item = this.roundItems.find(
        (candidate) => candidate.id === this.editingPinItemId,
      );
      const pin = item?.pin;
      if (!pin) return null;
      const grab = item?.elementGrabs?.find(
        (candidate) => candidate.id === pin.elementGrabId,
      );
      const liveElement = grab
        ? resolvePinElement(grab.cssSelector, null)
        : null;
      if (liveElement) {
        const rect = liveElement.getBoundingClientRect();
        return {
          rect: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
          },
          scrollY: pin.isFixed ? 0 : window.scrollY,
          scrollX: pin.isFixed ? 0 : window.scrollX,
          fixed: pin.isFixed,
          hasLiveElement: true,
        };
      }
      const xPx = (pin.xPct / 100) * (window.innerWidth || 1);
      return {
        rect: { left: xPx - 12, top: pin.yPx - 12, width: 24, height: 24 },
        scrollY: 0,
        scrollX: 0,
        fixed: pin.isFixed,
        hasLiveElement: false,
      };
    }
    const pending = this.pendingPinAnchor;
    if (!pending) return null;
    if (pending.element.isConnected) {
      const rect = pending.element.getBoundingClientRect();
      return {
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        scrollY: pending.isFixed ? 0 : window.scrollY,
        scrollX: pending.isFixed ? 0 : window.scrollX,
        fixed: pending.isFixed,
        hasLiveElement: true,
      };
    }
    const xPx = (pending.xPct / 100) * (window.innerWidth || 1);
    return {
      rect: { left: xPx - 12, top: pending.yPx - 12, width: 24, height: 24 },
      scrollY: 0,
      scrollX: 0,
      fixed: pending.isFixed,
      hasLiveElement: false,
    };
  }

  private bindInlineAnnotationPopup(): void {
    const popup = this.shadowRoot.querySelector(
      '[data-annotation-popup="true"]',
    );
    if (!(popup instanceof HTMLElement)) {
      return;
    }
    if (!this.inlinePopupAnimReady) {
      window.requestAnimationFrame(() => {
        if (!popup.isConnected) return;
        this.inlinePopupAnimReady = true;
        popup.setAttribute("data-anim-ready", "true");
      });
    }
    const textarea = popup.querySelector(
      '[data-inline-popup-textarea="true"]',
    );
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.addEventListener("input", () => {
        this.inlinePopupDraft = textarea.value;
        if (this.editingPinItemId !== null) {
          const editingId = this.editingPinItemId;
          this.roundItems = this.roundItems.map((item) =>
            item.id === editingId
              ? { ...item, description: textarea.value }
              : item,
          );
          this.persistDraftRound();
        }
      });
      textarea.addEventListener("keydown", (event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key === "Enter" &&
          !event.shiftKey
        ) {
          event.preventDefault();
          this.handleInlineAnnotationSubmit();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this.closeInlineAnnotationPopup();
        }
      });
      textarea.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      window.requestAnimationFrame(() => {
        if (!textarea.isConnected) return;
        textarea.focus();
        const value = textarea.value;
        if (value.length > 0) {
          textarea.setSelectionRange(value.length, value.length);
        }
      });
    }
    popup
      .querySelector('[data-inline-popup-submit="true"]')
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        this.handleInlineAnnotationSubmit();
      });
    popup
      .querySelector('[data-inline-popup-cancel="true"]')
      ?.addEventListener("click", (event) => {
        event.stopPropagation();
        this.closeInlineAnnotationPopup();
      });
    popup.addEventListener("click", (event) => {
      event.stopPropagation();
    });
    popup.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
  }

  private bindInlineVisualSuggestionControls(): void {
    const manager = this.visualSuggestions;
    if (!manager) return;

    this.shadowRoot
      .querySelectorAll("[data-inline-vs-revert]")
      .forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const property = button.getAttribute("data-inline-vs-revert");
          if (!isVisualSuggestionProperty(property)) return;
          manager.clearPropertyOverride(property);
          this.renderAnnotationModeShell();
        });
      });

    this.shadowRoot
      .querySelectorAll("[data-inline-vs-slider]")
      .forEach((element) => {
        const property = element.getAttribute("data-inline-vs-slider");
        if (!isVisualSuggestionProperty(property)) return;
        const sliderUnit = parseSliderUnit(
          element.getAttribute("data-inline-vs-slider-unit") ?? "px",
        );
        element.addEventListener("input", () => {
          if (!isInputLikeElement(element)) return;
          const next = `${element.value}${sliderUnit}`;
          const min = Number(element.min);
          const max = Number(element.max);
          const value = Number(element.value);
          const percent =
            Number.isFinite(min) && Number.isFinite(max) && max > min
              ? ((value - min) / (max - min)) * 100
              : 0;
          element.style.setProperty(
            "--obv-vs-slider-percent",
            `${Math.min(100, Math.max(0, percent)).toFixed(2)}%`,
          );
          manager.setPropertyOverride(property, next);
          element.closest("[data-has-override]")?.setAttribute(
            "data-has-override",
            "true",
          );
          const valueElement = this.shadowRoot.querySelector(
            `[data-inline-vs-value="${property}"]`,
          );
          if (valueElement) {
            valueElement.textContent = next;
          }
        });
      });
  }

  private handleInlineAnnotationSubmit(): void {
    if (this.editingPinItemId !== null) {
      const targetId = this.editingPinItemId;
      const text = this.inlinePopupDraft.trim();
      const existing = this.roundItems.find((item) => item.id === targetId);
      if (!existing) {
        this.closeInlineAnnotationPopup();
        return;
      }
      const description =
        text.length > 0 ? text : existing.description.trim();
      if (description.length === 0) {
        this.shakeInlineAnnotationPopup();
        return;
      }
      const visualSuggestions =
        this.visualSuggestions?.commitCurrentLine() ?? [];
      this.roundItems = this.roundItems.map((item) =>
        item.id === targetId
          ? {
              ...item,
              description,
              visualSuggestions:
                visualSuggestions.length > 0
                  ? visualSuggestions
                  : item.visualSuggestions,
            }
          : item,
      );
      this.persistDraftRound();
      this.emitOpenIssueCountChange();
      if (this.annotationReturnToCardAfterSubmit) {
        this.focusedItemId = targetId;
        this.exitAnnotationMode({ openCard: true });
        return;
      }
      this.closeInlineAnnotationPopup({ discardVisualSuggestions: false });
      return;
    }
    const pending = this.pendingPinAnchor;
    if (!pending) {
      this.closeInlineAnnotationPopup();
      return;
    }
    const text = this.inlinePopupDraft.trim();
    if (text.length === 0) {
      this.shakeInlineAnnotationPopup();
      return;
    }
    if (this.roundItems.length >= MAX_ROUND_ITEMS) {
      this.closeInlineAnnotationPopup();
      return;
    }
    const pin: FeedbackPin = {
      xPct: pending.xPct,
      yPx: pending.yPx,
      isFixed: pending.isFixed,
      elementGrabId: pending.grab.id,
    };
    const visualSuggestions =
      this.visualSuggestions?.commitCurrentLine() ?? [];
    const sourceItemId = this.pendingPinSourceItemId;
    if (sourceItemId && sourceItemId !== "__new") {
      const targetId = sourceItemId;
      const existingItem = this.roundItems.find((item) => item.id === targetId);
      if (existingItem) {
        this.roundItems = this.roundItems.map((item) =>
          item.id === targetId
            ? {
                ...item,
                description: text,
                elementGrabs: [...(item.elementGrabs ?? []), pending.grab],
                visualSuggestions:
                  visualSuggestions.length > 0
                    ? visualSuggestions
                    : item.visualSuggestions,
                pin,
              }
            : item,
        );
        this.freshPinIds.add(targetId);
        this.pendingPinAnchor = null;
        this.pendingPinSourceItemId = null;
        this.inlinePopupDraft = "";
        this.inlineAnnotationOpen = false;
        this.editingPinItemId = null;
        this.persistDraftRound();
        this.emitOpenIssueCountChange();
        this.focusedItemId = targetId;
        this.exitAnnotationMode({ openCard: true });
        return;
      }
    }
    const newItem: FeedbackRoundItem = {
      id: createRoundItemId(),
      description: text,
      elementGrabs: [pending.grab],
      visualSuggestions:
        visualSuggestions.length > 0 ? visualSuggestions : undefined,
      pin,
    };
    this.freshPinIds.add(newItem.id);
    const shouldOpenCardAfterSubmit =
      this.annotationReturnToCardAfterSubmit ||
      this.getPinnedItemsWithIndex().length === 0;
    this.roundItems = [...this.roundItems, newItem];
    this.pendingPinAnchor = null;
    this.pendingPinSourceItemId = null;
    this.inlinePopupDraft = "";
    this.inlineAnnotationOpen = false;
    this.editingPinItemId = null;
    if (sourceItemId === "__new") {
      this.newRowDraft = "";
      this.clearSubmissionDraftState();
    }
    this.persistDraftRound();
    this.emitOpenIssueCountChange();
    if (shouldOpenCardAfterSubmit) {
      this.focusedItemId = newItem.id;
      this.exitAnnotationMode({ openCard: true });
      return;
    }
    this.renderAnnotationModeShell();
  }

  private closeInlineAnnotationPopup(
    options: { discardVisualSuggestions?: boolean } = {},
  ): void {
    if (!this.inlineAnnotationOpen) return;
    if (this.editingPinItemId !== null) {
      this.saveActiveInlineVisualSuggestionsToItem(this.editingPinItemId);
    } else if (options.discardVisualSuggestions !== false) {
      const active = this.visualSuggestions?.getActiveElement();
      if (active) {
        this.visualSuggestions?.removeElement(active.ref.id);
      }
    } else {
      this.visualSuggestions?.closeActiveElement();
    }
    this.inlineAnnotationOpen = false;
    this.editingPinItemId = null;
    this.pendingPinAnchor = null;
    this.pendingPinSourceItemId = null;
    this.inlinePopupDraft = "";
    if (this.annotationModeActive) {
      this.renderAnnotationModeShell();
    }
  }

  private shakeInlineAnnotationPopup(): void {
    this.inlinePopupShakeUntil = Date.now() + 320;
    const popup = this.shadowRoot.querySelector(
      '[data-annotation-popup="true"]',
    );
    if (popup instanceof HTMLElement) {
      popup.setAttribute("data-shake", "true");
      window.setTimeout(() => {
        popup.removeAttribute("data-shake");
      }, 320);
    }
  }

  private renderPinLayer(): string {
    const pinned = this.getPinnedItemsWithIndex();
    if (pinned.length === 0) {
      return "";
    }
    const scrollMarkers: string[] = [];
    const fixedMarkers: string[] = [];
    for (const entry of pinned) {
      const pin = entry.item.pin;
      if (!pin) continue;
      const isActive = entry.item.id === this.editingPinItemId;
      const previewText = (entry.item.description ?? "").trim();
      const previewSnippet = previewText.slice(0, 80);
      const tooltipHtml =
        previewSnippet.length > 0
          ? `<span class="obv-pin-tooltip" aria-hidden="true"><span class="obv-pin-tooltip-index">#${entry.index}</span><span class="obv-pin-tooltip-text">${escapeHtml(previewSnippet)}${previewText.length > previewSnippet.length ? "\u2026" : ""}</span></span>`
          : `<span class="obv-pin-tooltip" aria-hidden="true"><span class="obv-pin-tooltip-index">#${entry.index}</span></span>`;
      const label =
        previewSnippet.length > 0 ? previewSnippet : "annotation";
      const freshAttr = this.freshPinIds.has(entry.item.id)
        ? ' data-fresh="true"'
        : "";
      const button = `<button class="obv-pin" data-pin-item-id="${escapeHtml(entry.item.id)}" type="button" style="left: ${pin.xPct.toFixed(3)}%; top: ${Math.round(pin.yPx)}px;"${isActive ? ' data-active="true"' : ""}${freshAttr} aria-label="Edit annotation ${entry.index}: ${escapeHtml(label)}"><span class="obv-pin-number">${entry.index}</span>${tooltipHtml}</button>`;
      if (pin.isFixed) {
        fixedMarkers.push(button);
      } else {
        scrollMarkers.push(button);
      }
    }
    const scrollLayer =
      scrollMarkers.length > 0
        ? `<div class="obv-pin-layer obv-pin-layer-scroll" aria-hidden="true">${scrollMarkers.join("")}</div>`
        : "";
    const fixedLayer =
      fixedMarkers.length > 0
        ? `<div class="obv-pin-layer obv-pin-layer-fixed" aria-hidden="true">${fixedMarkers.join("")}</div>`
        : "";
    return `${scrollLayer}${fixedLayer}`;
  }

  private bindPinLayer(): void {
    const pins = this.shadowRoot.querySelectorAll(".obv-pin");
    pins.forEach((pin) => {
      if (!(pin instanceof HTMLElement)) return;
      const itemId = pin.getAttribute("data-pin-item-id");
      if (!itemId) return;
      pin.addEventListener("click", (event) => {
        event.stopPropagation();
        event.preventDefault();
        this.handlePinClick(itemId);
      });
      pin.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
      });
      if (pin.hasAttribute("data-fresh")) {
        pin.addEventListener(
          "animationend",
          () => pin.removeAttribute("data-fresh"),
          { once: true },
        );
      }
    });
    this.freshPinIds.clear();
  }

  private handlePinClick(itemId: string): void {
    if (!this.annotationModeActive) {
      this.enterAnnotationMode({
        returnToCardAfterSubmit: this.annotationReturnToCardAfterSubmit,
      });
    }
    if (this.inlineAnnotationOpen && this.editingPinItemId !== itemId) {
      this.shakeInlineAnnotationPopup();
      return;
    }
    if (this.inlineAnnotationOpen && this.editingPinItemId === itemId) {
      return;
    }
    const item = this.roundItems.find((candidate) => candidate.id === itemId);
    if (!item || !item.pin) return;
    this.editingPinItemId = itemId;
    this.pendingPinAnchor = null;
    this.inlineAnnotationOpen = true;
    this.inlinePopupDraft = item.description;
    this.clearElementGrabHoverState();
    this.activateInlineVisualSuggestionsForItem(item);
    this.renderAnnotationModeShell();
  }

  private handlePinDelete(itemId: string): void {
    const wasEditing = this.editingPinItemId === itemId;
    this.roundItems = this.roundItems.filter((item) => item.id !== itemId);
    if (wasEditing) {
      this.inlineAnnotationOpen = false;
      this.editingPinItemId = null;
      this.pendingPinAnchor = null;
      this.inlinePopupDraft = "";
    }
    this.persistDraftRound();
    this.emitOpenIssueCountChange();
    if (this.annotationModeActive) {
      this.renderAnnotationModeShell();
    }
  }

  private startPinPositionTicker(): void {
    if (this.pinPositionRafHandle !== null) return;
    if (typeof window.requestAnimationFrame !== "function") return;
    let lastTickAt = 0;
    const tick = (timestamp: number): void => {
      this.pinPositionRafHandle = null;
      if (this.destroyed || !this.annotationModeActive) {
        return;
      }
      if (timestamp - lastTickAt >= PIN_TICKER_INTERVAL_MS) {
        lastTickAt = timestamp;
        this.refreshPinPositions();
      }
      this.pinPositionRafHandle = window.requestAnimationFrame(tick);
    };
    this.pinPositionRafHandle = window.requestAnimationFrame(tick);
  }

  private stopPinPositionTicker(): void {
    if (this.pinPositionRafHandle !== null) {
      const cancel = window.cancelAnimationFrame ?? window.clearTimeout;
      cancel(this.pinPositionRafHandle);
      this.pinPositionRafHandle = null;
    }
  }

  private installPinScrollListener(): void {
    if (this.pinScrollListenerInstalled) return;
    window.addEventListener("scroll", this.handlePinViewportChange, true);
    this.pinScrollListenerInstalled = true;
  }

  private uninstallPinScrollListener(): void {
    if (!this.pinScrollListenerInstalled) return;
    window.removeEventListener("scroll", this.handlePinViewportChange, true);
    this.pinScrollListenerInstalled = false;
  }

  private installPinResizeObserver(): void {
    if (this.pinResizeObserver !== null) return;
    if (typeof ResizeObserver === "undefined") return;
    if (typeof document === "undefined" || !document.documentElement) return;
    this.pinResizeObserver = new ResizeObserver(() => {
      this.refreshPinPositions();
    });
    this.pinResizeObserver.observe(document.documentElement);
  }

  private uninstallPinResizeObserver(): void {
    if (this.pinResizeObserver !== null) {
      this.pinResizeObserver.disconnect();
      this.pinResizeObserver = null;
    }
  }

  private readonly handlePinViewportChange = (): void => {
    this.refreshPinPositions();
  };

  private refreshPinPositions(): void {
    if (!this.annotationModeActive) return;
    let dirty = false;
    const innerWidth = window.innerWidth || 1;
    const scrollY = window.scrollY || 0;
    this.roundItems = this.roundItems.map((item) => {
      if (!item.pin || !item.elementGrabs) return item;
      const grab = item.elementGrabs.find(
        (candidate) => candidate.id === item.pin?.elementGrabId,
      );
      if (!grab) return item;
      const element = resolvePinElement(grab.cssSelector, null);
      if (!element) return item;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return item;
      const fixedNow = isElementFixed(element);
      const anchor = computePinAnchor(
        {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
        fixedNow,
        innerWidth,
        scrollY,
      );
      const xDelta = Math.abs(item.pin.xPct - anchor.xPct);
      const yDelta = Math.abs(item.pin.yPx - anchor.yPx);
      if (
        item.pin.isFixed === fixedNow &&
        xDelta < PIN_REANCHOR_THRESHOLD_PX / 10 &&
        yDelta < PIN_REANCHOR_THRESHOLD_PX
      ) {
        return item;
      }
      dirty = true;
      return {
        ...item,
        pin: {
          ...item.pin,
          xPct: anchor.xPct,
          yPx: anchor.yPx,
          isFixed: fixedNow,
        },
      };
    });
    if (dirty) {
      this.persistDraftRound();
      this.updatePinLayerDom();
    }
    if (this.inlineAnnotationOpen) {
      this.updateInlinePopupAnchorDom();
    }
  }

  private updatePinLayerDom(): void {
    const pinned = this.getPinnedItemsWithIndex();
    const map = new Map(pinned.map((entry) => [entry.item.id, entry]));
    const pins = this.shadowRoot.querySelectorAll(".obv-pin");
    let needsFullRender = false;
    pins.forEach((node) => {
      if (!(node instanceof HTMLElement)) return;
      const id = node.getAttribute("data-pin-item-id");
      if (!id) return;
      const entry = map.get(id);
      if (!entry) return;
      const pin = entry.item.pin;
      if (!pin) return;
      node.style.left = `${pin.xPct.toFixed(3)}%`;
      node.style.top = `${Math.round(pin.yPx)}px`;
      const parent = node.parentElement;
      if (parent instanceof HTMLElement) {
        const inFixedLayer = parent.classList.contains("obv-pin-layer-fixed");
        if (inFixedLayer !== pin.isFixed) {
          needsFullRender = true;
        }
      }
    });
    if (needsFullRender) {
      this.renderAnnotationModeShell();
    }
  }

  private updateInlinePopupAnchorDom(): void {
    const popup = this.shadowRoot.querySelector(
      '[data-annotation-popup="true"]',
    );
    if (!(popup instanceof HTMLElement)) return;
    const anchorRect = this.computeInlinePopupAnchorRect();
    if (!anchorRect) return;
    const viewport = {
      width: window.innerWidth || 1,
      height: window.innerHeight || 1,
    };
    const placement = computeInlinePopupPlacement(
      anchorRect.rect,
      popup.offsetWidth || INLINE_POPUP_WIDTH_PX,
      popup.offsetHeight || INLINE_POPUP_ESTIMATED_HEIGHT_PX,
      viewport,
      anchorRect.scrollY,
      anchorRect.scrollX,
    );
    popup.style.position = anchorRect.fixed ? "fixed" : "absolute";
    popup.style.left = `${Math.round(placement.left)}px`;
    popup.style.top = `${Math.round(placement.top)}px`;
    popup.setAttribute("data-placement", placement.placement);
    popup.setAttribute("data-fixed", anchorRect.fixed ? "true" : "false");
    const arrow = popup.querySelector(".obv-inline-popup-arrow");
    if (arrow instanceof HTMLElement) {
      arrow.style.left = `${Math.round(placement.arrowOffsetX)}px`;
    }
  }
}

