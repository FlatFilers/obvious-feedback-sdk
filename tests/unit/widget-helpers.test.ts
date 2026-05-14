import { describe, expect, it } from "bun:test";
import {
  createFeedbackStatusRequest,
  createFeedbackRoundSubmitUrl,
  createAttachmentUploadUrl,
} from "../../src/widget/transport";
import {
  getSafeExternalUrl,
  normalizeWorkerThreadLink,
} from "../../src/widget/feedback-normalizers";
import {
  normalizeMarkupItem,
  type FeedbackMarkupDraft,
} from "../../src/widget/markup";
import {
  computeRulerDistances,
  type RulerLine,
} from "../../src/widget/measurements";

describe("widget transport helpers", () => {
  it("builds route-prefixed submit, upload, and status URLs", () => {
    expect(createFeedbackRoundSubmitUrl("https://preview.test")).toBe(
      "https://preview.test/prepare/v1/feedback/submit-round",
    );
    expect(createAttachmentUploadUrl("https://preview.test/prepare")).toBe(
      "https://preview.test/prepare/v1/feedback/attachments/upload",
    );

    const request = createFeedbackStatusRequest({
      apiBaseUrl: "https://preview.test",
      identityToken: "jwt_test",
      issueId: "abi_1",
      publicKey: "fsk_pub_test",
    });

    expect(request.url.toString()).toBe(
      "https://preview.test/prepare/v1/feedback/status/abi_1?publicKey=fsk_pub_test",
    );
    expect(request.init).toEqual({
      headers: { Authorization: "Bearer jwt_test" },
    });
  });
});

describe("feedback normalizers", () => {
  it("accepts http URLs and rejects unsafe protocols", () => {
    expect(getSafeExternalUrl("https://example.com/thread")).toBe(
      "https://example.com/thread",
    );
    expect(getSafeExternalUrl("javascript:alert(1)")).toBeUndefined();
    expect(
      normalizeWorkerThreadLink({
        id: "wt_1",
        url: "javascript:alert(1)",
      }),
    ).toBeUndefined();
  });
});

describe("markup helpers", () => {
  it("keeps point clicks and drops tiny rectangle drags", () => {
    const pointDraft: FeedbackMarkupDraft = {
      id: "m_1",
      tool: "point",
      start: { x: 10, y: 20 },
      points: [{ x: 11, y: 21 }],
    };
    const rectangleDraft: FeedbackMarkupDraft = {
      id: "m_2",
      tool: "rectangle",
      start: { x: 10, y: 20 },
      points: [{ x: 11, y: 21 }],
    };

    expect(normalizeMarkupItem(pointDraft)).toEqual({
      id: "m_1",
      tool: "point",
      points: [{ x: 10, y: 20 }],
    });
    expect(normalizeMarkupItem(rectangleDraft)).toBeNull();
  });
});

describe("measurement helpers", () => {
  it("computes adjacent distances per orientation", () => {
    const rulers: RulerLine[] = [
      {
        id: "h1",
        orientation: "horizontal",
        position: 10,
        snappedTo: null,
        snappedElement: null,
        snappedEdge: null,
      },
      {
        id: "h2",
        orientation: "horizontal",
        position: 34,
        snappedTo: null,
        snappedElement: null,
        snappedEdge: null,
      },
      {
        id: "v1",
        orientation: "vertical",
        position: 5,
        snappedTo: null,
        snappedElement: null,
        snappedEdge: null,
      },
      {
        id: "v2",
        orientation: "vertical",
        position: 17,
        snappedTo: null,
        snappedElement: null,
        snappedEdge: null,
      },
    ];

    expect(computeRulerDistances(rulers)).toMatchObject([
      { rulerAId: "h1", rulerBId: "h2", distance: 24 },
      { rulerAId: "v1", rulerBId: "v2", distance: 12 },
    ]);
  });
});
