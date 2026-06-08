import { describe, expect, it } from "bun:test";
import {
  createAttachmentUploadUrl,
  createFeedbackRoundSubmitUrl,
  createFeedbackStatusRequest,
  createFeedbackSubmitUrl,
} from "../../src/widget/transport";

describe("transport URL builders", () => {
  it("appends the API route prefix when missing", () => {
    expect(createFeedbackSubmitUrl("https://api.example.test")).toBe(
      "https://api.example.test/prepare/v1/feedback/submit",
    );
    expect(createFeedbackRoundSubmitUrl("https://api.example.test")).toBe(
      "https://api.example.test/prepare/v1/feedback/submit-round",
    );
    expect(createAttachmentUploadUrl("https://api.example.test")).toBe(
      "https://api.example.test/prepare/v1/feedback/attachments/upload",
    );
  });

  it("does not double the API route prefix when callers include it", () => {
    expect(createFeedbackSubmitUrl("https://pr-1.preview.obvious.dev/prepare")).toBe(
      "https://pr-1.preview.obvious.dev/prepare/v1/feedback/submit",
    );
  });

  it("builds a status request with the public key as a query param", () => {
    const { url, init } = createFeedbackStatusRequest({
      apiBaseUrl: "https://api.example.test",
      issueId: "abi_test",
      publicKey: "fsk_pub_test",
    });
    expect(url.toString()).toBe(
      "https://api.example.test/prepare/v1/feedback/status/abi_test?publicKey=fsk_pub_test",
    );
    expect(init).toBeUndefined();
  });

  it("attaches Bearer auth when an identity token is present", () => {
    const { init } = createFeedbackStatusRequest({
      apiBaseUrl: "https://api.example.test",
      issueId: "abi_test",
      publicKey: "fsk_pub_test",
      identityToken: "id-token",
    });
    expect(init?.headers).toEqual({ Authorization: "Bearer id-token" });
  });
});
