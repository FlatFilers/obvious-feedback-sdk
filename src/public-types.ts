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

export interface FeedbackDesignSystemConfig {
  /**
   * Raw markdown contents of `.obvious/design/tokens.md`.
   *
   * Browser SDKs cannot read repo files directly, so host apps should import
   * the manifest (for example via Vite's `?raw`) and pass the contents here.
   */
  tokensMarkdown?: string;
  /** Identifies the manifest source for debugging and future formats. */
  source?: "obvious-design-tokens";
}

export interface FeedbackSdkHandle {
  destroy: () => void;
  /** Legacy alias for entering annotation mode from host-owned preview chrome. */
  open: () => void;
  enterAnnotationMode: () => void;
  exitAnnotationMode: () => void;
  submit: () => Promise<void>;
  getDraftPinCount: () => number;
  subscribeToDraftPinCount: (
    listener: (count: number) => void,
  ) => () => void;
  /** Legacy status-history API retained for existing host integrations. */
  getOpenIssueCount: () => number;
  subscribeToOpenIssueCount: (
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
  /** Legacy placement option from the floating assistant UI; ignored by the toolbar UI. */
  assistantPosition?: "bottom-left" | "bottom-right" | "top-left" | "top-right";
  /** Legacy visual suggestions flag; token-backed tweaks are always SDK-owned. */
  visualSuggestions?: { enabled: boolean };
  previewOnly?: boolean;
  previewOnlyReason?: string;
  /** Legacy top-level PR number. Prefer `context.prNumber` for new integrations. */
  prNumber?: number;
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
  /**
   * Optional host-provided design-system metadata. When present, visual tweak
   * controls prefer these canonical tokens over runtime CSS variable inference.
   */
  designSystem?: FeedbackDesignSystemConfig;
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
  /** Direct link to the triage issue page returned after submit. */
  issueUrl?: string;
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

export interface FeedbackRoundSubmitResponse {
  issueId: string;
  issueUrl: string;
  workerThread?: FeedbackWorkerThreadLink;
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

/**
 * Where the suggested value came from. The autobuild pipeline uses this to
 * decide whether to apply the new value verbatim (`token`), interpret a
 * higher-level intent (`intent`), or treat it as a free-form CSS literal
 * (`raw`). `raw` exists for backward compatibility with earlier SDK versions
 * that did not surface token/intent metadata.
 */
export type FeedbackVisualSuggestionSource = "token" | "intent" | "raw";

/**
 * Bucket the SDK assigned to a token at runtime. Mirrors
 * `DesignTokenCategory` from the SDK's internal token classifier; surfaced
 * here so the backend/agent can group tweaks (e.g. "border tokens") without
 * re-running classification.
 */
export type FeedbackVisualSuggestionTokenCategory =
  | "text"
  | "background"
  | "border"
  | "radius"
  | "spacing"
  | "state"
  | "raw";

export type FeedbackVisualSuggestionTokenSource = "manifest" | "runtime";

/**
 * High-level intent emitted when no semantic token chip applies. Lets the
 * agent express the change in design-system terms (e.g. "use the warning
 * treatment") instead of a raw value.
 */
export type FeedbackVisualSuggestionIntent =
  | "more-prominent"
  | "less-prominent"
  | "more-spacing"
  | "tighter"
  | "smaller"
  | "larger"
  | "warning-treatment"
  | "danger-treatment"
  | "success-treatment"
  | "muted-treatment";

export interface FeedbackVisualSuggestionToken {
  /** Human-readable identifier without CSS syntax where possible. */
  shortName: string;
  /** Canonical token identifier. CSS variables include `--`; Tailwind classes do not. */
  name: string;
  /**
   * Resolved value at the time of selection — useful for the agent when the
   * token is not present in the target codebase and must be matched by value.
   */
  resolvedValue: string;
  category: FeedbackVisualSuggestionTokenCategory;
  /** 0 = raw palette, 2 = strong semantic match. Higher wins. */
  semanticScore: number;
  /** Whether this came from a host manifest or runtime CSS inference. */
  source?: FeedbackVisualSuggestionTokenSource;
}

export interface FeedbackVisualSuggestion {
  property: FeedbackVisualSuggestionProperty;
  originalValue: string;
  suggestedValue: string;
  /** How the SDK arrived at `suggestedValue`; see {@link FeedbackVisualSuggestionSource}. */
  source?: FeedbackVisualSuggestionSource;
  /** Token metadata when `source === "token"`. */
  token?: FeedbackVisualSuggestionToken;
  /** Intent identifier when `source === "intent"`. */
  intent?: FeedbackVisualSuggestionIntent;
  /**
   * Optional human-readable preview value applied to the live element
   * (e.g. for intent chips, the SDK approximates the change locally so the
   * reporter can see the effect, but submits the intent so the agent can
   * implement it idiomatically).
   */
  previewValue?: string;
}
