import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  computeSnoozeUntil,
  FeedbackToolbar,
  readActiveSnooze,
  resolveToolbarPresentation,
  type ToolbarPresentationState,
} from "../../src/widget/feedback-toolbar";

function createNoop(): () => void {
  return () => undefined;
}

const METRICS = { peekOffset: 40, hideOffset: 68 };

function presentationState(
  overrides: Partial<ToolbarPresentationState>,
): ToolbarPresentationState {
  return {
    restingMode: "open",
    userHidden: false,
    snoozed: false,
    isPeeking: false,
    popoverSuppressed: false,
    isDragging: false,
    dragDockY: 0,
    ...overrides,
  };
}

function readDockY(host: Element | null | undefined): number {
  const value = host instanceof HTMLElement
    ? host.style.getPropertyValue("--obv-dock-y")
    : "";
  return Number.parseFloat(value) || 0;
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

  describe("resolveToolbarPresentation", () => {
    it("keeps the open bar fully visible and interactive", () => {
      const resolved = resolveToolbarPresentation(
        presentationState({ restingMode: "open" }),
        METRICS,
      );
      expect(resolved).toEqual({
        dockY: 0,
        opacity: 1,
        interactive: true,
        presentation: "open",
        peeking: false,
      });
    });

    it("hides a docked bar fully out of sight and reveals only a sliver while peeking", () => {
      const tucked = resolveToolbarPresentation(
        presentationState({ restingMode: "docked" }),
        METRICS,
      );
      expect(tucked.dockY).toBe(METRICS.hideOffset);
      expect(tucked.presentation).toBe("docked");
      expect(tucked.peeking).toBe(false);

      const peeking = resolveToolbarPresentation(
        presentationState({ restingMode: "docked", isPeeking: true }),
        METRICS,
      );
      // A sliver: partway out, not fully open and not fully hidden.
      expect(peeking.dockY).toBe(METRICS.peekOffset);
      expect(peeking.dockY).toBeGreaterThan(0);
      expect(peeking.dockY).toBeLessThan(METRICS.hideOffset);
      expect(peeking.presentation).toBe("docked");
      expect(peeking.peeking).toBe(true);
    });

    it("keeps shortcut-hidden docked state hoverable", () => {
      const resolved = resolveToolbarPresentation(
        presentationState({ userHidden: true, restingMode: "docked" }),
        METRICS,
      );
      expect(resolved.dockY).toBe(METRICS.hideOffset);
      expect(resolved.presentation).toBe("docked");
      expect(resolved.interactive).toBe(true);
    });

    it("fades in place (no slide) for popover suppression", () => {
      const resolved = resolveToolbarPresentation(
        presentationState({ popoverSuppressed: true, restingMode: "docked" }),
        METRICS,
      );
      expect(resolved.dockY).toBe(0);
      expect(resolved.opacity).toBe(0);
      expect(resolved.interactive).toBe(false);
    });

    it("uses the drag presentation offset while dragging below the clamp", () => {
      const resolved = resolveToolbarPresentation(
        presentationState({
          isDragging: true,
          restingMode: "docked",
          userHidden: true,
          dragDockY: 42,
        }),
        METRICS,
      );
      expect(resolved.dockY).toBe(42);
      expect(resolved.interactive).toBe(true);
    });

    it("fully removes the bar while snoozed, outranking every other state", () => {
      // Snooze sits at top precedence — even a drag in flight cannot surface
      // the bar, because a snoozed bar has no pointer events to drag with.
      const resolved = resolveToolbarPresentation(
        presentationState({
          snoozed: true,
          isDragging: true,
          restingMode: "docked",
          isPeeking: true,
          dragDockY: 42,
        }),
        METRICS,
      );
      expect(resolved).toEqual({
        dockY: 0,
        opacity: 0,
        interactive: false,
        presentation: "hidden",
        peeking: false,
      });
    });
  });

  it("keeps a stable .obv-dock wrapper across re-renders", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const root = document.querySelector("[data-obvious-feedback-toolbar]")
      ?.shadowRoot;
    const dockBefore = root?.querySelector(".obv-dock");
    expect(dockBefore).not.toBeNull();
    toolbar.setPinCount(3);
    const dockAfter = root?.querySelector(".obv-dock");
    expect(dockAfter).toBe(dockBefore ?? null);
  });

  it("slides the bar off-screen and back via the user-hidden toggle", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-presentation")).toBe("open");
    expect(readDockY(host)).toBe(0);
    expect(toolbar.isUserHidden()).toBe(false);

    const hidden = toolbar.toggleUserHidden();
    expect(hidden).toBe(true);
    expect(toolbar.isUserHidden()).toBe(true);
    expect(host?.getAttribute("data-presentation")).toBe("docked");
    expect(readDockY(host)).toBeGreaterThan(0);

    toolbar.toggleUserHidden();
    expect(host?.getAttribute("data-presentation")).toBe("open");
    expect(readDockY(host)).toBe(0);
  });

  it("starts a docked bar fully out of sight and reveals only a sliver on hover", () => {
    window.localStorage.setItem(
      `obvious.feedback.toolbarRestingMode:${window.location.origin}`,
      "docked",
    );
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    const dock = host?.shadowRoot?.querySelector(".obv-dock");
    expect(host?.getAttribute("data-presentation")).toBe("docked");
    expect(host?.getAttribute("data-peeking")).toBe("false");
    const tuckedY = readDockY(host);
    expect(tuckedY).toBeGreaterThan(0);

    dock?.dispatchEvent(new Event("pointerenter"));
    expect(host?.getAttribute("data-peeking")).toBe("true");
    const peekY = readDockY(host);
    // Sliver only: partway out, still mostly hidden (not flush at 0).
    expect(peekY).toBeGreaterThan(0);
    expect(peekY).toBeLessThan(tuckedY);

    dock?.dispatchEvent(new Event("pointerleave"));
    expect(host?.getAttribute("data-peeking")).toBe("false");
    expect(readDockY(host)).toBe(tuckedY);
  });

  it("undocks the bar fully when the docked sliver is clicked", () => {
    window.localStorage.setItem(
      `obvious.feedback.toolbarRestingMode:${window.location.origin}`,
      "docked",
    );
    let commentClicks = 0;
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: () => {
        commentClicks += 1;
      },
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    const commentButton = host?.shadowRoot?.querySelector<HTMLButtonElement>(
      '[data-toolbar-action="comment"]',
    );
    expect(host?.getAttribute("data-presentation")).toBe("docked");

    commentButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Toolbar actions reveal the dock and continue to the action immediately.
    expect(host?.getAttribute("data-presentation")).toBe("open");
    expect(readDockY(host)).toBe(0);
    expect(commentClicks).toBe(1);
    expect(
      window.localStorage.getItem(
        `obvious.feedback.toolbarRestingMode:${window.location.origin}`,
      ),
    ).toBe("open");

    // Subsequent open clicks still reach the toolbar action normally.
    commentButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(commentClicks).toBe(2);
  });

  it("brings a docked bar fully back via the shortcut toggle", () => {
    window.localStorage.setItem(
      `obvious.feedback.toolbarRestingMode:${window.location.origin}`,
      "docked",
    );
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    expect(host?.getAttribute("data-presentation")).toBe("docked");

    // Docked → shortcut reveals fully (open), not the sliver.
    const hidden = toolbar.toggleUserHidden();
    expect(hidden).toBe(false);
    expect(host?.getAttribute("data-presentation")).toBe("open");
    expect(readDockY(host)).toBe(0);

    // Open → shortcut hides fully.
    expect(toolbar.toggleUserHidden()).toBe(true);
    expect(host?.getAttribute("data-presentation")).toBe("docked");
  });

  it("fades in place for popover suppression without sliding", () => {
    toolbar = new FeedbackToolbar({
      context: undefined,
      theme: "light",
      initialPinCount: 0,
      onCommentClick: createNoop(),
      onSendClick: createNoop(),
    });
    const host = document.querySelector("[data-obvious-feedback-toolbar]");
    toolbar.setPopoverSuppressed(true);
    expect(host?.getAttribute("data-hidden")).toBe("true");
    expect(readDockY(host)).toBe(0);
    toolbar.setPopoverSuppressed(false);
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

    it("falls back to the triage issue link when no thread or PR URL is present", () => {
      toolbar = new FeedbackToolbar({
        context: {
          issueUrl: "https://app.obvious.ai/autobuild?issue=abi_test&tab=issues",
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
        "https://app.obvious.ai/autobuild?issue=abi_test&tab=issues",
      );
      expect(cta?.textContent ?? "").toContain("View Progress");
    });

    it("renders the banner without a CTA when no progress URL is provided", () => {
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

  describe("toolbar snooze", () => {
    const SNOOZE_KEY = `obvious.feedback.toolbarSnoozedUntil:${window.location.origin}`;
    const VISIBLE_KEY = `obvious.feedback.toolbarVisible:${window.location.origin}`;
    const RESTING_KEY = `obvious.feedback.toolbarRestingMode:${window.location.origin}`;

    function makeToolbar(): FeedbackToolbar {
      toolbar = new FeedbackToolbar({
        context: undefined,
        theme: "light",
        initialPinCount: 0,
        onCommentClick: createNoop(),
        onSendClick: createNoop(),
      });
      return toolbar;
    }

    function getHost(): HTMLElement | null | undefined {
      return document.querySelector<HTMLElement>(
        "[data-obvious-feedback-toolbar]",
      );
    }

    function getRoot(): ShadowRoot | null | undefined {
      return getHost()?.shadowRoot;
    }

    function getMenu(): HTMLDivElement | null | undefined {
      return getRoot()?.querySelector<HTMLDivElement>(".obv-toolbar-menu");
    }

    function getMenuItems(): HTMLButtonElement[] {
      const menu = getMenu();
      return menu
        ? Array.from(
            menu.querySelectorAll<HTMLButtonElement>("[data-obv-snooze]"),
          )
        : [];
    }

    /** Right-click anywhere on the bar — the listener sits on .obv-dock, so a
     * bubbling contextmenu from any child reaches it. */
    function rightClick(target: Element | null | undefined): MouseEvent {
      if (!target) {
        throw new Error("rightClick requires a target element");
      }
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
      });
      target.dispatchEvent(event);
      return event;
    }

    /** Drive a real drag through the draggable controller: primary-button
     * pointerdown on the drag surface (`.obv-toolbar` — the draggable handle),
     * then a window pointermove past the 4px threshold. The move target
     * defaults to a small in-viewport nudge; passing a clientY beyond the
     * viewport height drives the bar below the screen so the drag ends docked
     * (DraggableMoveInfo.overflowY > 0 → suppressNextDockClick armed). */
    function startDrag(toX = 140, toY = 140): void {
      const surface = getRoot()?.querySelector(".obv-toolbar");
      surface?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          isPrimary: true,
          clientX: 100,
          clientY: 100,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          pointerId: 1,
          isPrimary: true,
          clientX: toX,
          clientY: toY,
        }),
      );
    }

    function endDrag(toX = 140, toY = 140): void {
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          pointerId: 1,
          isPrimary: true,
          clientX: toX,
          clientY: toY,
        }),
      );
    }

    const tick = (ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      });

    it("computes the 1h snooze as exactly now + 3600000 ms", () => {
      const now = 1_757_548_800_000;
      expect(computeSnoozeUntil("1h", now)).toBe(now + 3_600_000);
    });

    it("computes the day snooze as the next local midnight", () => {
      // 23:30 local → next midnight is 30 minutes away (the correct plain
      // meaning of "until tomorrow", not an off-by-one day).
      const at2330 = new Date(2026, 8, 11, 23, 30, 0, 0).getTime();
      const nextMidnight = new Date(2026, 8, 12, 0, 0, 0, 0).getTime();
      expect(computeSnoozeUntil("day", at2330)).toBe(nextMidnight);
      expect(nextMidnight - at2330).toBe(30 * 60 * 1000);

      // Midday → next midnight is 12 hours away; same calendar-day arithmetic.
      const atNoon = new Date(2026, 8, 11, 12, 0, 0, 0).getTime();
      expect(computeSnoozeUntil("day", atNoon) - atNoon).toBe(
        12 * 60 * 60 * 1000,
      );
    });

    it("opens exactly two menu items on right-click and suppresses the browser menu", () => {
      makeToolbar();
      const dock = getRoot()?.querySelector(".obv-dock");
      expect(dock).not.toBeNull();

      const event = rightClick(dock ?? getHost());
      expect(event.defaultPrevented).toBe(true);

      const menu = getMenu();
      expect(menu?.hidden).toBe(false);
      expect(menu?.getAttribute("role")).toBe("menu");
      const items = getMenuItems();
      expect(items.length).toBe(2);
      expect(items[0]?.getAttribute("role")).toBe("menuitem");
      expect(items[0]?.getAttribute("data-obv-snooze")).toBe("1h");
      expect(items[0]?.textContent?.trim()).toBe("Hide for 1 hour");
      expect(items[1]?.getAttribute("role")).toBe("menuitem");
      expect(items[1]?.getAttribute("data-obv-snooze")).toBe("day");
      expect(items[1]?.textContent?.trim()).toBe("Hide until tomorrow");
    });

    it("focuses the first item on open and moves focus with arrow keys", () => {
      makeToolbar();
      const dock = getRoot()?.querySelector(".obv-dock");
      rightClick(dock ?? getHost());

      const items = getMenuItems();
      expect(getRoot()?.activeElement).toBe(items[0]);

      getMenu()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      expect(getRoot()?.activeElement).toBe(items[1]);

      getMenu()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      expect(getRoot()?.activeElement).toBe(items[0]);
    });

    it("wraps arrow-key focus around the ends of the menu", () => {
      makeToolbar();
      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());

      const items = getMenuItems();
      const menu = getMenu();
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }),
      );
      // Up from the first item wraps to the last.
      expect(getRoot()?.activeElement).toBe(items[1]);
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
      // Down from the last item wraps back to the first.
      expect(getRoot()?.activeElement).toBe(items[0]);
    });

    it("keeps the menu open when pointerdown lands on a menu item", () => {
      // Regression guard: the dismissal listener sits on window, outside the
      // shadow root. Real browsers retarget shadow-internal events to the host
      // element, so containment checks against event.target classify item
      // presses as "outside" and the menu closes before the click lands —
      // items become unclickable. The handler must use composedPath().
      makeToolbar();
      const dock = getRoot()?.querySelector(".obv-dock");
      rightClick(dock ?? getHost());
      const menu = getMenu();
      expect(menu?.hidden).toBe(false);

      menu
        ?.querySelector('[data-obv-snooze="1h"]')
        ?.dispatchEvent(
          new PointerEvent("pointerdown", {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        );
      expect(menu?.hidden).toBe(false);
    });

    it("closes the menu on Escape and restores the previously-focused element", () => {
      makeToolbar();
      const commentButton = getRoot()?.querySelector<HTMLButtonElement>(
        '[data-toolbar-action="comment"]',
      );
      expect(commentButton).not.toBeNull();
      commentButton?.focus();

      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      // The menu moved focus to its first item.
      expect(getRoot()?.activeElement).toBe(getMenuItems()[0]);

      getMenu()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(getMenu()?.hidden).toBe(true);
      expect(getRoot()?.activeElement).toBe(commentButton);
    });

    it("returns focus to the bar's drag handle when nothing held focus before the open", () => {
      // Right-click never moves focus, so a fresh bar has no pre-open focus
      // target — Escape must still land somewhere real inside the bar rather
      // than stranding on <body>.
      makeToolbar();
      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());

      getMenu()?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(getMenu()?.hidden).toBe(true);
      expect(getRoot()?.activeElement).toBe(
        getRoot()?.querySelector(".obv-cell-grip"),
      );
    });

    it("restores focus when a menu-item selection closes the menu", () => {
      // After selection the bar is snoozed/hidden; focus still returns into
      // the (now hidden) bar rather than stranding — the documented
      // closeSnoozeMenu choice.
      const bar = makeToolbar();
      const commentButton = getRoot()?.querySelector<HTMLButtonElement>(
        '[data-toolbar-action="comment"]',
      );
      expect(commentButton).not.toBeNull();
      commentButton?.focus();

      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      getMenuItems()[0]?.click();

      expect(bar.isSnoozed()).toBe(true);
      expect(getRoot()?.activeElement).toBe(commentButton);
    });

    it("closes the menu on a pointerdown outside of it", () => {
      makeToolbar();
      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      expect(getMenu()?.hidden).toBe(false);

      document.body.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true }),
      );
      expect(getMenu()?.hidden).toBe(true);
    });

    it("closes the menu on drag start and stays closed while dragging", () => {
      makeToolbar();
      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      expect(getMenu()?.hidden).toBe(false);

      startDrag();
      expect(getMenu()?.hidden).toBe(true);

      // While the drag is in flight, right-click does not reopen the menu.
      const event = rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      expect(event.defaultPrevented).toBe(false);
      expect(getMenu()?.hidden).toBe(true);
      endDrag();
    });

    it("snoozes for 1h from the menu, persists, and fully hides the bar", () => {
      const bar = makeToolbar();
      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());

      const before = Date.now();
      getMenuItems()[0]?.click();

      expect(bar.isSnoozed()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");
      expect(getMenu()?.hidden).toBe(true);

      // Typed read from the module — the exported reader parses and
      // shape-checks the stored record, so no JSON.parse cast is needed.
      const stored = readActiveSnooze();
      expect(stored).not.toBeNull();
      expect(stored?.duration).toBe("1h");
      expect(stored?.until).toBeGreaterThanOrEqual(before + 3_600_000);
      expect(stored?.until).toBeLessThanOrEqual(Date.now() + 3_600_000);
    });

    it("snoozes until tomorrow from the menu with the day duration", () => {
      const bar = makeToolbar();
      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());

      getMenuItems()[1]?.click();

      expect(bar.isSnoozed()).toBe(true);
      expect(readActiveSnooze()?.duration).toBe("day");
    });

    it("arms the snooze from the menu while docked and user-hidden, keeping the standing preference", () => {
      // F1 regression: the dock's capture-phase click handler used to swallow
      // the menu item's click (menu items are not [data-toolbar-action]) and
      // its revealFully() persisted userHidden=false — wiping the standing
      // visibility preference instead of arming the snooze.
      window.localStorage.setItem(VISIBLE_KEY, "false");
      window.localStorage.setItem(RESTING_KEY, "docked");
      const bar = makeToolbar();
      expect(bar.isUserHidden()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("docked");

      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      expect(getMenu()?.hidden).toBe(false);

      getMenuItems()[0]?.click();

      expect(bar.isSnoozed()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");
      // The standing preference and the docked resting mode must survive
      // untouched: a menu click is not a reveal.
      expect(window.localStorage.getItem(VISIBLE_KEY)).toBe("false");
      expect(window.localStorage.getItem(RESTING_KEY)).toBe("docked");
    });

    it("arms the snooze from the menu on a drag-docked bar without touching toolbarVisible", () => {
      // Same class of bug, visible-bar variant: a drag-docked bar whose
      // toolbarVisible is "true" must not have that preference rewritten by a
      // snooze-menu click either.
      window.localStorage.setItem(VISIBLE_KEY, "true");
      window.localStorage.setItem(RESTING_KEY, "docked");
      const bar = makeToolbar();
      expect(getHost()?.getAttribute("data-presentation")).toBe("docked");

      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      getMenuItems()[0]?.click();

      expect(bar.isSnoozed()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");
      expect(window.localStorage.getItem(VISIBLE_KEY)).toBe("true");
      expect(window.localStorage.getItem(RESTING_KEY)).toBe("docked");
    });

    it("arms the snooze from the menu on the first click after a real drag-dock", () => {
      // Sequencing regression: handleDragEnd arms suppressNextDockClick, and a
      // right-click menu open (contextmenu) does not clear it. The suppress
      // branch used to run before the composedPath guard, so the first menu
      // click after a drag-dock was swallowed — no snooze armed, menu stuck
      // open until a second click. The guard must outrank the suppress branch.
      const bar = makeToolbar();

      // Drag the bar below the viewport: the drag ends with overflowY > 0,
      // which handleDragEnd resolves as "docked" and arms the suppress flag.
      startDrag(140, 1400);
      endDrag(140, 1400);
      expect(getHost()?.getAttribute("data-presentation")).toBe("docked");

      rightClick(getRoot()?.querySelector(".obv-dock") ?? getHost());
      expect(getMenu()?.hidden).toBe(false);

      getMenuItems()[0]?.click();

      expect(bar.isSnoozed()).toBe(true);
      expect(getMenu()?.hidden).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");
    });

    it("restores the bar when the in-tab expiry timer fires", async () => {
      // Pre-seed a snooze that expires almost immediately: construction arms
      // the countdown, and the bar must return without a reload.
      window.localStorage.setItem(
        SNOOZE_KEY,
        JSON.stringify({ until: Date.now() + 40, duration: "1h" }),
      );
      const bar = makeToolbar();
      expect(bar.isSnoozed()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");

      await tick(150);

      expect(bar.isSnoozed()).toBe(false);
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
      expect(window.localStorage.getItem(SNOOZE_KEY)).toBeNull();
    });

    it("shows the bar and clears the key when the stored snooze is expired", () => {
      window.localStorage.setItem(
        SNOOZE_KEY,
        JSON.stringify({ until: Date.now() - 1000, duration: "1h" }),
      );
      const bar = makeToolbar();
      expect(bar.isSnoozed()).toBe(false);
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
      expect(window.localStorage.getItem(SNOOZE_KEY)).toBeNull();
    });

    it("shows the bar and clears the key when the stored snooze is malformed", () => {
      window.localStorage.setItem(SNOOZE_KEY, "not json at all");
      const bar = makeToolbar();
      expect(bar.isSnoozed()).toBe(false);
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
      expect(window.localStorage.getItem(SNOOZE_KEY)).toBeNull();
    });

    it("applies a snooze from another tab via the storage event", () => {
      const bar = makeToolbar();
      expect(bar.isSnoozed()).toBe(false);

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SNOOZE_KEY,
          newValue: JSON.stringify({
            until: Date.now() + 3_600_000,
            duration: "1h",
          }),
          storageArea: window.localStorage,
        }),
      );

      expect(bar.isSnoozed()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");
      // The listening tab must not write storage — the writer owns that.
      expect(window.localStorage.getItem(SNOOZE_KEY)).toBeNull();
    });

    it("clears a snooze from another tab when the key is removed there", () => {
      const bar = makeToolbar();
      bar.snooze("1h");
      expect(bar.isSnoozed()).toBe(true);

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SNOOZE_KEY,
          newValue: null,
          storageArea: window.localStorage,
        }),
      );

      expect(bar.isSnoozed()).toBe(false);
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
    });

    it("ignores storage events for unrelated keys", () => {
      const bar = makeToolbar();
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: VISIBLE_KEY,
          newValue: "false",
          storageArea: window.localStorage,
        }),
      );
      expect(bar.isSnoozed()).toBe(false);
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
    });

    it("clears the snooze on a storage event with a null key (localStorage.clear())", () => {
      // key === null signals localStorage.clear(), which also wiped the snooze
      // key — the listening tab must restore without throwing.
      const bar = makeToolbar();
      bar.snooze("1h");
      expect(bar.isSnoozed()).toBe(true);

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: null,
          newValue: null,
          storageArea: window.localStorage,
        }),
      );

      expect(bar.isSnoozed()).toBe(false);
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
    });

    it("ignores storage events whose storageArea is not this tab's localStorage", () => {
      // F7 guard: a sessionStorage-area event (or any non-localStorage area)
      // must never touch the snooze state.
      const bar = makeToolbar();
      bar.snooze("1h");
      expect(bar.isSnoozed()).toBe(true);

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: SNOOZE_KEY,
          newValue: null,
          storageArea: window.sessionStorage,
        }),
      );

      expect(bar.isSnoozed()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");
    });

    it("ignores synthetic storage events without a storageArea", () => {
      // Real browsers always set storageArea; a synthetic event without one
      // carries no proof of origin and must be ignored.
      const bar = makeToolbar();
      bar.snooze("1h");
      expect(bar.isSnoozed()).toBe(true);

      window.dispatchEvent(
        new StorageEvent("storage", { key: SNOOZE_KEY, newValue: null }),
      );

      expect(bar.isSnoozed()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");
    });

    it("never writes the standing toolbarVisible preference when snoozing", () => {
      const bar = makeToolbar();
      bar.snooze("1h");
      expect(window.localStorage.getItem(VISIBLE_KEY)).toBeNull();
      expect(window.localStorage.getItem(SNOOZE_KEY)).not.toBeNull();
    });

    it("keeps the standing userHidden preference after the snooze expires", async () => {
      window.localStorage.setItem(VISIBLE_KEY, "false");
      window.localStorage.setItem(
        SNOOZE_KEY,
        JSON.stringify({ until: Date.now() + 40, duration: "1h" }),
      );
      const bar = makeToolbar();
      expect(bar.isUserHidden()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("hidden");

      await tick(150);

      // Snooze gone, but the shortcut-hidden preference still holds — the bar
      // returns docked (shortcut-hidden), not open.
      expect(bar.isSnoozed()).toBe(false);
      expect(bar.isUserHidden()).toBe(true);
      expect(getHost()?.getAttribute("data-presentation")).toBe("docked");
    });

    it("cancels the snooze when the host calls setToolbarVisible(true)", () => {
      const bar = makeToolbar();
      bar.snooze("1h");
      expect(bar.isSnoozed()).toBe(true);

      bar.setUserHidden(false);

      expect(bar.isSnoozed()).toBe(false);
      expect(window.localStorage.getItem(SNOOZE_KEY)).toBeNull();
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
    });

    it("does not start a drag from a right-click pointer", () => {
      makeToolbar();
      const dock = getRoot()?.querySelector(".obv-dock");
      expect(dock).not.toBeNull();

      // Right-button pointerdown must not engage the drag surface, and the
      // subsequent contextmenu must still open the snooze menu.
      dock?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 2,
          pointerId: 1,
          isPrimary: true,
        }),
      );
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
      expect(readDockY(getHost())).toBe(0);

      const event = rightClick(dock ?? getHost());
      expect(event.defaultPrevented).toBe(true);
      expect(getMenu()?.hidden).toBe(false);
      expect(getHost()?.getAttribute("data-presentation")).toBe("open");
    });
  });
});
