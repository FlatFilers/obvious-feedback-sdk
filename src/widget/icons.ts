export function createIcon(
  name:
    | "arrow-up-right"
    | "check"
    | "close"
    | "comment"
    | "github"
    | "grip"
    | "send"
    | "sparkle"
    | "thread",
): string {
  const paths: Record<typeof name, string> = {
    "arrow-up-right":
      '<path d="M7 17 17 7" /><path d="M8 7h9v9" />',
    check: '<path d="m5 12 4 4L19 6" />',
    close: '<path d="M6 6l12 12" /><path d="M18 6 6 18" />',
    comment:
      '<path d="M21 11.5a8.4 8.4 0 0 1-1.4 4.7 8.5 8.5 0 0 1-7.1 3.8c-1.4 0-2.7-.3-4-.9L3 21l2-4.6a8.5 8.5 0 0 1 9-12c4.5.4 8 4.2 7 8.1Z" />',
    github:
      '<path d="M9 19c-4.5 1.4-4.5-2.5-6-3" /><path d="M15 21v-3.5a3.4 3.4 0 0 0-.9-2.6c3 0 6-2 6-5.5a4.4 4.4 0 0 0-1.1-3.1 4 4 0 0 0-.1-3s-1.1-.3-3.5 1.3a12 12 0 0 0-6.4 0C6.6 1.9 5.5 2.2 5.5 2.2a4 4 0 0 0-.1 3 4.4 4.4 0 0 0-1.1 3.1c0 3.4 3 5.5 6 5.5a3.4 3.4 0 0 0-.9 2.5V21" />',
    grip:
      '<circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" /><circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" /><circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />',
    send: '<path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="m22 2-11 11" />',
    sparkle:
      '<path d="M12 3v3" /><path d="M12 18v3" /><path d="M3 12h3" /><path d="M18 12h3" /><path d="m5.6 5.6 2.1 2.1" /><path d="m16.3 16.3 2.1 2.1" /><path d="m5.6 18.4 2.1-2.1" /><path d="m16.3 7.7 2.1-2.1" />',
    thread:
      '<path d="M21 15a4 4 0 0 1-4 4H8l-4 3V6a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4Z" /><path d="M8 9h9" /><path d="M8 13h6" />',
  };
  return `<svg class="obv-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}
