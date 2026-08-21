# Codebase Map — FlatFilers/obvious-feedback-sdk

Folder-level overview (depth ≤ 2). Public entry point: `src/index.ts` → `ObviousFeedback.init()`.

| Path | Purpose |
| --- | --- |
| `src/` | SDK source (TypeScript). |
| `src/index.ts` | Public entry — exports `ObviousFeedback` (`init()`) and public types. |
| `src/public-types.ts` | Public config / handle / payload types. |
| `src/constants.ts`, `src/version.ts` | Defaults (API base URL, limits) and SDK version string. |
| `src/widget/` | Widget implementation: `ObviousFeedbackWidget.ts` (main widget), `feedback-toolbar.ts`, `transport.ts` (API client), `styles.ts`, `annotation-mode.ts`, `pin-overlay.ts`, `element-grab.ts`, `visual-suggestions.ts`, `tweak-control-planner.ts`, `design-token-inference.ts`, `draggable.ts`, `feedback-normalizers.ts`, `icons.ts`, `obvious-token-manifest.ts`. |
| `src/browser/` | Host-page capture: `log-capture.ts` (console log recording). |
| `src/utils/` | `html.ts` (DOM snapshot + redaction), `url.ts`. |
| `src/test-preload.ts` | happy-dom global registrator preload for bun unit tests. |
| `tests/unit/` | 14 bun test files (happy-dom): init, transport, submit payload, package contract, toolbar, annotations, visual suggestions, token manifest, etc. |
| `tests/e2e/` | Playwright e2e: `playwright.config.ts`, `specs/` (mock submit flow, theme visibility, vanilla IIFE, inline pin annotations, live Obvious smoke), `server/mock-feedback-api.ts` (port 4444), `fixtures/vanilla-host/` (port 5555, loads dist via symlink), `fixtures/react-vite-host/`. |
| `tests/manual/` | Manual QA checklist (cursor / browser checks). |
| `examples/vanilla/` | Local QA harness page for manual testing. |
| `.github/workflows/` | `ci.yml` (build, typecheck, unit, e2e), `release.yml` (npm trusted-publisher publish). |
| Root | `package.json`, `tsconfig.json`, `tsup.config.ts`, `bunfig.toml`, `README.md` (full usage docs), `MONOREPO_MIGRATION.md`, `LICENSE` (MIT). |
