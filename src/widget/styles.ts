import { DEFAULT_TRIGGER_SIZE_PX, TRIGGER_HIDDEN_PEEK_PX, TRIGGER_VIEWPORT_MARGIN_PX } from "../constants";

export function createStyles(): string {
  return `
    :host {
      all: initial;
      color-scheme: light;
      --obv-feedback-bg: #ffffff;
      --obv-feedback-bg-subtle: #f4f4f5;
      --obv-feedback-trigger-bg: #ffffff;
      --obv-feedback-text: #080808;
      --obv-feedback-muted: #71717a;
      --obv-feedback-border: rgba(15, 23, 42, 0.12);
      --obv-feedback-border-strong: rgba(15, 23, 42, 0.28);
      --obv-feedback-primary: #111111;
      --obv-feedback-primary-foreground: #ffffff;
      --obv-feedback-focus: color-mix(in srgb, var(--obv-feedback-border-strong) 42%, transparent);
      --obv-feedback-shadow: 0 18px 46px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.08);
      --obv-feedback-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.08);
      --obv-feedback-trigger-size: 44px;
      --obv-feedback-button-font-size: 12px;
      --obv-feedback-button-font-weight: 500;
      --obv-feedback-button-line-height: 16px;
      --obv-feedback-radius: 10px;
      --obv-feedback-radius-card: 18px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .obv-trigger, .obv-card button, .obv-card textarea { font-family: inherit; }
    .obv-trigger {
      position: fixed; right: 20px; bottom: 96px; z-index: 2147483647;
      touch-action: none; user-select: none;
      display: inline-flex; align-items: center; justify-content: center;
      width: var(--obv-feedback-trigger-size); height: var(--obv-feedback-trigger-size); box-sizing: border-box;
      border: 1px solid var(--obv-feedback-border); border-radius: 999px;
      background: var(--obv-feedback-trigger-bg); color: var(--obv-feedback-text);
      padding: 0; cursor: pointer;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14), var(--obv-feedback-shadow-sm);
      transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease, color 160ms ease, transform 160ms ease;
    }
    .obv-trigger:hover {
      border-color: var(--obv-feedback-border-strong);
      background: var(--obv-feedback-bg-subtle);
      transform: translateY(-1px);
    }
    .obv-trigger[data-trigger-hidden] {
      transition: left 160ms cubic-bezier(0.2, 0.8, 0.2, 1), top 160ms cubic-bezier(0.2, 0.8, 0.2, 1), border-color 120ms ease, box-shadow 120ms ease, background 120ms ease, color 120ms ease, transform 120ms ease;
    }
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="right"][data-trigger-peeking],
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="right"]:focus-visible {
      transform: translateX(-${DEFAULT_TRIGGER_SIZE_PX - TRIGGER_HIDDEN_PEEK_PX + TRIGGER_VIEWPORT_MARGIN_PX}px);
    }
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="left"][data-trigger-peeking],
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="left"]:focus-visible {
      transform: translateX(${DEFAULT_TRIGGER_SIZE_PX - TRIGGER_HIDDEN_PEEK_PX + TRIGGER_VIEWPORT_MARGIN_PX}px);
    }
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="top"][data-trigger-peeking],
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="top"]:focus-visible {
      transform: translateY(${DEFAULT_TRIGGER_SIZE_PX - TRIGGER_HIDDEN_PEEK_PX + TRIGGER_VIEWPORT_MARGIN_PX}px);
    }
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="bottom"][data-trigger-peeking],
    .obv-trigger[data-trigger-hidden][data-trigger-dock-side="bottom"]:focus-visible {
      transform: translateY(-${DEFAULT_TRIGGER_SIZE_PX - TRIGGER_HIDDEN_PEEK_PX + TRIGGER_VIEWPORT_MARGIN_PX}px);
    }
    .obv-trigger::after {
      content: attr(data-tooltip); pointer-events: none;
      position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%);
      padding: 4px 8px; border-radius: 6px;
      background: var(--obv-feedback-primary); color: var(--obv-feedback-primary-foreground);
      font-size: 11px; font-weight: 500; white-space: nowrap;
      opacity: 0; transition: opacity 100ms ease;
    }
    .obv-trigger:hover::after { opacity: 1; }
    /* Bug fix: anchor tooltip to right edge when trigger is in a right-side corner to prevent viewport overflow */
    .obv-trigger[data-trigger-corner$="-right"]::after { left: auto; right: 0; transform: none; }
    /* Bug fix: anchor tooltip to left edge when trigger is in a left-side corner */
    .obv-trigger[data-trigger-corner$="-left"]::after { left: 0; right: auto; transform: none; }
    /* Bug fix: hide trigger tooltip when the feedback card is open */
    .obv-trigger[data-card-open]::after { display: none; }
    .obv-issue-detail { margin-top: 10px; border: 1px solid var(--obv-feedback-border); border-radius: 14px; padding: 12px; background: var(--obv-feedback-bg-subtle); }
    .obv-issue-detail-header { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
    .obv-issue-detail-title { color: var(--obv-feedback-text); font-size: 14px; font-weight: 700; line-height: 1.3; }
    .obv-issue-detail-meta, .obv-issue-detail-body { margin-top: 7px; color: var(--obv-feedback-muted); font-size: 12px; line-height: 1.45; }
    .obv-issue-detail-status { display: inline-flex; align-items: center; gap: 6px; margin-top: 8px; color: var(--obv-feedback-text); font-size: 12px; font-weight: 650; }
    .obv-issue-detail-links { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 10px; }
    .obv-issue-detail-links a { color: var(--obv-feedback-text); font-size: 12px; font-weight: 650; }

    .obv-trigger:active { transform: translateY(0) scale(0.98); box-shadow: var(--obv-feedback-shadow-sm); }
    .obv-trigger:focus-visible, .obv-button:focus-visible, .obv-icon-button:focus-visible, .obv-textarea:focus {
      outline: none; border-color: var(--obv-feedback-border-strong); box-shadow: 0 0 0 3px var(--obv-feedback-focus), var(--obv-feedback-shadow-sm);
    }
    .obv-icon {
      display: block; width: 16px; height: 16px; flex: 0 0 16px;
      fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }
    .obv-trigger-icon { display: inline-flex; align-items: center; justify-content: center; color: currentColor; }
    .obv-trigger-icon .obv-icon { width: 18px; height: 18px; }
    .obv-trigger-ring {
      position: absolute; inset: -4px; border-radius: 999px; pointer-events: none;
      border: 1.5px solid color-mix(in srgb, var(--obv-feedback-primary) 55%, transparent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--obv-feedback-primary) 8%, transparent);
    }
    :host([data-theme="dark"]) .obv-trigger-ring {
      border-color: color-mix(in srgb, var(--obv-feedback-primary) 32%, transparent);
      box-shadow: 0 0 14px 1px color-mix(in srgb, var(--obv-feedback-primary) 12%, transparent);
    }
    .obv-trigger[data-issue-status="open"] .obv-trigger-icon { transform: scale(0.92); }
    .obv-trigger[data-assistant-position="bottom-left"] { left: 20px; right: auto; }
    .obv-trigger[data-assistant-position="top-right"] { top: 96px; bottom: auto; }
    .obv-trigger[data-assistant-position="top-left"] { top: 96px; left: 20px; right: auto; bottom: auto; }
    .obv-card {
      position: fixed; right: 20px; bottom: 150px; width: min(392px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow: visible; z-index: 2147483647;
      background: var(--obv-feedback-bg); color: var(--obv-feedback-text); border: 1px solid var(--obv-feedback-border); border-radius: var(--obv-feedback-radius-card);
      box-shadow: var(--obv-feedback-shadow); padding: 18px; box-sizing: border-box;
    }
    /* Inner scroll container: moves overflow out of .obv-card so footer tool ::after tooltips are not clipped */
    .obv-card-scroll { overflow-y: auto; max-height: calc(100vh - 76px); }
    .obv-card[data-assistant-position="bottom-left"] { left: 20px; right: auto; }
    .obv-card[data-assistant-position="top-right"] { top: 150px; bottom: auto; }
    .obv-card[data-assistant-position="top-left"] { top: 150px; left: 20px; right: auto; bottom: auto; }
    .obv-issue-section { margin-top: 12px; border-top: 1px solid var(--obv-feedback-border); padding-top: 10px; }
    .obv-issue-list { display: flex; flex-direction: column; gap: 6px; }
    .obv-issue-row {
      display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto; gap: 6px; align-items: center;
      min-height: 22px; color: var(--obv-feedback-muted); font-size: 11px; line-height: 1.3;
    }
    .obv-issue-row .obv-icon { width: 12px; height: 12px; flex-basis: 12px; }
    .obv-issue-title { color: var(--obv-feedback-text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
    a.obv-issue-title:hover { text-decoration: underline; }
    .obv-issue-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .obv-issue-dismiss { width: 22px; height: 22px; min-height: 22px; padding: 0; }

    .obv-kicker { display: inline-block; margin-bottom: 8px; color: var(--obv-feedback-muted); font-size: 11px; font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; }
    .obv-field-label { display: block; margin-bottom: 6px; color: var(--obv-feedback-text); font-size: 12px; font-weight: 650; }
    .obv-title { font-size: 18px; line-height: 1.18; font-weight: 700; margin-bottom: 7px; letter-spacing: -0.03em; }
    .obv-subtitle { font-size: 13px; line-height: 1.45; color: var(--obv-feedback-muted); margin-bottom: 14px; max-width: 36ch; }
    .obv-preview-note {
      margin: -2px 0 14px; border: 1px solid var(--obv-feedback-border); border-radius: 12px;
      background: var(--obv-feedback-bg-subtle); color: var(--obv-feedback-text); padding: 9px 10px; font-size: 12px; line-height: 1.4;
    }
    .obv-form-error {
      margin: -2px 0 12px; border: 1px solid rgba(220, 38, 38, 0.28); border-radius: 12px;
      background: rgba(220, 38, 38, 0.08); color: #b91c1c; padding: 9px 10px; font-size: 12px; line-height: 1.4;
    }
    .obv-textarea {
      width: 100%; border: 1px solid var(--obv-feedback-border); border-radius: 12px; padding: 10px 11px;
      font-size: 13px; background: transparent; color: var(--obv-feedback-text); box-sizing: border-box;
      box-shadow: var(--obv-feedback-shadow-sm);
      transition: border-color 140ms ease, box-shadow 140ms ease, background 140ms ease;
      min-height: 118px; resize: vertical; line-height: 1.45;
    }
    .obv-textarea::placeholder { color: var(--obv-feedback-muted); }
    .obv-attachment-dropzone {
      margin: 10px 0 0; padding: 10px; border: 1px dashed var(--obv-feedback-border-strong); border-radius: 12px;
      background: color-mix(in srgb, var(--obv-feedback-bg-subtle) 78%, transparent); color: var(--obv-feedback-muted); font-size: 12px; line-height: 1.4;
      cursor: pointer;
    }
    .obv-attachment-dropzone:focus-visible { outline: 3px solid var(--obv-feedback-focus); outline-offset: 2px; }
    .obv-attachment-prompt { display: inline-flex; align-items: center; gap: 7px; }
    .obv-attachment-input { display: none; }
    .obv-attachment-list { display: flex; flex-direction: column; gap: 7px; margin-top: 8px; }
    .obv-attachment-chip { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 8px 9px; border: 1px solid var(--obv-feedback-border); border-radius: 12px; background: var(--obv-feedback-bg); }
    .obv-attachment-chip[data-status="error"] { border-color: rgba(220, 38, 38, 0.38); }
    .obv-attachment-name { display: flex; align-items: center; gap: 7px; color: var(--obv-feedback-text); font-size: 12px; font-weight: 650; min-width: 0; }
    .obv-attachment-name-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .obv-attachment-meta { display: block; margin-top: 3px; color: var(--obv-feedback-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .obv-attachment-chip[data-status="error"] .obv-attachment-meta { color: #b91c1c; }
    .obv-attachment-remove { width: 28px; height: 28px; }
    .obv-element-picker-overlay {
      position: fixed; inset: 0; z-index: 2147483646; cursor: pointer; touch-action: none;
      background: rgba(0, 0, 0, 0.08);
    }
    .obv-element-picker-overlay:focus { outline: 3px solid var(--obv-feedback-focus); outline-offset: -6px; }
    .obv-element-grab-highlight {
      position: fixed; z-index: 2147483646; pointer-events: none; box-sizing: border-box;
      border: 2px solid #7c3aed; border-radius: 8px; background: rgba(196,181,253,0.14);
      box-shadow: 0 0 0 1px rgba(255,255,255,0.24);
    }
    .obv-element-grab-label {
      position: fixed; z-index: 2147483647; pointer-events: none; max-width: min(320px, calc(100vw - 24px));
      border: 1px solid var(--obv-feedback-border); border-radius: 999px; background: var(--obv-feedback-bg);
      color: var(--obv-feedback-text); padding: 6px 10px; box-shadow: var(--obv-feedback-shadow-sm);
      font-size: 12px; font-weight: 650; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .obv-ruler-overlay {
      position: fixed; inset: 0; z-index: 2147483646;
      cursor: crosshair; touch-action: none; background: rgba(0,0,0,0.04);
    }
    .obv-ruler-overlay:focus { outline: none; }
    .obv-ruler-svg { width: 100%; height: 100%; display: block; position: relative; z-index: 1; }
    .obv-ruler-snap-highlight {
      position: fixed; z-index: 0; pointer-events: none; box-sizing: border-box;
      border: 1.5px solid rgba(59,130,246,0.3); border-radius: 4px;
      background: rgba(59,130,246,0.05);
      transition: left 80ms ease, top 80ms ease, width 80ms ease, height 80ms ease;
    }
    .obv-ruler-snap-highlight[data-edge="top"] { border-top-width: 3px; border-top-color: #3b82f6; }
    .obv-ruler-snap-highlight[data-edge="bottom"] { border-bottom-width: 3px; border-bottom-color: #3b82f6; }
    .obv-ruler-snap-highlight[data-edge="left"] { border-left-width: 3px; border-left-color: #3b82f6; }
    .obv-ruler-snap-highlight[data-edge="right"] { border-right-width: 3px; border-right-color: #3b82f6; }
    .obv-element-picker-bar, .obv-measure-bar {
      position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 2147483647;
      display: flex; align-items: center; gap: 10px; padding: 7px 7px 7px 14px;
      border: 1px solid var(--obv-feedback-border); border-radius: 999px;
      background: var(--obv-feedback-bg); box-shadow: var(--obv-feedback-shadow); color: var(--obv-feedback-muted);
      font-size: 12px; font-weight: 650;
    }
    .obv-context-actions { display: flex; gap: 8px; margin: 10px 0 0; }
    .obv-context-actions .obv-button { flex: 1; }
    .obv-element-grab-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
    .obv-element-grab-chip {
      display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center;
      padding: 7px 9px; border: 1px solid var(--obv-feedback-border); border-radius: 12px;
      background: var(--obv-feedback-bg); font-size: 12px;
    }
    .obv-element-grab-chip-name {
      display: flex; align-items: center; gap: 7px;
      color: var(--obv-feedback-text); font-weight: 650;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
    }
    .obv-element-grab-chip-name .obv-icon { flex-shrink: 0; }
    .obv-element-grab-remove { width: 22px; height: 22px; min-height: 22px; padding: 0; }
    .obv-vs-palette { --obv-vs-accent: #3b82f6; --obv-vs-slider-track: color-mix(in srgb, var(--obv-feedback-border-strong) 58%, transparent); margin-top: 10px; padding: 10px 10px 6px; border-radius: 10px; background: var(--obv-feedback-bg-subtle); border: 1px solid color-mix(in srgb, var(--obv-feedback-border) 78%, #3b82f6 22%); display: flex; flex-direction: column; gap: 2px; }
    .obv-vs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; padding-bottom: 6px; border-bottom: 1px solid var(--obv-feedback-border); }
    .obv-vs-target { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: var(--obv-feedback-text); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .obv-vs-palette .obv-vs-close {
      width: 32px; min-width: 32px; height: 32px; min-height: 32px; padding: 0;
      flex-shrink: 0; border-radius: 8px; box-shadow: none;
    }
    .obv-vs-palette .obv-vs-close .obv-icon { width: 15px; height: 15px; }
    .obv-vs-scope {
      display: flex; align-items: center; gap: 4px; margin: 0 0 5px; padding: 2px;
      border: 1px solid var(--obv-feedback-border); border-radius: 8px;
      background: color-mix(in srgb, var(--obv-feedback-bg) 58%, transparent);
    }
    .obv-vs-scope { margin-bottom: 6px; }
    .obv-vs-scope .obv-vs-scope-button {
      flex: 1 1 0; min-height: 24px; padding: 3px 8px; border: 0; border-radius: 6px;
      background: transparent; color: var(--obv-feedback-muted); box-shadow: none;
      font-size: 11px; font-weight: 650;
    }
    .obv-vs-scope .obv-vs-scope-button:hover:not(:disabled) { transform: none; background: var(--obv-feedback-bg-subtle); color: var(--obv-feedback-text); }
    .obv-vs-scope .obv-vs-scope-button[aria-pressed="true"] {
      background: color-mix(in srgb, var(--obv-vs-accent) 22%, var(--obv-feedback-bg));
      color: var(--obv-feedback-text);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--obv-vs-accent) 64%, transparent), var(--obv-feedback-shadow-sm);
    }
    .obv-vs-row { display: flex; align-items: center; gap: 6px; padding: 4px 4px; border-radius: 5px; }
    .obv-vs-row:hover { background: color-mix(in srgb, var(--obv-feedback-bg-subtle) 82%, var(--obv-feedback-text) 8%); }
    .obv-vs-row-label { font-size: 11px; color: var(--obv-feedback-muted); width: 82px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .obv-vs-scrub { font-family: ui-monospace, monospace; font-size: 12px; color: var(--obv-feedback-text); cursor: ew-resize; user-select: none; -webkit-user-select: none; text-align: right; padding: 1px 4px; border-radius: 4px; background: transparent; min-width: 48px; white-space: nowrap; }
    .obv-vs-scrub[data-has-override="true"] { color: #3b82f6; font-weight: 600; background: transparent; }
    .obv-vs-scrub-input { font: inherit; font-family: ui-monospace, monospace; font-size: 12px; width: 72px; text-align: right; padding: 2px 5px; border: 1px solid #3b82f6; border-radius: 4px; background: var(--obv-feedback-bg-subtle); color: var(--obv-feedback-text); outline: none; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15); }
    .obv-vs-slider {
      appearance: none; -webkit-appearance: none;
      width: 100%; height: 18px; margin: -1px 0 0; padding: 0;
      cursor: pointer; border-radius: 999px; outline: none;
      background: linear-gradient(to right, var(--obv-vs-accent) 0%, var(--obv-vs-accent) var(--obv-vs-slider-percent, 0%), var(--obv-vs-slider-track) var(--obv-vs-slider-percent, 0%), var(--obv-vs-slider-track) 100%);
      background-size: 100% 3px; background-repeat: no-repeat; background-position: center;
    }
    .obv-vs-slider::-webkit-slider-runnable-track { height: 3px; border-radius: 999px; background: transparent; }
    .obv-vs-slider::-webkit-slider-thumb {
      appearance: none; -webkit-appearance: none;
      width: 13px; height: 13px; margin-top: -5px; border-radius: 999px;
      border: 2px solid var(--obv-feedback-bg-subtle); background: var(--obv-vs-accent);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22), 0 0 0 1px color-mix(in srgb, var(--obv-vs-accent) 42%, transparent);
    }
    .obv-vs-slider::-moz-range-track { height: 3px; border-radius: 999px; background: transparent; }
    .obv-vs-slider::-moz-range-progress { height: 3px; border-radius: 999px; background: var(--obv-vs-accent); }
    .obv-vs-slider::-moz-range-thumb {
      width: 9px; height: 9px; border-radius: 999px;
      border: 2px solid var(--obv-feedback-bg-subtle); background: var(--obv-vs-accent);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22), 0 0 0 1px color-mix(in srgb, var(--obv-vs-accent) 42%, transparent);
    }
    .obv-vs-slider:focus-visible::-webkit-slider-thumb { box-shadow: 0 0 0 3px var(--obv-feedback-focus), 0 1px 2px rgba(0, 0, 0, 0.22); }
    .obv-vs-slider:focus-visible::-moz-range-thumb { box-shadow: 0 0 0 3px var(--obv-feedback-focus), 0 1px 2px rgba(0, 0, 0, 0.22); }
    .obv-vs-numeric-group { display: flex; flex-direction: column; flex: 1 1 auto; gap: 1px; min-width: 0; }
    .obv-vs-numeric-top { display: flex; align-items: center; gap: 6px; }
    .obv-vs-swatch { width: 22px; height: 22px; padding: 0; border: 1.5px solid var(--obv-feedback-border-strong); border-radius: 5px; cursor: pointer; flex-shrink: 0; appearance: none; -webkit-appearance: none; background: transparent; }
    .obv-vs-swatch::-webkit-color-swatch-wrapper { padding: 1px; }
    .obv-vs-swatch::-webkit-color-swatch { border: none; border-radius: 3px; }
    .obv-vs-swatch::-moz-color-swatch { border: none; border-radius: 3px; }
    .obv-vs-palette .obv-vs-revert {
      width: 28px; min-width: 28px; height: 28px; min-height: 28px; padding: 0;
      font-size: 13px; flex-shrink: 0; visibility: hidden; box-shadow: none; opacity: 0.5; border-radius: 8px;
    }
    .obv-vs-revert:hover { opacity: 1; }
    .obv-vs-row[data-has-override="true"] .obv-vs-revert { visibility: visible; }
    .obv-row-pill-vs { background: color-mix(in srgb, var(--obv-feedback-bg-subtle) 72%, #3b82f6 28%); color: var(--obv-feedback-text); }
    .obv-row-pill-vs .obv-row-pill-label { color: var(--obv-feedback-text); }
    .obv-unified-panel { display: flex; flex-direction: column; gap: 0; position: relative; }
    .obv-card-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
    .obv-card-header .obv-kicker { margin-bottom: 0; }
    .obv-icon-button.obv-card-close { position: relative; width: 26px; height: 26px; }
    .obv-card-close .obv-icon { width: 12px; height: 12px; }
    .obv-icon-button.obv-card-close:hover:not(:disabled) { transform: none; }
    .obv-card-close::after {
      content: attr(data-tooltip); pointer-events: none;
      position: absolute; top: calc(100% + 6px); right: 0;
      padding: 4px 8px; border-radius: 6px;
      background: var(--obv-feedback-primary); color: var(--obv-feedback-primary-foreground);
      font-size: 11px; font-weight: 500; white-space: nowrap;
      opacity: 0; transition: opacity 100ms ease;
    }
    .obv-card-close:hover::after { opacity: 1; }
    .obv-shortcut-hint { color: var(--obv-feedback-muted); font-size: 10px; font-weight: 500; letter-spacing: 0; text-transform: none; opacity: 0.7; margin-left: 6px; }
    .obv-list-body { padding: 2px 0; min-height: 40px; }
    .obv-list-row { display: flex; align-items: baseline; gap: 0; padding: 3px 0; }
    .obv-row-number {
      width: 22px; flex-shrink: 0; text-align: left; padding-right: 8px;
      color: var(--obv-feedback-muted); font-size: 12px; font-weight: 600;
      font-variant-numeric: tabular-nums; user-select: none;
      transition: color 120ms ease;
    }
    .obv-list-row:focus-within .obv-row-number { color: var(--obv-feedback-text); }
    .obv-row-input {
      flex: 1; min-width: 0; border: none; outline: none; padding: 2px 0;
      background: transparent; color: var(--obv-feedback-text);
      font-family: inherit; font-size: 13px; line-height: 1.5;
    }
    .obv-row-input::placeholder { color: var(--obv-feedback-muted); opacity: 0.6; }
    .obv-row-meta {
      padding-left: 30px; color: var(--obv-feedback-muted); font-size: 11px; line-height: 1.3;
      display: flex; flex-wrap: wrap; gap: 4px; padding-bottom: 2px;
    }
    .obv-row-meta-tag { display: inline-flex; align-items: center; gap: 2px; }
    .obv-row-meta-tag .obv-icon { width: 10px; height: 10px; flex-basis: 10px; }
    .obv-row-pill {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 1px 4px 1px 5px; border-radius: 6px;
      background: var(--obv-feedback-bg-subtle); color: var(--obv-feedback-muted);
      font-size: 11px; line-height: 1.3; white-space: nowrap; max-width: 140px;
    }
    .obv-row-pill-action { cursor: pointer; }
    .obv-row-pill-action:hover { background: var(--obv-feedback-border); }
    .obv-row-pill .obv-icon { width: 10px; height: 10px; flex-basis: 10px; flex-shrink: 0; }
    .obv-row-pill-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .obv-row-pill-x {
      display: inline-flex; align-items: center; justify-content: center;
      width: 14px; height: 14px; padding: 0; flex-shrink: 0;
      border: none; border-radius: 4px; background: transparent; color: var(--obv-feedback-muted);
      cursor: pointer; transition: color 100ms ease, background 100ms ease;
    }
    .obv-row-pill-x:hover { color: var(--obv-feedback-text); background: var(--obv-feedback-border); }
    .obv-row-pill-x .obv-icon { width: 8px; height: 8px; flex-basis: 8px; }
    .obv-list-footer {
      display: flex; align-items: center; justify-content: space-between;
      gap: 8px; padding-top: 6px; margin-top: 2px;
    }
    .obv-footer-tools { display: flex; gap: 2px; }
    .obv-footer-tool-btn {
      width: 32px; height: 32px; min-height: 32px; padding: 0; border-radius: 8px;
      border-color: var(--obv-feedback-border); background: transparent; color: var(--obv-feedback-muted);
      box-shadow: none;
      transition: color 120ms ease, background 120ms ease;
    }
    .obv-footer-tool-btn:hover:not(:disabled) { background: var(--obv-feedback-bg-subtle); color: var(--obv-feedback-text); }
    .obv-footer-tool-btn .obv-icon { width: 14px; height: 14px; }
    .obv-success {
      padding: 12px 0 4px; text-align: center;
    }
    .obv-success-message {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      color: var(--obv-feedback-text); font-size: 13px; font-weight: 600; line-height: 1.4;
      width: 100%;
    }
    .obv-success-message .obv-icon { width: 16px; height: 16px; flex-shrink: 0; }
    .obv-success-sub {
      margin-top: 4px; color: var(--obv-feedback-muted); font-size: 12px; line-height: 1.4;
    }
    .obv-success-sub a {
      color: var(--obv-feedback-text); font-weight: 600; text-decoration: none;
    }
    .obv-success-sub a:hover { text-decoration: underline; }
    .obv-success-action {
      margin-top: 12px;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
    }
    .obv-success-action .obv-shortcut-hint { margin-left: 0; }
    .obv-footer-tool-btn { position: relative; }
    .obv-footer-tool-btn::after {
      content: attr(data-tooltip); pointer-events: none;
      position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
      padding: 4px 8px; border-radius: 6px;
      background: var(--obv-feedback-primary); color: var(--obv-feedback-primary-foreground);
      font-size: 11px; font-weight: 500; white-space: nowrap;
      opacity: 0; transition: opacity 100ms ease;
    }
    .obv-footer-tool-btn:first-of-type::after { left: 0; transform: none; }
    .obv-footer-tool-btn:last-of-type::after { left: auto; right: 0; transform: none; }
    .obv-footer-tool-btn:hover::after { opacity: 1; }
    .obv-actions { display: flex; justify-content: space-between; gap: 8px; }
    .obv-button, .obv-icon-button {
      border: 1px solid transparent; border-radius: var(--obv-feedback-radius); box-sizing: border-box;
      display: inline-flex; align-items: center; justify-content: center; gap: 7px;
      cursor: pointer; background: var(--obv-feedback-primary); color: var(--obv-feedback-primary-foreground);
      font-size: var(--obv-feedback-button-font-size); font-weight: var(--obv-feedback-button-font-weight); line-height: var(--obv-feedback-button-line-height); letter-spacing: normal;
      box-shadow: var(--obv-feedback-shadow-sm);
      transition: opacity 140ms ease, transform 140ms ease, box-shadow 140ms ease, background 140ms ease, color 140ms ease, border-color 140ms ease;
    }
    .obv-button { padding: 8px 12px; min-height: 34px; }
    .obv-icon-button { padding: 0; width: 34px; height: 34px; aspect-ratio: 1; flex-shrink: 0; border-color: var(--obv-feedback-border); background: transparent; color: var(--obv-feedback-muted); }
    .obv-button:hover:not(:disabled), .obv-icon-button:hover:not(:disabled) { transform: translateY(-1px); border-color: var(--obv-feedback-border-strong); }
    .obv-button-secondary { background: var(--obv-feedback-bg); color: var(--obv-feedback-text); border-color: var(--obv-feedback-border); }
    .obv-button-secondary:hover:not(:disabled), .obv-icon-button:hover:not(:disabled) { background: var(--obv-feedback-bg-subtle); color: var(--obv-feedback-text); }
    .obv-button:active:not(:disabled), .obv-icon-button:active:not(:disabled) { transform: translateY(0); }
    .obv-button:disabled, .obv-icon-button:disabled { cursor: not-allowed; opacity: 0.5; }
    .obv-toolbar-button { width: 34px; height: 34px; border-radius: 999px; }
    .obv-status { font-size: 13px; line-height: 1.5; color: var(--obv-feedback-muted); }
    .obv-status-title { display: flex; align-items: center; gap: 8px; }
    @media (prefers-reduced-motion: reduce) {
      .obv-trigger, .obv-button, .obv-icon-button { transition-duration: 1ms; }
    }
    :host([data-theme="dark"]) {
      color-scheme: dark;
      --obv-feedback-bg: #1f1f1f;
      --obv-feedback-bg-subtle: #2b2b2b;
      --obv-feedback-trigger-bg: #1f1f1f;
      --obv-feedback-text: #ffffff;
      --obv-feedback-muted: #a1a1aa;
      --obv-feedback-border: rgba(255, 255, 255, 0.14);
      --obv-feedback-border-strong: rgba(255, 255, 255, 0.32);
      --obv-feedback-primary: #ffffff;
      --obv-feedback-primary-foreground: #111111;
      --obv-feedback-shadow: 0 18px 46px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.26);
    }
    :host([data-theme="dark"]) .obv-form-error { background: rgba(248, 113, 113, 0.12); border-color: rgba(248, 113, 113, 0.28); color: #fecaca; }
    :host([data-theme="dark"]) .obv-vs-palette { --obv-vs-accent: #60a5fa; --obv-vs-slider-track: rgba(255, 255, 255, 0.26); background: #242424; border-color: rgba(255, 255, 255, 0.16); }
    :host([data-theme="dark"]) .obv-vs-row:hover { background: rgba(255, 255, 255, 0.05); }
    :host([data-theme="dark"]) .obv-vs-scrub[data-has-override="true"] { color: #93c5fd; }
  `;
}

