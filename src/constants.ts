import type {
  FeedbackIssueSeverity,
  FeedbackIssueType,
} from "./public-types";

export const TRIGGER_POSITION_STORAGE_KEY = "obvious.feedback.triggerPosition";
export const ISSUE_HISTORY_STORAGE_PREFIX = "obvious.feedback.issueHistory";
export const DRAFT_ROUND_STORAGE_PREFIX = "obvious.feedback.draftRound";
export const MAX_ROUND_ITEMS = 15;
export const MAX_DRAFT_ROUND_STORAGE_BYTES = 512 * 1024;
export const MAX_ISSUE_HISTORY_ENTRIES = 5;
export const HISTORY_REFRESH_STALE_MS = 5 * 60 * 1000;
export const MAX_HISTORY_REFRESH_PER_OPEN = 2;
export const TRIGGER_DRAG_THRESHOLD_PX = 4;
export const TRIGGER_DOCK_OVERSCROLL_PX = 32;
export const TRIGGER_HIDDEN_PEEK_PX = 12;
export const TRIGGER_VIEWPORT_MARGIN_PX = 8;
export const DEFAULT_TRIGGER_SIZE_PX = 44;
export const FEEDBACK_CARD_GAP_PX = 12;
export const FEEDBACK_CARD_VIEWPORT_MARGIN_PX = 20;
export const FEEDBACK_CARD_MAX_WIDTH_PX = 392;
export const FEEDBACK_FORM_ESTIMATED_HEIGHT_PX = 420;
export const FEEDBACK_STATUS_CARD_ESTIMATED_HEIGHT_PX = 260;
export const MARKUP_POINTER_MOVE_THRESHOLD_PX = 3;
export const MAX_MARKUP_ITEMS = 40;
export const MAX_ELEMENT_GRABS = 10;
export const MAX_MARKUP_POINTS_PER_ITEM = 240;
export const MAX_FEEDBACK_ATTACHMENTS = 10;
export const MAX_FEEDBACK_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const FEEDBACK_ATTACHMENT_UPLOAD_TIMEOUT_MS = 30_000;
export const DEFAULT_ATTACHMENT_MIME_TYPE = "application/octet-stream";
export const FEEDBACK_ATTACHMENT_SESSION_PREFIX = "fas";

export const DEFAULT_API_BASE_URL = "https://api.app.obvious.ai";
export const API_ROUTE_PREFIX = "/prepare";

export const DEFAULT_ENV = "production";
export const MAX_DOM_NODES = 600;
export const MAX_TEXT_LENGTH = 300;
export const MAX_ATTR_LENGTH = 300;
export const MAX_LOG_ENTRIES = 100;
export const MAX_NETWORK_ENTRIES = 50;
export const SENSITIVE_ATTRS = new Set([
  "value",
  "placeholder",
  "data-sensitive",
  "aria-label",
  "href",
  "src",
  "action",
]);
export const DEFAULT_TRIGGER_LABEL = "Open feedback";

export const SECRET_QUERY_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "code",
  "secret",
  "api_key",
  "apikey",
  "key",
  "password",
  "session",
]);

export const DEFAULT_FEEDBACK_ISSUE_TYPE: FeedbackIssueType = "improvement";
export const DEFAULT_FEEDBACK_ISSUE_SEVERITY: FeedbackIssueSeverity = "medium";
export const MAX_VISUAL_SUGGESTION_SCOPE_TARGETS = 12;
export const MAX_VISUAL_SUGGESTION_SCOPE_DEPTH = 5;
export const SILLY_FEEDBACK_MESSAGES = [
  "Feature request",
  "Report a bug",
  "Love something?",
  "Hate something?",
  "Sign the Guest Book",
  "Something broken?",
  "Quick thought?",
  "Tell us anything",
  "Make a wish",
  "Found a typo?",
  "Would you like a cookie?",
  "I have a question",
  "This could be better",
  "Submission box",
  "Needs more cowbell",
  "Flag something",
  "Feedback",
  "Something’s off",
  "Salt and Pepper",
];
export const SILLY_FEEDBACK_LOAD_PROBABILITY = 0.05;
