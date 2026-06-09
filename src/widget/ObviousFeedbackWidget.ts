/**
 * ObviousFeedbackWidget — thin coordinator for the SDK's three UI surfaces:
 *
 * - {@link FeedbackToolbar}: the always-on draggable toolbar at the bottom of
 *   the host page.
 * - {@link AnnotationMode}: the element picker shown after clicking Comment.
 * - {@link PinOverlay}: the numbered pin markers + per-pin comment popovers.
 *
 * Each pin maps 1:1 to a round item in the existing
 * `/v1/feedback/submit-round` payload. Send submits every draft pin in one
 * batch, then clears the overlay.
 */

import {
  createConsoleBuffer,
  createNetworkBuffer,
  type ConsoleLogEntry,
  type NetworkLogEntry,
} from "../browser/log-capture";
import { DEFAULT_API_BASE_URL, DEFAULT_ENV, MAX_TEXT_LENGTH } from "../constants";
import type {
  ElementGrabItem,
  ElementSourceInfo,
  FeedbackContext,
  FeedbackSdkConfig,
  FeedbackSdkTheme,
  FeedbackVisualSuggestion,
} from "../public-types";
import { truncateText } from "../utils/html";
import { redactUrl } from "../utils/url";
import { SDK_VERSION } from "../version";
import {
  AnnotationMode,
  type AnnotationPick,
} from "./annotation-mode";
import {
  buildCssSelector,
  createElementGrabId,
  createElementGrabRect,
  truncateOuterHtml,
} from "./element-grab";
import {
  FeedbackToolbar,
  type FeedbackToolbarStatus,
} from "./feedback-toolbar";
import {
  PinOverlay,
  buildPinAnchor,
  type DraftPinSnapshot,
} from "./pin-overlay";
import { normalizeFeedbackRoundSubmitResponse } from "./feedback-normalizers";
import { createFeedbackRoundSubmitUrl } from "./transport";

interface PinElementGrabPair {
  pinId: string;
  grab: ElementGrabItem;
}

const TOOLBAR_HOST_ATTR = "data-obvious-feedback-toolbar";
const PIN_LAYER_HOST_ATTR = "data-obvious-feedback-pin-layer";
const PICKER_HOST_ATTR = "data-obvious-feedback-pick-overlay";

export class ObviousFeedbackWidget {
  private readonly config: FeedbackSdkConfig;
  private readonly toolbar: FeedbackToolbar;
  private readonly pinOverlay: PinOverlay;
  private readonly annotation: AnnotationMode;
  private readonly grabs: PinElementGrabPair[] = [];
  private readonly consoleBuffer: ReturnType<typeof createConsoleBuffer>;
  private readonly networkBuffer: ReturnType<typeof createNetworkBuffer>;
  private readonly listeners = new Set<(count: number) => void>();
  private readonly themeQuery: MediaQueryList | null;
  private themeListener: ((event: MediaQueryListEvent) => void) | null = null;
  private navigationCleanup: (() => void) | null = null;
  private theme: FeedbackSdkTheme;
  private destroyed = false;
  private submitting = false;

  constructor(config: FeedbackSdkConfig) {
    this.config = normalizeConfig(config);
    this.theme = this.config.theme ?? "light";

    this.consoleBuffer = this.config.captureConsole
      ? createConsoleBuffer()
      : { read: () => [] as ConsoleLogEntry[], restore: () => undefined };
    this.networkBuffer = this.config.captureNetwork
      ? createNetworkBuffer()
      : { read: () => [] as NetworkLogEntry[], restore: () => undefined };

    this.themeQuery = resolveThemeQuery(this.theme);
    if (this.themeQuery) {
      this.themeListener = (): void => this.applyResolvedTheme();
      this.themeQuery.addEventListener("change", this.themeListener);
    }

    this.pinOverlay = new PinOverlay({
      theme: this.getResolvedTheme(),
      designSystem: this.config.designSystem,
    });

    this.toolbar = new FeedbackToolbar({
      context: this.config.context,
      theme: this.getResolvedTheme(),
      initialPinCount: 0,
      onCommentClick: () => this.handleCommentClick(),
      onSendClick: () => {
        void this.submit();
      },
    });

    this.annotation = new AnnotationMode({
      onPicked: (pick) => this.handleElementPicked(pick),
      onCancel: () => this.handleAnnotationCanceled(),
      shouldIgnore: (target) => this.shouldIgnoreTarget(target),
    });

    this.pinOverlay.subscribeCount((count) => {
      this.toolbar.setPinCount(count);
      this.notifyCount(count);
    });

    this.pinOverlay.subscribePopoverOpen((open) => {
      this.toolbar.setPopoverSuppressed(open);
    });

    this.navigationCleanup = observeLocationChanges(() =>
      this.handleLocationChanged(),
    );
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    if (this.themeQuery && this.themeListener) {
      this.themeQuery.removeEventListener("change", this.themeListener);
    }
    this.themeListener = null;
    this.navigationCleanup?.();
    this.navigationCleanup = null;
    this.annotation.destroy();
    this.toolbar.destroy();
    this.pinOverlay.destroy();
    this.consoleBuffer.restore();
    this.networkBuffer.restore();
    this.listeners.clear();
  }

  enterAnnotationMode(): void {
    if (this.destroyed || this.annotation.isActive()) {
      return;
    }
    this.toolbar.setStatus("picking");
    this.annotation.start();
  }

  exitAnnotationMode(): void {
    if (!this.annotation.isActive()) {
      return;
    }
    this.annotation.stop("cancel");
    this.toolbar.setStatus("idle");
  }

  async submit(): Promise<void> {
    if (this.destroyed || this.submitting) {
      return;
    }
    if (this.config.previewOnly) {
      this.setStatus("error", this.config.previewOnlyReason ?? "Preview mode");
      return;
    }
    const pins = this.pinOverlay.getPins();
    if (pins.length === 0) {
      return;
    }
    if (!this.config.publicKey) {
      this.setStatus("error", "Missing public key");
      return;
    }
    this.submitting = true;
    this.setStatus("sending");
    try {
      const submitResult = await this.postRound(pins);
      this.applySubmitResultLinks(submitResult);
      this.pinOverlay.clearAll();
      this.grabs.length = 0;
      this.setStatus("sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Send failed";
      this.setStatus("error", message);
      console.warn("[ObviousFeedback] submission failed", error);
    } finally {
      this.submitting = false;
    }
  }

  getDraftPinCount(): number {
    return this.pinOverlay.getPinCount();
  }

  subscribeToDraftPinCount(listener: (count: number) => void): () => void {
    this.listeners.add(listener);
    listener(this.pinOverlay.getPinCount());
    return () => {
      this.listeners.delete(listener);
    };
  }

  isToolbarVisible(): boolean {
    return !this.toolbar.isUserHidden();
  }

  setToolbarVisible(visible: boolean): void {
    this.toolbar.setUserHidden(!visible);
  }

  toggleToolbarVisible(): boolean {
    return !this.toolbar.toggleUserHidden();
  }

  private notifyCount(count: number): void {
    for (const listener of this.listeners) {
      try {
        listener(count);
      } catch (error) {
        console.warn(
          "[ObviousFeedback] draft pin count listener threw",
          error,
        );
      }
    }
  }

  private setStatus(
    status: FeedbackToolbarStatus,
    errorMessage?: string,
  ): void {
    this.toolbar.setStatus(status, errorMessage ?? null);
  }

  private handleCommentClick(): void {
    if (this.annotation.isActive()) {
      this.exitAnnotationMode();
      return;
    }
    this.enterAnnotationMode();
  }

  private clearDraftFeedback(): void {
    if (this.submitting) {
      return;
    }
    this.exitAnnotationMode();
    this.pinOverlay.clearAll();
    this.grabs.length = 0;
    this.toolbar.setStatus("idle");
  }

  private handleLocationChanged(): void {
    if (this.destroyed) {
      return;
    }
    this.clearDraftFeedback();
  }

  private handleAnnotationCanceled(): void {
    this.toolbar.setStatus("idle");
  }

  private async handleElementPicked(pick: AnnotationPick): Promise<void> {
    this.toolbar.setStatus(
      this.pinOverlay.getPinCount() === 0 ? "annotating" : "annotating",
    );
    const anchor = buildPinAnchor(pick.element, pick.selector);
    const liveElement = pick.element instanceof HTMLElement ? pick.element : null;
    const pin = this.pinOverlay.addPin(anchor, liveElement);
    try {
      const grab = await this.createElementGrab(pick.element);
      this.grabs.push({ pinId: pin.id, grab });
    } catch (error) {
      console.warn(
        "[ObviousFeedback] failed to capture element grab for pin",
        error,
      );
    }
  }

  private async createElementGrab(target: Element): Promise<ElementGrabItem> {
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

  private async resolveElementSourceInfo(
    target: Element,
  ): Promise<ElementSourceInfo | null> {
    if (!this.config.elementSourceResolver) {
      return null;
    }
    try {
      return await this.config.elementSourceResolver(target);
    } catch (error) {
      console.debug(
        "[ObviousFeedback] element source resolver failed",
        error,
      );
      return null;
    }
  }

  private shouldIgnoreTarget(target: Element): boolean {
    return Boolean(
      target.closest(`[${TOOLBAR_HOST_ATTR}]`) ||
        target.closest(`[${PIN_LAYER_HOST_ATTR}]`) ||
        target.closest(`[${PICKER_HOST_ATTR}]`),
    );
  }

  private async resolveSessionReplayUrl(): Promise<string | undefined> {
    const resolver = this.config.sessionReplayUrlResolver;
    if (!resolver) {
      return undefined;
    }
    try {
      const result = await Promise.race([
        Promise.resolve(resolver()),
        new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 1500);
        }),
      ]);
      const trimmed = typeof result === "string" ? result.trim() : "";
      return trimmed.length > 0 ? trimmed : undefined;
    } catch (error) {
      console.debug(
        "[ObviousFeedback] session replay resolver failed",
        error,
      );
      return undefined;
    }
  }

  private applySubmitResultLinks(
    submitResult: ReturnType<typeof normalizeFeedbackRoundSubmitResponse>,
  ): void {
    if (!submitResult) {
      return;
    }
    const nextContext: FeedbackContext = {
      ...this.config.context,
      issueUrl: submitResult.issueUrl,
      ...(submitResult.workerThread
        ? { threadUrl: submitResult.workerThread.url }
        : {}),
    };
    this.toolbar.setContext(nextContext);
  }

  private async postRound(
    pins: DraftPinSnapshot[],
  ): Promise<ReturnType<typeof normalizeFeedbackRoundSubmitResponse>> {
    const sessionReplayUrl = await this.resolveSessionReplayUrl();
    const items = pins.map((pin) => buildRoundItem(pin, this.grabs));
    const response = await fetch(
      createFeedbackRoundSubmitUrl(this.config.apiBaseUrl ?? DEFAULT_API_BASE_URL),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: this.config.publicKey,
          identityToken: this.config.identityToken,
          sessionReplayUrl,
          env: this.config.env,
          prNumber: this.config.context?.prNumber ?? this.config.prNumber,
          sourceUrl: redactUrl(window.location.href),
          sdkVersion: SDK_VERSION,
          items,
          consoleLogs: this.consoleBuffer.read(),
          networkLog: this.networkBuffer.read(),
          context: this.buildSubmissionContext(),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Feedback submission failed (${response.status})`);
    }
    const payload: unknown = await response.json();
    return normalizeFeedbackRoundSubmitResponse(payload);
  }

  private buildSubmissionContext(): Record<string, unknown> | undefined {
    if (!this.config.capturePageContext) {
      return undefined;
    }
    return {
      url: redactUrl(window.location.href),
      userAgent: navigator.userAgent,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: window.scrollX, y: window.scrollY },
      feedbackContext: this.config.context,
    };
  }

  private getResolvedTheme(): FeedbackSdkTheme {
    if (this.theme !== "system") {
      return this.theme;
    }
    return this.themeQuery?.matches ? "dark" : "light";
  }

  private applyResolvedTheme(): void {
    const resolved = this.getResolvedTheme();
    this.toolbar.setTheme(resolved);
    this.pinOverlay.setTheme(resolved);
  }
}

function normalizeConfig(config: FeedbackSdkConfig): FeedbackSdkConfig {
  const context = config.context
    ? { ...config.context, prNumber: config.context.prNumber ?? config.prNumber }
    : config.prNumber
      ? { prNumber: config.prNumber }
      : undefined;
  return {
    ...config,
    apiBaseUrl: config.apiBaseUrl ?? DEFAULT_API_BASE_URL,
    env: config.env ?? DEFAULT_ENV,
    capturePageContext: config.capturePageContext ?? true,
    captureConsole: config.captureConsole ?? false,
    captureNetwork: config.captureNetwork ?? false,
    theme: config.theme ?? "light",
    context,
  };
}

function resolveThemeQuery(theme: FeedbackSdkTheme): MediaQueryList | null {
  if (theme !== "system" || typeof window === "undefined" || !window.matchMedia) {
    return null;
  }
  try {
    return window.matchMedia("(prefers-color-scheme: dark)");
  } catch {
    return null;
  }
}

function observeLocationChanges(onChange: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  let currentHref = window.location.href;
  const notifyIfChanged = (): void => {
    const nextHref = window.location.href;
    if (nextHref === currentHref) {
      return;
    }
    currentHref = nextHref;
    onChange();
  };

  const originalPushState = window.history.pushState;
  const originalReplaceState = window.history.replaceState;
  window.history.pushState = function pushState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalPushState.call(window.history, data, unused, url);
    notifyIfChanged();
  };
  window.history.replaceState = function replaceState(
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalReplaceState.call(window.history, data, unused, url);
    notifyIfChanged();
  };

  window.addEventListener("popstate", notifyIfChanged);
  window.addEventListener("hashchange", notifyIfChanged);

  return () => {
    window.history.pushState = originalPushState;
    window.history.replaceState = originalReplaceState;
    window.removeEventListener("popstate", notifyIfChanged);
    window.removeEventListener("hashchange", notifyIfChanged);
  };
}

function buildRoundItem(
  pin: DraftPinSnapshot,
  grabs: PinElementGrabPair[],
): {
  description: string;
  elementGrabs?: ElementGrabItem[];
  visualSuggestions?: FeedbackVisualSuggestion[];
  pin: {
    number: number;
    selector: string;
    rect: { left: number; top: number; width: number; height: number };
  };
} {
  const grab = grabs.find((entry) => entry.pinId === pin.id)?.grab;
  const description =
    pin.comment.trim().length > 0 ? pin.comment.trim() : `Pin ${pin.number}`;
  return {
    description,
    elementGrabs: grab ? [grab] : undefined,
    visualSuggestions: pin.overrides.length > 0 ? pin.overrides : undefined,
    pin: {
      number: pin.number,
      selector: pin.anchor.selector,
      rect: pin.anchor.rect,
    },
  };
}
