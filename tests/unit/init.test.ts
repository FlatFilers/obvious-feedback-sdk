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

  it("slides the toolbar off-screen and persists the preference", () => {
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-presentation")).toBe("open");
    expect(handle.isToolbarVisible()).toBe(true);

    handle.setToolbarVisible(false);
    expect(host?.getAttribute("data-presentation")).toBe("docked");
    expect(handle.isToolbarVisible()).toBe(false);
    expect(
      window.localStorage.getItem(
        `obvious.feedback.toolbarVisible:${window.location.origin}`,
      ),
    ).toBe("false");

    handle.toggleToolbarVisible();
    expect(host?.getAttribute("data-presentation")).toBe("open");
    expect(handle.isToolbarVisible()).toBe(true);
  });

  it("restores hidden toolbar preference on init", () => {
    window.localStorage.setItem(
      `obvious.feedback.toolbarVisible:${window.location.origin}`,
      "false",
    );
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-presentation")).toBe("docked");
    expect(handle.isToolbarVisible()).toBe(false);
  });

  it("restores docked resting mode on init", () => {
    window.localStorage.setItem(
      `obvious.feedback.toolbarRestingMode:${window.location.origin}`,
      "docked",
    );
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-presentation")).toBe("docked");
  });

  it("hides the toolbar and reports not-visible for an active stored snooze", () => {
    window.localStorage.setItem(
      `obvious.feedback.toolbarSnoozedUntil:${window.location.origin}`,
      JSON.stringify({
        until: Date.now() + 3_600_000,
        duration: "1h",
      }),
    );
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-presentation")).toBe("hidden");
    expect(handle?.isToolbarVisible()).toBe(false);
  });

  it("shows the toolbar and clears the snooze key when the stored snooze expired", () => {
    window.localStorage.setItem(
      `obvious.feedback.toolbarSnoozedUntil:${window.location.origin}`,
      JSON.stringify({
        until: Date.now() - 1000,
        duration: "day",
      }),
    );
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-presentation")).toBe("open");
    expect(handle?.isToolbarVisible()).toBe(true);
    expect(
      window.localStorage.getItem(
        `obvious.feedback.toolbarSnoozedUntil:${window.location.origin}`,
      ),
    ).toBeNull();
  });

  it("cancels an active snooze when the host calls setToolbarVisible(true)", () => {
    const snoozeKey = `obvious.feedback.toolbarSnoozedUntil:${window.location.origin}`;
    window.localStorage.setItem(
      snoozeKey,
      JSON.stringify({ until: Date.now() + 3_600_000, duration: "1h" }),
    );
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    expect(handle?.isToolbarVisible()).toBe(false);

    handle?.setToolbarVisible(true);

    expect(handle?.isToolbarVisible()).toBe(true);
    expect(window.localStorage.getItem(snoozeKey)).toBeNull();
    // The reveal path persists the (now true) standing visibility preference —
    // the existing setUserHidden(false) behavior — while the snooze key is gone.
    expect(
      window.localStorage.getItem(
        `obvious.feedback.toolbarVisible:${window.location.origin}`,
      ),
    ).toBe("true");
  });

  it("reports not-visible while snoozed even with the toolbar un-hidden", () => {
    const snoozeKey = `obvious.feedback.toolbarSnoozedUntil:${window.location.origin}`;
    window.localStorage.setItem(
      snoozeKey,
      JSON.stringify({
        until: Date.now() + 60 * 60 * 1000,
        duration: "1h",
      }),
    );
    handle = ObviousFeedback.init({ publicKey: "fsk_pub_test" });
    // Composed visibility: snoozed hides the bar exactly like userHidden.
    expect(handle?.isToolbarVisible()).toBe(false);
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
