import type {
  FeedbackAiSummary,
  FeedbackIssueLinks,
  FeedbackPullRequestLink,
  FeedbackWorkerThreadLink,
} from "../public-types";

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

export function getSafeExternalUrl(rawUrl?: string): string | undefined {
  if (!rawUrl) {
    return undefined;
  }
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeWorkerThreadLink(value: unknown): FeedbackWorkerThreadLink | undefined {
  if (!isRecord(value) || typeof value.id !== "string") {
    return undefined;
  }
  const safeUrl = getSafeExternalUrl(
    typeof value.url === "string" ? value.url : undefined,
  );
  return safeUrl
    ? { id: value.id, url: safeUrl }
    : undefined;
}

export function normalizeFeedbackAiSummary(value: unknown): FeedbackAiSummary | null {
  if (!isRecord(value)) {
    return null;
  }
  return {
    headline: typeof value.headline === "string" ? value.headline : null,
    progress: typeof value.progress === "string" ? value.progress : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

export function normalizePullRequestLink(
  value: unknown,
): FeedbackPullRequestLink | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const safeUrl = getSafeExternalUrl(
    typeof value.url === "string" ? value.url : undefined,
  );
  return typeof value.id === "string" &&
    typeof value.number === "number" &&
    safeUrl
    ? {
        id: value.id,
        number: value.number,
        title:
          typeof value.title === "string"
            ? value.title
            : `PR #${value.number}`,
        url: safeUrl,
        status:
          typeof value.status === "string"
            ? value.status
            : "unknown",
        ciStatus:
          typeof value.ciStatus === "string"
            ? value.ciStatus
            : "unknown",
        reviewStatus:
          typeof value.reviewStatus === "string"
            ? value.reviewStatus
            : "unknown",
        isDraft: value.isDraft === true,
      }
    : undefined;
}

export function normalizeFeedbackIssueLinks(
  value: unknown,
): FeedbackIssueLinks | null {
  if (!isRecord(value)) {
    return null;
  }
  const workerThread = normalizeWorkerThreadLink(value.workerThread);
  const pullRequest = normalizePullRequestLink(value.pullRequest);
  return workerThread || pullRequest ? { workerThread, pullRequest } : null;
}

export function getFeedbackIssueLinks(response: unknown): FeedbackIssueLinks | null {
  if (!isRecord(response)) {
    return null;
  }
  return (
    normalizeFeedbackIssueLinks(response.links) ??
    normalizeFeedbackIssueLinks({ workerThread: response.workerThread })
  );
}

