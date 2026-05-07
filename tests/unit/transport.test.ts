import { afterEach, describe, expect, it, mock } from "bun:test";
import packageJson from "../../package.json";
import { installDom, restoreGlobals } from "./test-dom";

afterEach(restoreGlobals);

interface MiniInputElement extends HTMLInputElement {
  dispatch(type: string, event: Event): void;
}

function firstJsonRequestBody(fetchImpl: { mock: { calls: unknown[] } }): unknown {
  const call = fetchImpl.mock.calls[0];
  if (!Array.isArray(call)) {
    return null;
  }
  const init = call[1];
  if (!init || typeof init !== "object" || !("body" in init)) {
    return null;
  }
  const body = init.body;
  if (typeof body !== "string") {
    return null;
  }
  return JSON.parse(body);
}

function firstFetchUrl(fetchImpl: { mock: { calls: unknown[] } }): string {
  const call = fetchImpl.mock.calls[0];
  if (!Array.isArray(call)) {
    return "";
  }
  return String(call[0] ?? "");
}

describe("transport", () => {
  it("posts feedback submissions through the API route prefix", async () => {
    const fetchImpl = mock(
      async () =>
        new Response(
          JSON.stringify({ data: { issueId: "abi_test", status: "received" } }),
        ),
    );
    const { body } = installDom(fetchImpl);
    const { ObviousFeedback } = await import(
      `../../src/index?transport-prefix=${Date.now()}`
    );
    ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      apiBaseUrl: "https://pr-123.preview.obvious.dev",
    });
    const host = body.children[1];
    host.shadowRoot
      ?.querySelector(".obv-trigger")
      ?.dispatch("click", new Event("click"));
    const input = host.shadowRoot?.querySelector(
      '[data-item-input="__new"]',
    ) as MiniInputElement | null;
    if (input) {
      input.value = "Route prefix test";
      input.dispatch("input", {} as Event);
    }
    host.shadowRoot
      ?.querySelector('[data-submit-round="true"]')
      ?.dispatch("click", {} as Event);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const calledUrl = firstFetchUrl(fetchImpl);
    expect(calledUrl).toContain("/prepare/v1/feedback/");
  });

  it("reports the package version in feedback payloads", async () => {
    const fetchImpl = mock(
      async () =>
        new Response(
          JSON.stringify({ data: { issueId: "abi_test", status: "received" } }),
        ),
    );
    const { body } = installDom(fetchImpl);
    const { ObviousFeedback } = await import(
      `../../src/index?transport-version=${Date.now()}`
    );
    ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      apiBaseUrl: "https://pr-123.preview.obvious.dev",
    });
    const host = body.children[1];
    host.shadowRoot
      ?.querySelector(".obv-trigger")
      ?.dispatch("click", new Event("click"));
    const input = host.shadowRoot?.querySelector('[data-item-input="__new"]');
    if (input) {
      Object.defineProperty(input, "value", {
        value: "Version test",
        writable: true,
        configurable: true,
      });
      input.dispatch("input", new Event("input"));
    }
    host.shadowRoot
      ?.querySelector('[data-submit-round="true"]')
      ?.dispatch("click", new Event("click"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(firstJsonRequestBody(fetchImpl)).toMatchObject({
      sdkVersion: packageJson.version,
    });
  });

  it("enables round submit as soon as the draft row has text", async () => {
    const { body } = installDom();
    const { ObviousFeedback } = await import(
      `../../src/index?draft-submit-enable=${Date.now()}`
    );
    ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    const host = body.children[1];
    host.shadowRoot
      ?.querySelector(".obv-trigger")
      ?.dispatch("click", { preventDefault() {} } as Event);

    expect(host.shadowRoot?.innerHTML).toContain(
      'data-submit-round="true" disabled aria-disabled="true"',
    );

    const input = host.shadowRoot?.querySelector(
      '[data-item-input="__new"]',
    ) as MiniInputElement | null;
    input!.value = "Submit this without pressing enter first";
    input!.dispatch("input", {} as Event);

    const submitButton = host.shadowRoot?.querySelector(
      '[data-submit-round="true"]',
    ) as HTMLButtonElement | null;
    expect(submitButton?.hasAttribute("disabled")).toBe(false);
    expect(submitButton?.getAttribute("aria-disabled")).toBe(null);
  });

  it("does not duplicate the API route prefix when callers include it in apiBaseUrl", async () => {
    const fetchImpl = mock(
      async () =>
        new Response(
          JSON.stringify({ data: { issueId: "abi_test", status: "received" } }),
        ),
    );
    const { body } = installDom(fetchImpl);
    const { ObviousFeedback } = await import(
      `../../src/index?transport-nodup=${Date.now()}`
    );
    ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      apiBaseUrl: "https://pr-123.preview.obvious.dev/prepare",
    });
    const host = body.children[1];
    host.shadowRoot
      ?.querySelector(".obv-trigger")
      ?.dispatch("click", new Event("click"));
    const input = host.shadowRoot?.querySelector('[data-item-input="__new"]');
    if (input) {
      Object.defineProperty(input, "value", {
        value: "No duplicate prefix",
        writable: true,
        configurable: true,
      });
      input.dispatch("input", new Event("input"));
    }
    host.shadowRoot
      ?.querySelector('[data-submit-round="true"]')
      ?.dispatch("click", new Event("click"));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const calledUrl = firstFetchUrl(fetchImpl);
    expect(calledUrl).toBe(
      "https://pr-123.preview.obvious.dev/prepare/v1/feedback/submit",
    );
  });

  it("does not throw when auto-init runs without a script element", async () => {
    installDom();
    expect(async () => {
      await import(`../../src/index?transport-autoinit=${Date.now()}`);
    }).not.toThrow();
  });
});
