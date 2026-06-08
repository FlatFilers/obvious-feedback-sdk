import { describe, expect, it } from "bun:test";
import { normalizeFeedbackRoundSubmitResponse } from "../../src/widget/feedback-normalizers";

describe("normalizeFeedbackRoundSubmitResponse", () => {
  it("extracts issueUrl from a wrapped success payload", () => {
    expect(
      normalizeFeedbackRoundSubmitResponse({
        success: true,
        data: {
          issueId: "abi_test",
          issueUrl: "https://app.obvious.ai/autobuild?issue=abi_test&tab=issues",
        },
      }),
    ).toEqual({
      issueId: "abi_test",
      issueUrl: "https://app.obvious.ai/autobuild?issue=abi_test&tab=issues",
    });
  });

  it("includes workerThread when present", () => {
    expect(
      normalizeFeedbackRoundSubmitResponse({
        data: {
          issueId: "abi_test",
          issueUrl: "https://app.obvious.ai/autobuild?issue=abi_test&tab=issues",
          workerThread: {
            id: "th_test",
            url: "https://app.obvious.ai/assistant/threads/th_test",
          },
        },
      }),
    ).toEqual({
      issueId: "abi_test",
      issueUrl: "https://app.obvious.ai/autobuild?issue=abi_test&tab=issues",
      workerThread: {
        id: "th_test",
        url: "https://app.obvious.ai/assistant/threads/th_test",
      },
    });
  });

  it("rejects unsafe issueUrl values", () => {
    expect(
      normalizeFeedbackRoundSubmitResponse({
        data: {
          issueId: "abi_test",
          issueUrl: "javascript:alert(1)",
        },
      }),
    ).toBeNull();
  });
});
