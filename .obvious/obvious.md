# Obvious Agent Guide — FlatFilers/obvious-feedback-sdk

Embeddable browser feedback widget SDK (`@obvi/feedback-sdk`, v1.5.0). Host apps load it
(npm ESM or CDN IIFE) to collect user feedback that is routed to Obvious for triage.
This is a library repo: no server, no database, no Docker. The "app" is the SDK itself,
verified in a browser host page against a local mock API.

## Stack

| Layer | Tool |
| --- | --- |
| Language | TypeScript 5.x, strict, target ES2020 |
| Runtime / package manager | Bun 1.3.x (`bun.lock`, `bunfig.toml`) |
| Bundler | tsup 6.7 → `dist/index.js` (ESM), `dist/index.global.js` (IIFE, global `ObviousFeedback`), `dist/index.d.ts` |
| Unit tests | `bun test` + happy-dom (preload `src/test-preload.ts`) |
| E2E tests | Playwright (chromium only); mock API + static host auto-started by config |
| CI | GitHub Actions `ci.yml`: build → typecheck → unit → e2e |

## Commands

```bash
bun install                # deps (see gotcha below if EEXIST errors appear)
bun run build              # tsup → dist/
bun run test:typecheck     # tsc --noEmit
bun run test               # unit tests (tests/unit/)
bun run test:e2e           # Playwright e2e (chromium)
bun run test:all           # typecheck + unit + build + e2e
bun run dev                # tsup --watch
```

First-time e2e setup in a fresh sandbox:

```bash
bunx playwright install chromium --with-deps
```

E2E auto-starts two local servers (playwright.config.ts `webServer`):
- Mock feedback API — `http://localhost:4444` (`bun tests/e2e/server/mock-feedback-api.ts`)
- Vanilla host page — `http://localhost:5555` (python3 http.server serving
  `tests/e2e/fixtures/vanilla-host`, loads `dist/index.global.js` via git-tracked symlink)

## Environment

No env vars required for local dev. Optional:
- `FEEDBACK_API_BASE_URL`, `FEEDBACK_PUBLIC_KEY` — enable the live Obvious smoke spec
  (`bun run test:e2e:live`); without them the spec self-skips.

## Codebase map

See `.obvious/codebase-map.md`.

## Local Verification Summary

Validated 2026-08-21, re-validated end-to-end 2026-08-24 (bun 1.3.14, node v20.20.2):

| Check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | PASS — 98 installs, no changes |
| `bun run build` | PASS — ESM 146.7 KB, IIFE 155.1 KB, d.ts 11.7 KB |
| `bun run test:typecheck` | PASS — 0 errors |
| `bun run test` (unit) | PASS — 142 pass / 0 fail across 14 files |
| `bun run test:e2e` | PASS — 13 passed, 1 skipped (live spec, needs real credentials) |
| Primary user flow (browser) | PASS — see below |

### Primary flow evidence

Playwright (chromium headless) drove the vanilla host (localhost:5555) loading the built
IIFE bundle: SDK initialized (`#status` = "SDK initialized successfully."), the toolbar
comment action entered annotation mode, a pin comment was placed on `#card-title`, and
the send action submitted a feedback round to the mock API (localhost:4444).
`GET /_test/last-submission` returned the submitted payload — description,
`elementGrabs[0].cssSelector` = `#card-title`, `sdkVersion` = `1.5.0`. The sent toolbar
(`.obv-toolbar-sent`) and "View Progress" CTA rendered. Browser console: zero errors.
Five screenshots captured (page loaded, annotation mode, pin popover, pin created,
feedback sent).

## Sandbox snapshot

- Snapshot / template ID: `09yz0ucu7nodytlf0v8s:default`
- Captured: 2026-08-24T21:14:27Z (supersedes `2b6jzw5bjre4tqoeqzvx:default` from 2026-08-21)
- State baked in: dependencies installed, `dist/` built, chromium + system libs installed,
  all suites green.

## Notes & gotchas

- `node_modules/` in the sandbox is root-owned and read-only. `bun install` may print
  `EEXIST` / `PathAlreadyExists` errors on some sandbox states, but the dependency set is
  complete and all binaries work. Do not `rm -rf node_modules` (permission denied, and
  unnecessary).
- `tests/e2e/fixtures/vanilla-host/dist` is a git-tracked symlink to the repo `dist/` —
  always `bun run build` before running e2e.
- Kill leftover dev servers with bracket patterns (`pkill -f "[h]ttp.server 5555"`) —
  a plain pattern can match your own shell's command line.
- Release flow: npm trusted publisher via `release.yml` (see file header for setup).
  `MONOREPO_MIGRATION.md` documents switching the Obvious monorepo to the published package.
- Manual QA harness: `examples/vanilla/index.html`.
