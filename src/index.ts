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
  FeedbackVisualSuggestionElementRef,
  FeedbackVisualSuggestionProperty,
  FeedbackVisualSuggestionScope,
  FeedbackVisualSuggestionScopeKind,
  FeedbackVisualSuggestionsConfig,
  FeedbackVisualSuggestionsPayload,
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
      open: () => activeWidget?.open(),
      getOpenIssueCount: () => activeWidget?.getOpenIssueCount() ?? 0,
      subscribeToOpenIssueCount: (listener) =>
        activeWidget?.subscribeToOpenIssueCount(listener) ?? (() => {}),
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
    prNumber: script.dataset.prNumber
      ? Number(script.dataset.prNumber)
      : undefined,
    triggerLabel: script.dataset.triggerLabel,
    theme:
      dataTheme === "light" || dataTheme === "dark" || dataTheme === "system"
        ? dataTheme
        : undefined,
  });
}

if (typeof document !== "undefined") {
  initFromCurrentScript();
}
