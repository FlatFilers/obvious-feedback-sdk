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
  enterAnnotationMode: () => void;
  exitAnnotationMode: () => void;
  submit: () => Promise<void>;
  getDraftPinCount: () => number;
  subscribeToDraftPinCount: (
    listener: (count: number) => void,
  ) => () => void;
}

export interface FeedbackSdkConfig {
  publicKey?: string;
  apiBaseUrl?: string;
  identityToken?: string;
  env?: string;
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
   * Optional metadata about the page/PR being previewed. Surfaces inline on
   * the toolbar (branch + sha label, PR link, thread link). Every field is
   * optional; the toolbar gracefully omits any UI for fields it does not
   * have. Designed for Obvious autobuild PR previews but works for any host.
   */
  context?: FeedbackContext;
}

export type FeedbackContextCiStatus =
  | "success"
  | "pending"
  | "failure"
  | "unknown";
export type FeedbackContextReviewStatus =
  | "approved"
  | "changes_requested"
  | "pending"
  | "unknown";
export type FeedbackContextPrStatus = "open" | "merged" | "closed" | "draft";

export interface FeedbackContext {
  /** GitHub PR number, surfaced on the toolbar's PR link. */
  prNumber?: number;
  /** Optional PR title, used as link tooltip. */
  prTitle?: string;
  /** Direct link to the GitHub PR. Surfaces a GitHub icon link. */
  prUrl?: string;
  /** Direct link to the autobuild thread (executable). Surfaces a thread icon link. */
  threadUrl?: string;
  /** Lifecycle state of the PR. Reserved for future use; not surfaced on the flat toolbar. */
  status?: FeedbackContextPrStatus;
  /** CI state. Reserved for future use; not surfaced on the flat toolbar. */
  ciStatus?: FeedbackContextCiStatus;
  /** Review state. Reserved for future use; not surfaced on the flat toolbar. */
  reviewStatus?: FeedbackContextReviewStatus;
  /** Branch name; surfaced as `branch • sha` text label on the toolbar. */
  branch?: string;
  /** Full or short commit SHA; surfaced as `branch • sha` text label on the toolbar. */
  commitSha?: string;
  /** Build identifier; reserved for future use. */
  buildId?: string;
  /** Author display name; reserved for future use. */
  author?: string;
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

/**
 * CSS properties that can be tweaked inline from a pin popover.
 * Mutations are applied to the picked element via inline style and persist
 * until the pin is deleted, the round is submitted, or the SDK is destroyed.
 */
export type FeedbackVisualSuggestionProperty =
  | "font-size"
  | "border-radius"
  | "padding"
  | "gap"
  | "color"
  | "background-color";

export interface FeedbackVisualSuggestion {
  property: FeedbackVisualSuggestionProperty;
  originalValue: string;
  suggestedValue: string;
}
