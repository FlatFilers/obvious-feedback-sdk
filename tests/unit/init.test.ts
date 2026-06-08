import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { ObviousFeedback } from "../../src/index";

describe("ObviousFeedback.init", () => {
  let handle: ReturnType<typeof ObviousFeedback.init> | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
    window.history.replaceState(null, "", "/");
  });

  afterEach(() => {
    handle?.destroy();
    handle = null;
    document.body.innerHTML = "";
  });

  it("throws when publicKey is missing and previewOnly is false", () => {
    expect(() => ObviousFeedback.init({})).toThrow(
      "ObviousFeedback.init requires publicKey",
    );
  });

  it("mounts the toolbar host on the body", () => {
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector(".obv-toolbar")).not.toBeNull();
  });

  it("exposes a draft pin count subscription that reports zero initially", () => {
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    expect(handle.getDraftPinCount()).toBe(0);
    const received: number[] = [];
    const unsubscribe = handle.subscribeToDraftPinCount((count) => {
      received.push(count);
    });
    expect(received[0]).toBe(0);
    unsubscribe();
  });

  it("destroy removes the toolbar host", () => {
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    expect(
      document.querySelector("[data-obvious-feedback-toolbar]"),
    ).not.toBeNull();
    handle.destroy();
    handle = null;
    expect(
      document.querySelector("[data-obvious-feedback-toolbar]"),
    ).toBeNull();
  });

  it("renders only the branch when preview context provides branch and sha", () => {
    handle = ObviousFeedback.init({
      publicKey: "fsk_pub_test",
      context: {
        prNumber: 14125,
        branch: "feat/sdk-redesign",
        commitSha: "abcdef1234567890",
        prUrl: "https://github.com/example/repo/pull/14125",
      },
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    const root = host?.shadowRoot;
    const metaText = root?.querySelector(".obv-cell-meta")?.textContent ?? "";
    const html = root?.innerHTML ?? "";
    expect(metaText).toContain("feat/sdk-redesign");
    expect(metaText).not.toContain("abcdef1");
    expect(html).toContain("github.com/example/repo/pull/14125");
  });

  it("clears draft pins when SPA navigation changes the URL", () => {
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
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

    window.history.pushState(null, "", "/next-page");

    expect(handle.getDraftPinCount()).toBe(0);
    expect(
      document
        .querySelector("[data-obvious-feedback-pin-layer]")
        ?.shadowRoot?.querySelector(".obv-pin"),
    ).toBeNull();
  });
});
