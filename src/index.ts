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
  FeedbackIssueLinks,
  FeedbackIssueSeverity,
  FeedbackIssueType,
  FeedbackPullRequestLink,
  FeedbackSdkConfig,
  FeedbackSdkHandle,
  FeedbackSdkTheme,
  FeedbackStatusResponse,
  FeedbackSubmissionInput,
  FeedbackVisualSuggestion,
  FeedbackVisualSuggestionProperty,
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
      enterAnnotationMode: () => activeWidget?.enterAnnotationMode(),
      exitAnnotationMode: () => activeWidget?.exitAnnotationMode(),
      submit: () => activeWidget?.submit() ?? Promise.resolve(),
      getDraftPinCount: () => activeWidget?.getDraftPinCount() ?? 0,
      subscribeToDraftPinCount: (listener) =>
        activeWidget?.subscribeToDraftPinCount(listener) ?? (() => {}),
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
