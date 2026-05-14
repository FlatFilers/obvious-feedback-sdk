import {
  ISSUE_HISTORY_STORAGE_PREFIX,
  MAX_ISSUE_HISTORY_ENTRIES,
} from "../constants";
import type {
  FeedbackAiSummary,
  FeedbackClientStatus,
  FeedbackIssueLinks,
  FeedbackWorkerThreadLink,
} from "../public-types";
import {
  normalizeFeedbackAiSummary,
  normalizeFeedbackIssueLinks,
  normalizeWorkerThreadLink,
} from "./feedback-normalizers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type FeedbackIssueHistoryStatus = FeedbackClientStatus | "unavailable";

export interface FeedbackIssueHistoryEntry {
  issueId: string;
  status: FeedbackIssueHistoryStatus;
  title?: string;
  description?: string | null;
  resolvedNote?: string | null;
  aiSummary?: FeedbackAiSummary | null;
  links?: FeedbackIssueLinks | null;
  reportedAt?: string;
  updatedAt?: string;
  checkedAt?: string;
  workerThread?: FeedbackWorkerThreadLink;
  acknowledgedStatusVersions?: string[];
}

export function getFeedbackIssueHistoryStorageKey(
  publicKey: string,
  env: string,
): string | null {
  if (!publicKey) {
    return null;
  }
  const sourceOrigin =
    typeof window !== "undefined" ? window.location.origin : "unknown-origin";
  return [ISSUE_HISTORY_STORAGE_PREFIX, publicKey, env, sourceOrigin]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

export function isFeedbackClientStatus(value: unknown): value is FeedbackClientStatus {
  return (
    value === "received" ||
    value === "under_review" ||
    value === "in_progress" ||
    value === "resolved" ||
    value === "no_action" ||
    value === "duplicate"
  );
}

export function isFeedbackIssueHistoryStatus(
  value: unknown,
): value is FeedbackIssueHistoryStatus {
  return isFeedbackClientStatus(value) || value === "unavailable";
}

export function parseStoredIssueHistory(
  storageKey: string | null,
): FeedbackIssueHistoryEntry[] {
  if (!storageKey) {
    return [];
  }
  try {
    const rawValue = window.localStorage?.getItem(storageKey);
    const parsed = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    const entries: FeedbackIssueHistoryEntry[] = [];
    for (const item of parsed) {
      if (
        !item ||
        typeof item !== "object" ||
        !("issueId" in item) ||
        typeof item.issueId !== "string"
      ) {
        continue;
      }
      const status =
        "status" in item && isFeedbackIssueHistoryStatus(item.status)
          ? item.status
          : "received";
      const workerThread =
        "workerThread" in item &&
        item.workerThread &&
        typeof item.workerThread === "object" &&
        "id" in item.workerThread &&
        typeof item.workerThread.id === "string" &&
        "url" in item.workerThread &&
        typeof item.workerThread.url === "string"
          ? normalizeWorkerThreadLink({
              id: item.workerThread.id,
              url: item.workerThread.url,
            })
          : undefined;
      const acknowledgedStatusVersions =
        "acknowledgedStatusVersions" in item &&
        Array.isArray(item.acknowledgedStatusVersions)
          ? item.acknowledgedStatusVersions.filter(
              (version: unknown): version is string =>
                typeof version === "string",
            )
          : undefined;
      entries.push({
        issueId: item.issueId,
        status,
        title:
          "title" in item && typeof item.title === "string"
            ? item.title
            : undefined,
        description:
          "description" in item && typeof item.description === "string"
            ? item.description
            : null,
        resolvedNote:
          "resolvedNote" in item && typeof item.resolvedNote === "string"
            ? item.resolvedNote
            : null,
        aiSummary: normalizeFeedbackAiSummary(
          "aiSummary" in item ? item.aiSummary : undefined,
        ),
        links: normalizeFeedbackIssueLinks(
          "links" in item ? item.links : undefined,
        ),
        reportedAt:
          "reportedAt" in item && typeof item.reportedAt === "string"
            ? item.reportedAt
            : undefined,
        updatedAt:
          "updatedAt" in item && typeof item.updatedAt === "string"
            ? item.updatedAt
            : undefined,
        checkedAt:
          "checkedAt" in item && typeof item.checkedAt === "string"
            ? item.checkedAt
            : undefined,
        workerThread,
        acknowledgedStatusVersions,
      });
    }
    return entries.slice(0, MAX_ISSUE_HISTORY_ENTRIES);
  } catch {
    return [];
  }
}

export function persistIssueHistory(
  storageKey: string | null,
  issueHistory: FeedbackIssueHistoryEntry[],
): void {
  if (!storageKey) {
    return;
  }
  try {
    const persistedEntries = issueHistory
      .slice(0, MAX_ISSUE_HISTORY_ENTRIES)
      .map((entry) => ({
        issueId: entry.issueId,
        status: entry.status,
        title: entry.title,
        description: entry.description,
        resolvedNote: entry.resolvedNote,
        aiSummary: entry.aiSummary,
        links: entry.links,
        reportedAt: entry.reportedAt,
        updatedAt: entry.updatedAt,
        checkedAt: entry.checkedAt,
        workerThread: entry.workerThread,
        acknowledgedStatusVersions: entry.acknowledgedStatusVersions,
      }));
    window.localStorage?.setItem(storageKey, JSON.stringify(persistedEntries));
  } catch {
    // localStorage may be unavailable in embedded or privacy-restricted contexts.
  }
}

export function getIssueStatusVersion(entry: {
  status: FeedbackIssueHistoryStatus;
  updatedAt?: string | null;
  reportedAt?: string | null;
  checkedAt?: string | null;
}): string {
  return [
    entry.status,
    entry.updatedAt ?? entry.reportedAt ?? entry.checkedAt ?? "unknown",
  ].join(":");
}

export function isTerminalIssueStatus(status: FeedbackIssueHistoryStatus): boolean {
  return (
    status === "resolved" || status === "no_action" || status === "duplicate"
  );
}

