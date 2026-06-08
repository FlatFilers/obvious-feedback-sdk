import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FeedbackToolbar } from "../../src/widget/feedback-toolbar";

function createNoop(): () => void {
  return () => undefined;
}

describe("FeedbackToolbar", () => {
  let toolbar: FeedbackToolbar | null = null;

  beforeEach(() => {
    document.body.innerHTML = "";
    window.localStorage.clear();
  });

  afterEach(() => {
    toolbar?.destroy();
    toolbar = null;
    document.body.innerHTML = "";
  });

  it("hides the toolbar host while setHidden is true", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-hidden")).toBe("false");
    toolbar.setHidden(true);
    expect(host?.getAttribute("data-hidden")).toBe("true");
    toolbar.setHidden(false);
    expect(host?.getAttribute("data-hidden")).toBe("false");
  });

  it("renders the drag handle and comment button by default", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host).not.toBeNull();
    const html = host?.shadowRoot?.innerHTML ?? "";
    expect(html).toContain("data-obv-drag-handle");
    expect(html).toContain('data-toolbar-action="comment"');
    expect(html).not.toContain('data-toolbar-action="collapse"');
    expect(html).not.toContain('data-toolbar-action="expand"');
  });

  it("uses the compact toolbar when there is no branch or context content", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const root = document.querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot;
    expect(root?.querySelector(".obv-toolbar-compact")).not.toBeNull();
  });

  it("keeps the full-width toolbar when branch or context content is present", () => {
    toolbar = new FeedbackToolbar({
      context: { branch: "feat/foo" },
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const root = document.querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot;
    expect(root?.querySelector(".obv-toolbar")).not.toBeNull();
    expect(root?.querySelector(".obv-toolbar-compact")).toBeNull();
  });

  it("hides Send and the pin counter when there are no pins", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(
      host?.shadowRoot?.querySelector('[data-toolbar-action="send"]'),
    ).toBeNull();
    expect(
      host?.shadowRoot?.querySelector(".obv-cell-count-badge"),
    ).toBeNull();
  });

  it("shows Send and merges the draft counter into the Feedback action when pin count > 0", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    toolbar.setPinCount(2);
    const root = document.querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot;
    const html = root?.innerHTML ?? "";
    const commentButton = root?.querySelector<HTMLButtonElement>(
      '[data-toolbar-action="comment"]',
    );
    expect(html).toContain('data-toolbar-action="send"');
    expect(commentButton?.textContent ?? "").toContain("Feedback");
    expect(
      commentButton?.querySelector(".obv-cell-count-badge")?.textContent,
    ).toBe("2");
    expect(commentButton?.getAttribute("aria-label")).toContain(
      "2 comments drafted",
    );
    expect(html).not.toContain("2 drafts");
    expect(html).not.toContain("2 pins");
    expect(html).not.toContain('data-toolbar-action="clear-all"');
    expect(root?.querySelector(".obv-cell-count")).toBeNull();
  });

  it("renders picking state as passive status text instead of a button", () => {
    let commentClicks = 0;
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 1,
      onCommentClick: () => {
        commentClicks += 1;
      },
      onSendClick: createNoop(),
    });
    toolbar.setStatus("picking");
    const root = document.querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot;
    const picking = root?.querySelector(".obv-cell-picking");
    expect(picking).toBeInstanceOf(HTMLDivElement);
    expect(picking?.textContent).toContain("Picking…");
    expect(root?.querySelector('[data-toolbar-action="comment"]')).toBeNull();
    expect(root?.querySelector("style")?.textContent ?? "").not.toContain(
      ':host([data-status="picking"]) .obv-cell-primary',
    );
    expect(commentClicks).toBe(0);
  });

  it("exposes singular comment count in the Feedback action aria-label when there is exactly one pin", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 1,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const commentButton = document
      .querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot?.querySelector<HTMLButtonElement>(
        '[data-toolbar-action="comment"]',
      );
    expect(
      commentButton?.querySelector(".obv-cell-count-badge")?.textContent,
    ).toBe("1");
    expect(commentButton?.getAttribute("aria-label")).toContain(
      "1 comment drafted",
    );
    expect(commentButton?.getAttribute("aria-label")).not.toContain(
      "1 comments",
    );
  });

  it("groups context cells on the left and active controls on the right", () => {
    toolbar = new FeedbackToolbar({
      context: {
        prNumber: 14125,
        prUrl: "https://github.com/example/repo/pull/14125",
        threadUrl: "https://app.obvious.ai/autobuild/executables/exe_test",
        branch: "feat/foo",
      },
      theme: "light",
      initialPinCount: 1,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    const startGroup = host?.shadowRoot?.querySelector(".obv-group-start");
    const endGroup = host?.shadowRoot?.querySelector(".obv-group-end");
    expect(startGroup?.querySelector("[data-obv-drag-handle]")).not.toBeNull();
    expect(startGroup?.querySelector(".obv-cell-meta")).not.toBeNull();
    expect(
      startGroup?.querySelectorAll<HTMLAnchorElement>(".obv-cell-link").length,
    ).toBe(2);
    expect(
      endGroup?.querySelector('[data-toolbar-action="comment"]'),
    ).not.toBeNull();
    expect(
      endGroup?.querySelector('[data-toolbar-action="comment"]')
        ?.querySelector(".obv-cell-count-badge"),
    ).not.toBeNull();
    expect(
      endGroup?.querySelector('[data-toolbar-action="send"]'),
    ).not.toBeNull();
  });

  it("renders PR number, PR link, and thread link from context", () => {
    toolbar = new FeedbackToolbar({
      context: {
        prNumber: 14125,
        prTitle: "Add toolbar",
        prUrl: "https://github.com/example/repo/pull/14125",
        threadUrl: "https://app.obvious.ai/autobuild/executables/exe_test",
      },
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const html =
      document.querySelector("[data-obvious-feedback-toolbar]")?.shadowRoot
        ?.innerHTML ?? "";
    expect(html).toContain("github.com/example/repo/pull/14125");
    expect(html).toContain("PR #14125");
    expect(html).toContain("app.obvious.ai/autobuild/executables/exe_test");
    expect(html).toContain(">Thread<");
  });

  it("renders only the branch label from preview context", () => {
    toolbar = new FeedbackToolbar({
      context: {
        branch: "local-feedback-sdk-preview",
        commitSha: "e51dbe7705abcdef",
        buildId: "local-13446",
      },
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const html =
      document.querySelector("[data-obvious-feedback-toolbar]")?.shadowRoot
        ?.innerHTML ?? "";
    expect(html).toContain("local-feedback-sdk-preview");
    expect(html).not.toContain("e51dbe7");
    expect(html).not.toContain("Build local-13446");
  });

  it("omits preview metadata when no branch is available", () => {
    toolbar = new FeedbackToolbar({
      context: {
        commitSha: "e51dbe7705abcdef",
        buildId: "local-13446",
      },
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const root = document.querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot;
    expect(root?.querySelector(".obv-cell-meta")).toBeNull();
  });

  it("skips invalid javascript: URLs in context links", () => {
    toolbar = new FeedbackToolbar({
      context: {
        prNumber: 14125,
        prUrl: "javascript:alert(1)",
      },
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const html =
      document.querySelector("[data-obvious-feedback-toolbar]")?.shadowRoot
        ?.innerHTML ?? "";
    expect(html).not.toContain("javascript:");
  });

  it("emits onCommentClick when the Comment button is clicked", () => {
    let clicks = 0;
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: () => {
        clicks += 1;
      },
      onSendClick: createNoop(),
    });
    const button = document
      .querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot?.querySelector<HTMLButtonElement>(
        '[data-toolbar-action="comment"]',
      );
    button?.click();
    expect(clicks).toBe(1);
  });

  it("omits the PR link cell when no prUrl is provided", () => {
    toolbar = new FeedbackToolbar({
      context: { branch: "feat/foo" },
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    const linkCells = host?.shadowRoot?.querySelectorAll(".obv-cell-link");
    expect(linkCells?.length ?? 0).toBe(0);
  });

  describe("sent takeover banner", () => {
    it("replaces the cell layout with the autobuild banner when status flips to sent", () => {
      toolbar = new FeedbackToolbar({
        context: {
          threadUrl: "https://app.obvious.ai/autobuild/executables/exe_test",
        },
        theme: "light",
        initialPinCount: 1,
        onCommentClick: createNoop(),
        onSendClick: createNoop(),
      });
      toolbar.setStatus("sent");
      const host = document.querySelector("[data-obvious-feedback-toolbar]");
      const root = host?.shadowRoot;
      expect(root?.querySelector(".obv-toolbar-sent")).not.toBeNull();
      expect(root?.querySelector(".obv-sent-banner")).not.toBeNull();
      expect(root?.querySelector(".obv-group-end")).toBeNull();
      expect(root?.querySelector(".obv-sent-text")?.textContent ?? "").toContain(
        "Autobuild is on it.",
      );
    });

    it("keeps the drag handle accessible during the takeover", () => {
      toolbar = new FeedbackToolbar({
        context: undefined,
        theme: "light",
        initialPinCount: 0,
        onCommentClick: createNoop(),
        onSendClick: createNoop(),
      });
      toolbar.setStatus("sent");
      const host = document.querySelector("[data-obvious-feedback-toolbar]");
      expect(
        host?.shadowRoot?.querySelector("[data-obv-drag-handle]"),
      ).not.toBeNull();
    });

    it("links the CTA to the threadUrl when present", () => {
      toolbar = new FeedbackToolbar({
        context: {
          threadUrl: "https://app.obvious.ai/autobuild/executables/exe_test",
          prUrl: "https://github.com/example/repo/pull/14125",
        },
        theme: "light",
        initialPinCount: 0,
        onCommentClick: createNoop(),
        onSendClick: createNoop(),
      });
      toolbar.setStatus("sent");
      const cta = document
        .querySelector("[data-obvious-feedback-toolbar]")
        ?.shadowRoot?.querySelector<HTMLAnchorElement>(".obv-sent-cta");
      expect(cta?.getAttribute("href")).toBe(
        "https://app.obvious.ai/autobuild/executables/exe_test",
      );
      expect(cta?.textContent ?? "").toContain("View Progress");
    });

    it("falls back to the PR link when no threadUrl is present", () => {
      toolbar = new FeedbackToolbar({
        context: { prUrl: "https://github.com/example/repo/pull/14125" },
        theme: "light",
        initialPinCount: 0,
        onCommentClick: createNoop(),
        onSendClick: createNoop(),
      });
      toolbar.setStatus("sent");
      const cta = document
        .querySelector("[data-obvious-feedback-toolbar]")
        ?.shadowRoot?.querySelector<HTMLAnchorElement>(".obv-sent-cta");
      expect(cta?.getAttribute("href")).toBe(
        "https://github.com/example/repo/pull/14125",
      );
      expect(cta?.textContent ?? "").toContain("View Progress");
    });

    it("renders the banner without a CTA when no thread or PR URL is provided", () => {
      toolbar = new FeedbackToolbar({
        context: undefined,
        theme: "light",
        initialPinCount: 0,
        onCommentClick: createNoop(),
        onSendClick: createNoop(),
      });
      toolbar.setStatus("sent");
      const root = document.querySelector("[data-obvious-feedback-toolbar]")
        ?.shadowRoot;
      expect(root?.querySelector(".obv-sent-banner")).not.toBeNull();
      expect(root?.querySelector(".obv-sent-cta")).toBeNull();
    });
  });
});
