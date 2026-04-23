# Obvious Feedback SDK

Embeddable browser widget that lets users submit feedback from any web app. Feedback is routed to [Obvious](https://obvious.ai) where it is triaged, tracked, and optionally auto-fixed by Autobuild.

## Install

### npm / yarn / pnpm / bun

```bash
npm install obvious-feedback-sdk
```

### Script tag (CDN)

```html
<script
  src="https://cdn.jsdelivr.net/npm/obvious-feedback-sdk@latest/dist/index.global.js"
  data-pub-key="fsk_pub_..."
></script>
```

The script auto-initializes the widget when `data-pub-key` is present.

## Quick start

### ES module

```js
import { ObviousFeedback } from 'obvious-feedback-sdk'

const widget = ObviousFeedback.init({
  publicKey: 'fsk_pub_...',
})

// Later: widget.destroy()
```

### Script tag with options

```html
<script
  src="https://cdn.jsdelivr.net/npm/obvious-feedback-sdk@latest/dist/index.global.js"
  data-pub-key="fsk_pub_..."
  data-theme="dark"
  data-env="staging"
></script>
```

## Configuration

Pass options to `ObviousFeedback.init()` or use `data-*` attributes on the script tag.

| Option | `data-*` attribute | Type | Default | Description |
|---|---|---|---|---|
| `publicKey` | `data-pub-key` | `string` | — | **Required.** Your workspace feedback key. |
| `apiBaseUrl` | `data-api-base-url` | `string` | `https://app.obvious.ai` | Base URL for the Obvious API. |
| `identityToken` | `data-identity-token` | `string` | — | Signed JWT for verified identity (see below). |
| `env` | `data-env` | `string` | `production` | Environment label attached to submissions. |
| `prNumber` | `data-pr-number` | `number` | — | PR number for preview environment routing. |
| `theme` | `data-theme` | `'light' \| 'dark' \| 'system'` | `light` | Widget color scheme. |
| `triggerLabel` | `data-trigger-label` | `string` | `Open feedback` | Tooltip text on the trigger button. |
| `assistantPosition` | — | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | `bottom-right` | Corner for the floating trigger. |
| `redactSelectors` | — | `string[]` | `[]` | CSS selectors for elements to redact from DOM snapshots. |
| `captureConsole` | — | `boolean` | `false` | Include recent console logs with submissions. |
| `captureNetwork` | — | `boolean` | `false` | Include recent network requests with submissions. |
| `sessionReplayUrlResolver` | — | `() => string \| null` | — | Returns a session replay URL (e.g. FullStory, LogRocket). |
| `previewOnly` | — | `boolean` | `false` | Show the widget in read-only mode without submitting. |

## Setup

### 1. Create a feedback key

In your Obvious workspace, go to **Autobuild > Settings** and create a Feedback SDK key. You'll get:

- A **public key** (`fsk_pub_...`) — used in the browser SDK.
- A **private key** (`fsk_secret_...`) — used server-side to sign identity tokens. Store it securely; it is only shown once.

Configure **allowed domains** to restrict which origins can submit feedback with this key.

### 2. (Optional) Verify user identity

To attach verified user information to feedback submissions, sign an identity token on your server using the private key:

```js
import { SignJWT } from 'jose'

const identityToken = await new SignJWT({
  identity: { email: user.email, name: user.name },
})
  .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
  .setSubject('fsk_pub_...')
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(new TextEncoder().encode('fsk_secret_...'))
```

Pass the resulting token as `identityToken` in the SDK config. If the token is missing or invalid, feedback is still accepted but marked as unverified.

## Theming

The widget uses Shadow DOM and does not inherit host-page styles. Control appearance with:

### Theme presets

```js
ObviousFeedback.init({
  publicKey: 'fsk_pub_...',
  theme: 'dark', // 'light' (default) | 'dark' | 'system'
})
```

- **`light`** — Always light. Safe for light-only host pages.
- **`dark`** — Always dark.
- **`system`** — Follows the browser `prefers-color-scheme` media query. Only use when the host page also follows system preference, otherwise the widget may be invisible against the background.

### CSS custom properties

Override individual tokens on `:root` or the widget host element:

```css
:root {
  --obv-feedback-bg: #fafafa;
  --obv-feedback-primary: #0066ff;
  --obv-feedback-text: #1a1a1a;
  --obv-feedback-border: rgba(0, 0, 0, 0.1);
}
```

Available tokens: `--obv-feedback-bg`, `--obv-feedback-bg-subtle`, `--obv-feedback-trigger-bg`, `--obv-feedback-text`, `--obv-feedback-muted`, `--obv-feedback-border`, `--obv-feedback-border-strong`, `--obv-feedback-primary`, `--obv-feedback-primary-foreground`, `--obv-feedback-radius`, `--obv-feedback-radius-card`.

## API

### `ObviousFeedback.init(config): FeedbackSdkHandle`

Initialize the widget. Only one instance can be active at a time; calling `init` again destroys the previous instance.

Returns a handle with:

| Method | Description |
|---|---|
| `destroy()` | Remove the widget from the page. |
| `open()` | Programmatically open the feedback card. |
| `getOpenIssueCount()` | Number of non-terminal issues submitted in this session. |
| `subscribeToOpenIssueCount(listener)` | Subscribe to open issue count changes. Returns an unsubscribe function. |

## Keyboard shortcut

Press **Cmd/Ctrl + Shift + .** to open the feedback card when the widget is active.

## Attachments

Users can attach files (up to 25 MB each, 10 per submission) via drag-and-drop or the file picker in the widget. Attachments are uploaded directly to secure storage via pre-signed URLs.

## Status polling

The widget tracks submitted issues and shows their current status (received, in progress, resolved, etc.) in the feedback card. Status is refreshed automatically when the card is opened.

## Browser support

The SDK targets ES2020 and uses Shadow DOM, `ResizeObserver`, and `crypto.randomUUID` (with fallback). It works in all modern browsers (Chrome, Firefox, Safari, Edge).

## Troubleshooting

### Widget is invisible

If the widget trigger blends into the page background:
- Check the `theme` setting. If your page is light-only, use `theme: 'light'` (the default), not `'system'`.
- On macOS with auto light/dark mode, `theme: 'system'` will switch the widget to dark when the OS is in dark mode, even if the host page stays light.

### Content Security Policy (CSP)

The widget injects inline styles via Shadow DOM. If your CSP blocks inline styles, add `'unsafe-inline'` to `style-src`, or use a nonce-based policy.

### Submissions rejected with 403

The feedback key's **allowed domains** must include the hostname where the SDK runs. Check your key configuration in Obvious.

## License

MIT
