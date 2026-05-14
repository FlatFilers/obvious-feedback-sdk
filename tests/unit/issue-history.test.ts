import { afterEach, describe, expect, it } from "bun:test";
import {
  getFeedbackIssueHistoryStorageKey,
  isTerminalIssueStatus,
  parseStoredIssueHistory,
  persistIssueHistory,
  type FeedbackIssueHistoryEntry,
} from "../../src/widget/issue-history";
import { installDom, restoreGlobals } from "./test-dom";

afterEach(restoreGlobals);

describe("issue history", () => {
  it("scopes persisted issues by key, env, and origin", () => {
    const { storage } = installDom();
    const key = getFeedbackIssueHistoryStorageKey("fsk_pub_test", "staging");
    const entries: FeedbackIssueHistoryEntry[] = [
      {
        issueId: "abi_1",
        status: "in_progress",
        title: "Button is hidden",
        checkedAt: "2026-05-14T12:00:00.000Z",
      },
    ];

    persistIssueHistory(key, entries);

    expect(key).toBe(
      "obvious.feedback.issueHistory:fsk_pub_test:staging:https%3A%2F%2Fexample.com",
    );
    expect(parseStoredIssueHistory(key)).toMatchObject(entries);
    expect(storage.has(key ?? "")).toBe(true);
  });

  it("keeps unavailable statuses and filters unsafe worker links", () => {
    const { storage } = installDom();
    const key = getFeedbackIssueHistoryStorageKey("fsk_pub_test", "production");
    storage.set(
      key ?? "",
      JSON.stringify([
        {
          issueId: "abi_unavailable",
          status: "unavailable",
          title: "Status unavailable",
          workerThread: { id: "wt_1", url: "javascript:alert(1)" },
        },
      ]),
    );

    const [entry] = parseStoredIssueHistory(key);

    expect(entry).toMatchObject({
      issueId: "abi_unavailable",
      status: "unavailable",
      title: "Status unavailable",
    });
    expect(entry?.workerThread).toBeUndefined();
    expect(isTerminalIssueStatus("resolved")).toBe(true);
    expect(isTerminalIssueStatus("in_progress")).toBe(false);
  });
});
