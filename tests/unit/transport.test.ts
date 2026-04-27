import { afterEach, describe, expect, it, mock } from "bun:test";
import { installDom, restoreGlobals } from "./test-dom";

afterEach(restoreGlobals);

interface MiniInputElement extends HTMLInputElement {
  dispatch(type: string, event: Event): void;
}

type FetchMockCall = [string | URL | Request, RequestInit?];

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
      ?.dispatch("click", { preventDefault() {} } as Event);
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

    const calls = fetchImpl.mock.calls as unknown as FetchMockCall[];
    const calledUrl = String(calls[0]?.[0] ?? "");
    expect(calledUrl).toContain("/prepare/v1/feedback/");
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
    installDom();
    const mod = await import(`../../src/index?transport-nodup=${Date.now()}`);
    const source = await Bun.file(
      new URL("../../src/index.ts", import.meta.url).pathname,
    ).text();
    expect(source).toContain(
      "const routePrefix = normalizedBaseUrl.endsWith(API_ROUTE_PREFIX)",
    );
    expect(source).toContain('? ""');
    expect(source).toContain(": API_ROUTE_PREFIX");
  });

  it("does not throw when auto-init runs without a script element", async () => {
    installDom();
    expect(async () => {
      await import(`../../src/index?transport-autoinit=${Date.now()}`);
    }).not.toThrow();
  });
});
