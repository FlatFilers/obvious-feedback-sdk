export function createIcon(
  name:
    | "arrow"
    | "check"
    | "close"
    | "compose"
    | "dial"
    | "element"
    | "paperclip"
    | "pen"
    | "plus"
    | "point"
    | "rectangle"
    | "ruler"
    | "status"
    | "trash"
    | "undo",
): string {
  const paths: Record<typeof name, string> = {
    arrow: '<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />',
    check: '<path d="m5 12 4 4L19 6" />',
    close: '<path d="M6 6l12 12" /><path d="M18 6 6 18" />',
    compose:
      '<path d="M12 20h9" /><path d="m16.5 3.5 4 4L8 20l-5 1 1-5L16.5 3.5Z" />',
    dial: '<circle cx="12" cy="12" r="8" /><path d="M12 4v4" /><path d="m14.5 10.5 2.5-2.5" />',
    element:
      '<path d="M12 3v4" /><path d="M12 17v4" /><path d="M3 12h4" /><path d="M17 12h4" /><rect x="7" y="7" width="10" height="10" rx="2" />',
    paperclip:
      '<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.9-8.9a4 4 0 0 1 5.7 5.7l-8.9 8.9a2 2 0 1 1-2.8-2.8l8.5-8.5" />',
    pen: '<path d="m4 20 5.5-1.5L20 8l-4-4L5.5 14.5 4 20Z" /><path d="m14 6 4 4" />',
    plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
    point:
      '<path d="M5 19 19 5" /><path d="M9 5h10v10" /><circle cx="7" cy="17" r="2" />',
    rectangle: '<rect x="5" y="6" width="14" height="12" rx="2" />',
    ruler:
      '<rect x="3" y="8" width="18" height="8" rx="1" /><path d="M6 8v3" /><path d="M9 8v5" /><path d="M12 8v3" /><path d="M15 8v5" /><path d="M18 8v3" />',
    status: '<circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" />',
    trash:
      '<path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" />',
    undo: '<path d="M9 7H4v5" /><path d="M4 12a8 8 0 1 0 2.3-5.7L4 8.6" />',
  };
  return `<svg class="obv-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

