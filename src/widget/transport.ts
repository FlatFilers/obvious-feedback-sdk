import {
  DEFAULT_FEEDBACK_ISSUE_SEVERITY,
  DEFAULT_FEEDBACK_ISSUE_TYPE,
} from "../constants";
import type { FeedbackSubmissionInput } from "../public-types";
import { createFeedbackApiUrl } from "../utils/url";

export function createFeedbackSubmitUrl(apiBaseUrl: string): string {
  return createFeedbackApiUrl(apiBaseUrl, "/v1/feedback/submit");
}

export function createFeedbackRoundSubmitUrl(apiBaseUrl: string): string {
  return createFeedbackApiUrl(apiBaseUrl, "/v1/feedback/submit-round");
}

export function createAttachmentUploadUrl(apiBaseUrl: string): string {
  return createFeedbackApiUrl(apiBaseUrl, "/v1/feedback/attachments/upload");
}

export function createFeedbackStatusRequest(input: {
  apiBaseUrl: string;
  identityToken?: string;
  issueId: string;
  publicKey: string;
}): {
  url: URL;
  init?: RequestInit;
} {
  const url = new URL(
    createFeedbackApiUrl(
      input.apiBaseUrl,
      `/v1/feedback/status/${input.issueId}`,
    ),
  );
  url.searchParams.set("publicKey", input.publicKey);
  const headers: Record<string, string> = {};
  if (input.identityToken) {
    headers.Authorization = `Bearer ${input.identityToken}`;
  }
  return Object.keys(headers).length > 0
    ? { url, init: { headers } }
    : { url };
}

export function createFeedbackSubmissionInput(
  formData: FormData,
): FeedbackSubmissionInput {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) {
    throw new Error("Feedback description is required");
  }
  return {
    type: DEFAULT_FEEDBACK_ISSUE_TYPE,
    severity: DEFAULT_FEEDBACK_ISSUE_SEVERITY,
    description,
  };
}
