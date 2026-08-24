---
name: local-dev
description: Bring FlatFilers/obvious-feedback-sdk to a working local dev environment and verify it end-to-end
---

# Local dev onboarding — obvious-feedback-sdk

Recorded 2026-08-21 by the Autobuild onboarding run; re-validated end-to-end
2026-08-24. Everything below was executed and verified green in sandbox snapshot
`09yz0ucu7nodytlf0v8s:default`.

## What this repo needs

Browser SDK library — no services, no DB, no Docker, no env vars. Toolchain:
Bun (runtime + package manager + unit test runner), tsup (build), Playwright chromium
(e2e), happy-dom (unit-test DOM).

## Bring-up steps

1. **Deps**: `bun install --frozen-lockfile`. In the sandbox `node_modules/` is
   preinstalled and root-owned. If `bun install` prints `EEXIST` / `PathAlreadyExists`
   errors, the install is still complete — sanity-check with
   `./node_modules/.bin/tsc --version`. Do NOT `rm -rf node_modules` (permission
   denied, and unnecessary).
2. **Build**: `bun run build` → `dist/index.js`, `dist/index.global.js`, `dist/index.d.ts`.
3. **Typecheck**: `bun run test:typecheck`.
4. **Unit tests**: `bun run test` → 142 tests expected, all passing.
5. **E2E first-time setup**: `bunx playwright install chromium --with-deps`
   (downloads chromium + system libs in one step; ~112 MiB).
6. **E2E**: `bun run test:e2e` → 13 passed, 1 skipped (live spec needs
   `FEEDBACK_API_BASE_URL` + `FEEDBACK_PUBLIC_KEY`). Playwright auto-starts the mock
   API on :4444 and the vanilla host on :5555.

## Verify the primary flow manually (evidence pattern)

Start the two servers, then drive the widget in chromium and screenshot each step:

```bash
nohup bun tests/e2e/server/mock-feedback-api.ts >/tmp/mock.log 2>&1 &
nohup python3 -m http.server 5555 --directory tests/e2e/fixtures/vanilla-host >/tmp/host.log 2>&1 &
```

Playwright script outline (selectors verified in this run):
goto `http://localhost:5555` → wait for `#status` = "SDK initialized successfully." →
click `[data-toolbar-action="comment"]` → click `#card-title` (or `#visual-target`) →
fill `.obv-pin-popover textarea` → click `[data-pin-action="close"]` → click
`[data-toolbar-action="send"]` → wait for `.obv-toolbar-sent` → assert via
`GET http://localhost:4444/_test/last-submission` (check `items[0].description` and
`elementGrabs[0].cssSelector`).

Gotchas:
- Kill leftover servers with bracket patterns (`pkill -f "[h]ttp.server 5555"`) —
  a plain pattern matches your own shell's command line and kills it.
- The vanilla fixture loads `/dist/index.global.js` through a git-tracked symlink —
  always `bun run build` before e2e.
- Calling `widget.open()` before clicking toolbar actions can leave the toolbar
  unclickable; follow the spec order (toolbar actions work straight after page load).

## Quick health check

```bash
bun run build && bun run test:typecheck && bun run test
```

Green = healthy. For full confidence also run `bun run test:e2e`.
