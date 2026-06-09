/**
 * Toolbar styles. Scoped to the new flat draggable toolbar — pin overlay and
 * picker overlay define their own scoped styles inline.
 */

export const TOOLBAR_HEIGHT_PX = 36;

export function createToolbarStyles(): string {
  return `
    :host {
      all: initial;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color-scheme: light;
      transition: opacity 160ms ease, visibility 160ms ease;
      --obv-bg: #ffffff;
      --obv-bg-elevated: #ffffff;
      --obv-text: #18181b;
      --obv-text-muted: rgba(24, 24, 27, 0.6);
      --obv-border: rgba(24, 24, 27, 0.12);
      --obv-divider: rgba(24, 24, 27, 0.08);
      --obv-accent: #facc15;
      --obv-accent-foreground: #1f2937;
      --obv-accent-text: #a16207;
      --obv-accent-ring: rgba(250, 204, 21, 0.55);
      --obv-danger: #ef4444;
      --obv-success: #16a34a;
      --obv-shadow: 0 8px 24px rgba(0, 0, 0, 0.14), 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    :host([data-hidden="true"]) {
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
    }
    /* Presentation-offset layer. Owns the vertical slide (edge-dock, hover-peek,
     * slide-to-hide) independently of the host's committed drag position. Because
     * transform moves hit-testing too, only the visually-rendered bar is
     * interactive — no phantom hit area at the committed position. */
    .obv-dock {
      display: inline-flex;
      position: relative;
      pointer-events: auto;
      transform: translateY(var(--obv-dock-y, 0px));
      transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
      will-change: transform;
    }
    .obv-dock-content {
      display: inline-flex;
    }
    /* Stable transparent hover strip below the committed host. It does not move
     * with the dock, so the bottom-edge target stays under the cursor while
     * the toolbar peeks/tucks. Inert unless docked. */
    .obv-dock-hover-pad {
      position: absolute;
      left: 0;
      right: 0;
      top: calc(100% - 4px);
      height: 48px;
      pointer-events: none;
    }
    :host([data-presentation="docked"]) .obv-dock-hover-pad {
      pointer-events: auto;
    }
    :host([data-presentation="hidden"]) .obv-dock {
      pointer-events: none;
    }
    /* No slide while dragging — the bar must track the cursor 1:1. */
    :host([data-dragging="true"]) .obv-dock {
      transition: none;
    }
    @media (prefers-reduced-motion: reduce) {
      :host {
        transition: none;
      }
      .obv-dock {
        transition: none;
      }
    }
    :host([data-theme="dark"]) {
      color-scheme: dark;
      --obv-bg: rgba(24, 24, 27, 0.92);
      --obv-bg-elevated: rgba(39, 39, 42, 0.96);
      --obv-text: #f4f4f5;
      --obv-text-muted: rgba(244, 244, 245, 0.6);
      --obv-border: rgba(255, 255, 255, 0.12);
      --obv-divider: rgba(255, 255, 255, 0.08);
      --obv-accent-text: #fde047;
      --obv-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06);
    }
    @media (prefers-color-scheme: dark) {
      :host([data-theme="system"]) {
        color-scheme: dark;
        --obv-bg: rgba(24, 24, 27, 0.92);
        --obv-bg-elevated: rgba(39, 39, 42, 0.96);
        --obv-text: #f4f4f5;
        --obv-text-muted: rgba(244, 244, 245, 0.6);
        --obv-border: rgba(255, 255, 255, 0.12);
        --obv-divider: rgba(255, 255, 255, 0.08);
        --obv-accent-text: #fde047;
        --obv-shadow: 0 12px 32px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06);
      }
    }
    .obv-toolbar {
      display: inline-flex;
      align-items: stretch;
      height: ${TOOLBAR_HEIGHT_PX}px;
      max-width: calc(100vw - 24px);
      min-width: 0;
      padding: 0 4px;
      gap: 0;
      background: var(--obv-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-radius: 999px;
      box-shadow: var(--obv-shadow), 0 0 0 1px var(--obv-border);
      color: var(--obv-text);
      user-select: none;
      cursor: grab;
      touch-action: none;
      will-change: transform;
      animation: obv-toolbar-fade-in 220ms ease;
    }
    .obv-group {
      display: inline-flex;
      align-items: stretch;
    }
    .obv-group-start {
      flex: 0 1 auto;
      min-width: 0;
    }
    .obv-group-end {
      flex: 0 0 auto;
      margin-left: auto;
      box-shadow: inset 1px 0 0 var(--obv-divider);
      padding-left: 2px;
    }
    .obv-toolbar-compact {
      min-width: 0;
    }
    .obv-toolbar-compact .obv-group-start {
      flex: 0 0 auto;
    }
    .obv-toolbar-compact .obv-group-end {
      margin-left: 0;
      box-shadow: none;
      padding-left: 0;
    }
    :host([data-dragging="true"]) .obv-toolbar {
      cursor: grabbing;
      box-shadow: var(--obv-shadow), 0 0 0 1px var(--obv-border), 0 0 0 4px rgba(250, 204, 21, 0.25);
    }
    .obv-toolbar-sent {
      min-width: 0;
      padding-right: 8px;
    }
    .obv-sent-banner {
      flex: 0 1 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 0 12px;
      font-size: 13px;
      min-width: 0;
    }
    .obv-sent-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--obv-accent);
      animation: obv-sent-sparkle 1800ms ease-in-out infinite;
    }
    .obv-sent-icon .obv-icon {
      width: 16px;
      height: 16px;
    }
    @media (prefers-reduced-motion: reduce) {
      .obv-sent-icon {
        animation: none;
      }
    }
    .obv-sent-text {
      font-weight: 600;
      color: var(--obv-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .obv-sent-cta {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 12px;
      height: 26px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      color: var(--obv-accent-foreground);
      background: var(--obv-accent);
      text-decoration: none;
      transition: background 120ms ease, transform 120ms ease;
    }
    .obv-sent-cta:hover {
      background: #fde047;
      transform: translateX(1px);
    }
    .obv-sent-cta:focus-visible {
      outline: 2px solid var(--obv-accent);
      outline-offset: 2px;
    }
    .obv-sent-cta .obv-icon {
      width: 12px;
      height: 12px;
    }
    @keyframes obv-sent-sparkle {
      0%, 100% { opacity: 1; transform: scale(1) rotate(0deg); }
      50% { opacity: 0.7; transform: scale(1.15) rotate(20deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .obv-toolbar {
        animation: none;
      }
      .obv-cell-send {
        transition: none;
      }
    }
    @keyframes obv-toolbar-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .obv-cell {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 10px;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      line-height: 1;
      white-space: nowrap;
      border-radius: 0;
      text-decoration: none;
      transition: color 120ms ease;
    }
    @media (prefers-reduced-motion: reduce) {
      .obv-cell {
        transition: none;
      }
    }
    .obv-cell + .obv-cell {
      box-shadow: inset 1px 0 0 var(--obv-divider);
    }
    .obv-cell + .obv-cell-send {
      box-shadow: none;
    }
    .obv-cell-grip,
    .obv-cell-icon,
    .obv-cell-link,
    .obv-cell-meta,
    .obv-cell-status {
      padding: 0 10px;
    }
    .obv-cell-grip {
      cursor: grab;
      color: var(--obv-text-muted);
      padding: 0 8px;
    }
    .obv-cell-grip:active {
      cursor: grabbing;
    }
    .obv-cell-grip:hover {
      color: var(--obv-accent-text);
    }
    .obv-cell-grip .obv-icon {
      width: 18px;
      height: 18px;
    }
    .obv-cell-icon {
      color: var(--obv-text-muted);
    }
    .obv-cell-icon .obv-icon {
      width: 17px;
      height: 17px;
    }
    .obv-cell-text {
      font-weight: 600;
    }
    .obv-cell-text .obv-icon {
      width: 14px;
      height: 14px;
    }
    .obv-cell-primary {
      color: var(--obv-text);
    }
    .obv-cell-comment-action {
      gap: 6px;
    }
    .obv-cell-count-badge {
      display: inline;
      min-width: 0;
      height: auto;
      padding: 0;
      margin-left: 1px;
      border-radius: 0;
      background: transparent;
      color: var(--obv-text-muted);
      font-size: 11px;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
      line-height: 1;
      opacity: 0.72;
      pointer-events: none;
    }
    .obv-cell-count-badge::before {
      content: "·";
      margin-right: 3px;
      opacity: 0.55;
      font-weight: 500;
    }
    .obv-cell-primary:hover:not(:disabled) .obv-cell-count-badge {
      color: var(--obv-text-muted);
      background: transparent;
      opacity: 0.95;
    }
    .obv-cell-picking .obv-cell-count-badge {
      color: var(--obv-accent-text);
      background: transparent;
      opacity: 0.88;
    }
    .obv-cell-send {
      color: var(--obv-accent-foreground);
      background: var(--obv-accent);
      border-radius: 999px;
      margin: 4px 2px;
      padding: 0 10px;
      box-shadow: 0 1px 2px rgba(24, 24, 27, 0.08);
      white-space: nowrap;
      cursor: pointer;
      transition:
        background 140ms ease,
        box-shadow 140ms ease;
    }
    .obv-cell-send .obv-cell-label {
      font-size: 12px;
    }
    .obv-cell-send:disabled {
      cursor: progress;
      opacity: 0.7;
    }
    .obv-cell-send:hover:not(:disabled) {
      background: var(--obv-accent);
      box-shadow:
        0 1px 2px rgba(24, 24, 27, 0.08),
        0 0 0 1px rgba(161, 98, 7, 0.28);
    }
    .obv-cell-send:active:not(:disabled) {
      background: #fde047;
      box-shadow:
        0 1px 2px rgba(24, 24, 27, 0.08),
        0 0 0 1px rgba(161, 98, 7, 0.4);
    }
    .obv-cell-meta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--obv-text-muted);
      max-width: min(560px, calc(100vw - 260px));
      overflow: visible;
      pointer-events: none;
    }
    .obv-meta-item {
      display: inline-block;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .obv-meta-branch {
      max-width: min(320px, 36vw);
    }
    .obv-meta-separator {
      color: var(--obv-text-muted);
      opacity: 0.65;
      flex: 0 0 auto;
    }
    .obv-cell-status {
      font-size: 12px;
      font-weight: 500;
      pointer-events: none;
      color: var(--obv-text-muted);
    }
    .obv-cell-picking {
      gap: 6px;
      color: var(--obv-accent-text);
      font-weight: 600;
      pointer-events: auto;
    }
    .obv-cell-picking .obv-icon {
      width: 14px;
      height: 14px;
    }
    .obv-cell-status[data-tone="success"] {
      color: var(--obv-success);
    }
    .obv-cell-status[data-tone="success"] .obv-icon {
      width: 14px;
      height: 14px;
    }
    .obv-cell-status[data-tone="danger"] {
      color: var(--obv-danger);
    }
    .obv-cell-link {
      color: var(--obv-text-muted);
      font-size: 12px;
      font-weight: 500;
    }
    .obv-cell-link .obv-icon {
      width: 14px;
      height: 14px;
    }
    .obv-cell-link:hover,
    .obv-cell-icon:hover,
    .obv-cell-text:hover:not(:disabled),
    .obv-cell-primary:hover:not(:disabled) {
      color: var(--obv-accent-text);
      background: transparent;
    }
    .obv-cell-link:focus-visible,
    .obv-cell-icon:focus-visible,
    .obv-cell-text:focus-visible,
    .obv-cell-grip:focus-visible {
      outline: 2px solid var(--obv-accent);
      outline-offset: -3px;
      border-radius: 999px;
    }
    .obv-icon {
      stroke: currentColor;
      stroke-width: 1.6;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }
  `;
}
