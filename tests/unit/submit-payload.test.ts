import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ObviousFeedback } from "../../src/index";

interface CapturedRequest {
  url: string;
  body: Record<string, unknown>;
}

function installFetchMock(captured: CapturedRequest[]): typeof fetch {
  const original = globalThis.fetch;
  const mock = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    captured.push({
      url: String(input),
      body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
    });
    return new Response(
      JSON.stringify({
        issueId: "abi_test",
        issueUrl: "https://app.obvious.ai/issues/abi_test",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;
  globalThis.fetch = mock;
  return original;
}

function addDraftPin(handle: ReturnType<typeof ObviousFeedback.init>): void {
  const target = document.createElement("button");
  target.textContent = "Target";
  document.body.appendChild(target);
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: (): Element | null => target,
  });
  handle.enterAnnotationMode();
  document.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    }),
  );
  expect(handle.getDraftPinCount()).toBe(1);
}

describe("submit-round payload", () => {
  let handle: ReturnType<typeof ObviousFeedback.init> | null = null;
  let originalFetch: typeof fetch;
  let captured: CapturedRequest[];

  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
    captured = [];
    originalFetch = installFetchMock(captured);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    handle?.destroy();
    handle = null;
    document.body.innerHTML = "";
  });

  it("includes repoFullName from context alongside prNumber", async () => {
    handle = ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      context: { prNumber: 42, repoFullName: "acme/web" },
    });
    addDraftPin(handle);
    await handle.submit();

    expect(captured.length).toBe(1);
    expect(captured[0]!.url).toContain("/v1/feedback/submit-round");
    expect(captured[0]!.body.prNumber).toBe(42);
    expect(captured[0]!.body.repoFullName).toBe("acme/web");
  });

  it("includes repoFullName from the top-level config option", async () => {
    handle = ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      prNumber: 7,
      repoFullName: "acme/api",
    });
    addDraftPin(handle);
    await handle.submit();

    expect(captured.length).toBe(1);
    expect(captured[0]!.body.prNumber).toBe(7);
    expect(captured[0]!.body.repoFullName).toBe("acme/api");
  });

  it("prefers context.repoFullName over the top-level option", async () => {
    handle = ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      repoFullName: "acme/legacy",
      context: { prNumber: 9, repoFullName: "acme/web" },
    });
    addDraftPin(handle);
    await handle.submit();

    expect(captured.length).toBe(1);
    expect(captured[0]!.body.repoFullName).toBe("acme/web");
  });

  it("omits repoFullName entirely when not configured", async () => {
    handle = ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      context: { prNumber: 42 },
    });
    addDraftPin(handle);
    await handle.submit();

    expect(captured.length).toBe(1);
    expect(captured[0]!.body.prNumber).toBe(42);
    expect("repoFullName" in captured[0]!.body).toBe(false);
  });
});

