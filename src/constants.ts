import type {
  FeedbackIssueSeverity,
  FeedbackIssueType,
} from "./public-types";

export const DEFAULT_API_BASE_URL = "https://api.app.obvious.ai";
export const API_ROUTE_PREFIX = "/prepare";

export const DEFAULT_ENV = "production";
export const MAX_TEXT_LENGTH = 300;
export const MAX_LOG_ENTRIES = 100;
export const MAX_NETWORK_ENTRIES = 50;

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
