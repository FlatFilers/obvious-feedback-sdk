import { ObviousFeedbackWidget } from "./widget/ObviousFeedbackWidget";
import type { FeedbackSdkConfig, FeedbackSdkHandle } from "./public-types";
export type {
  ElementGrabHoverInfo,
  ElementGrabItem,
  ElementGrabRect,
  ElementSourceInfo,
  ElementSourceLocation,
  ElementSourceResolver,
  ElementSourceStackFrame,
  FeedbackAiSummary,
  FeedbackClientStatus,
  FeedbackContext,
  FeedbackContextCiStatus,
  FeedbackContextPrStatus,
  FeedbackContextReviewStatus,
  FeedbackDesignSystemConfig,
  FeedbackIssueLinks,
  FeedbackIssueSeverity,
  FeedbackIssueType,
  FeedbackPullRequestLink,
  FeedbackRoundSubmitResponse,
  FeedbackSdkConfig,
  FeedbackSdkHandle,
  FeedbackSdkTheme,
  FeedbackStatusResponse,
  FeedbackSubmissionInput,
  FeedbackVisualSuggestion,
  FeedbackVisualSuggestionIntent,
  FeedbackVisualSuggestionProperty,
  FeedbackVisualSuggestionSource,
  FeedbackVisualSuggestionToken,
  FeedbackVisualSuggestionTokenCategory,
  FeedbackVisualSuggestionTokenSource,
  FeedbackWorkerThreadLink,
  SessionReplayUrlResolver,
} from "./public-types";

let activeWidget: ObviousFeedbackWidget | null = null;

export const ObviousFeedback = {
  init(config: FeedbackSdkConfig): FeedbackSdkHandle {
    if (!config.publicKey && !config.previewOnly) {
      throw new Error("ObviousFeedback.init requires publicKey");
    }
    activeWidget?.destroy();
    activeWidget = new ObviousFeedbackWidget(config);
    return {
      destroy: () => {
        activeWidget?.destroy();
        activeWidget = null;
      },
      open: () => activeWidget?.enterAnnotationMode(),
      enterAnnotationMode: () => activeWidget?.enterAnnotationMode(),
      exitAnnotationMode: () => activeWidget?.exitAnnotationMode(),
      submit: () => activeWidget?.submit() ?? Promise.resolve(),
      getDraftPinCount: () => activeWidget?.getDraftPinCount() ?? 0,
      subscribeToDraftPinCount: (listener) =>
        activeWidget?.subscribeToDraftPinCount(listener) ?? (() => {}),
      isToolbarVisible: () => activeWidget?.isToolbarVisible() ?? true,
      setToolbarVisible: (visible) => {
        activeWidget?.setToolbarVisible(visible);
      },
      toggleToolbarVisible: () =>
        activeWidget?.toggleToolbarVisible() ?? true,
      getOpenIssueCount: () => 0,
      subscribeToOpenIssueCount: (listener) => {
        listener(0);
        return () => {};
      },
    };
  },
};

function initFromCurrentScript(): void {
  const script = document.currentScript;
  if (!(script instanceof HTMLScriptElement)) {
    return;
  }
  const publicKey = script.dataset.pubKey;
  if (!publicKey) {
    return;
  }
  const dataTheme = script.dataset.theme;
  ObviousFeedback.init({
    publicKey,
    apiBaseUrl: script.dataset.apiBaseUrl,
    identityToken: script.dataset.identityToken,
    env: script.dataset.env,
    theme:
      dataTheme === "light" || dataTheme === "dark" || dataTheme === "system"
        ? dataTheme
        : undefined,
  });
}

if (typeof document !== "undefined") {
  initFromCurrentScript();
}
