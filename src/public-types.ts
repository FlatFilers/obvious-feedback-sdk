export type FeedbackIssueType = "bug" | "improvement" | "question";
export type FeedbackIssueSeverity = "critical" | "high" | "medium" | "low";
export type FeedbackClientStatus =
  | "received"
  | "under_review"
  | "in_progress"
  | "resolved"
  | "no_action"
  | "duplicate";

export type SessionReplayUrlResolver = () =>
  | string
  | null
  | Promise<string | null>;

export type FeedbackSdkTheme = "light" | "dark" | "system";

export interface FeedbackSdkHandle {
  destroy: () => void;
  open: () => void;
  getOpenIssueCount: () => number;
  subscribeToOpenIssueCount: (listener: (count: number) => void) => () => void;
}

export interface FeedbackSdkConfig {
  publicKey?: string;
  apiBaseUrl?: string;
  identityToken?: string;
  env?: string;
  prNumber?: number;
  redactSelectors?: string[];
  triggerLabel?: string;
  triggerLabels?: string[];
  assistantPosition?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  capturePageContext?: boolean;
  /** Optionally resolves a provider-neutral replay URL to include with feedback submissions. */
  sessionReplayUrlResolver?: SessionReplayUrlResolver;
  captureConsole?: boolean;
  captureNetwork?: boolean;
  previewOnly?: boolean;
  previewOnlyReason?: string;
  elementSourceResolver?: ElementSourceResolver;
  /**
   * Controls the widget color scheme.
   * - `'light'` (default) — always light, safe for light-only host pages.
   * - `'dark'` — always dark.
   * - `'system'` — follows the browser `prefers-color-scheme` media query.
   *
   * Host pages can further customize colors via `--obv-feedback-*` CSS custom properties.
   */
  theme?: FeedbackSdkTheme;
  /**
   * Feedback SDK "Suggest visual change" flow (Budge-inspired). Disabled by default.
   * When enabled, reporters can select a page element, nudge a safe CSS property,
   * and attach the suggested change (original -> suggested value + generated prompt)
   * to their feedback report. The original page is never mutated permanently: any
   * preview is restored before submit.
   */
  visualSuggestions?: FeedbackVisualSuggestionsConfig;
}

export interface FeedbackVisualSuggestionsConfig {
  enabled?: boolean;
}

export interface FeedbackSubmissionInput {
  type: FeedbackIssueType;
  severity?: FeedbackIssueSeverity;
  title?: string;
  description: string;
  sessionReplayUrl?: string;
  /** When set (including empty), used instead of compose-state attachment tokens (e.g. round item submit). */
  attachmentTokens?: string[];
}

export interface FeedbackStatusResponse {
  issueId: string;
  status: FeedbackClientStatus;
  triageStatus: string;
  title: string;
  description: string | null;
  resolvedNote: string | null;
  aiSummary?: FeedbackAiSummary | null;
  links?: FeedbackIssueLinks | null;
  updatedAt: string;
  reportedAt?: string;
  workerThread?: FeedbackWorkerThreadLink;
}

export interface FeedbackAiSummary {
  headline?: string | null;
  progress?: string | null;
  updatedAt?: string | null;
}

export interface FeedbackWorkerThreadLink {
  id: string;
  url: string;
}

export interface FeedbackPullRequestLink {
  id: string;
  number: number;
  title: string;
  url: string;
  status: string;
  ciStatus: string;
  reviewStatus: string;
  isDraft: boolean;
}

export interface FeedbackIssueLinks {
  workerThread?: FeedbackWorkerThreadLink;
  pullRequest?: FeedbackPullRequestLink;
}

export interface ElementSourceInfo {
  componentName: string | null;
  source: ElementSourceLocation | null;
  stack: ElementSourceStackFrame[];
}

export interface ElementSourceLocation {
  filePath: string;
  lineNumber: number | null;
  columnNumber: number | null;
}

export interface ElementSourceStackFrame {
  filePath: string;
  lineNumber: number | null;
  componentName: string | null;
}

export interface ElementGrabItem {
  id: string;
  tagName: string;
  cssSelector: string;
  outerHtml: string;
  textContent: string;
  boundingRect: ElementGrabRect;
  componentName: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
  componentStack: ElementSourceStackFrame[];
}

export interface ElementGrabRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementGrabHoverInfo {
  tagName: string;
  componentName: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
}

export type ElementSourceResolver = (
  element: Element,
) => Promise<ElementSourceInfo | null>;

export type FeedbackVisualSuggestionProperty =
  | "font-size"
  | "border-radius"
  | "padding"
  | "gap"
  | "color"
  | "background-color";

export interface FeedbackVisualSuggestionElementRef {
  id: string;
  tagName: string;
  cssSelector: string;
  boundingRect: ElementGrabRect;
  componentName: string | null;
  sourceFile: string | null;
  lineNumber: number | null;
}

export type FeedbackVisualSuggestionScopeKind = "element" | "similar-siblings";

export interface FeedbackVisualSuggestionScope {
  kind: FeedbackVisualSuggestionScopeKind;
  label: string;
  matchedCount: number;
  parentElement?: {
    tagName: string;
    cssSelector: string;
  };
  matchedElements?: Array<{
    tagName: string;
    cssSelector: string;
    textContent: string;
    componentName: string | null;
  }>;
}

export interface FeedbackVisualSuggestion {
  id: string;
  property: FeedbackVisualSuggestionProperty;
  originalValue: string;
  suggestedValue: string;
  prompt: string;
  element: FeedbackVisualSuggestionElementRef;
  scope?: FeedbackVisualSuggestionScope;
  capturedAt: string;
}

export interface FeedbackVisualSuggestionsPayload {
  version: 1;
  suggestions: FeedbackVisualSuggestion[];
}
