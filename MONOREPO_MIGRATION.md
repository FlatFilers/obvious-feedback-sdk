# Monorepo Migration Guide

After validating the published SDK package externally, follow these steps to switch the Obvious monorepo from the workspace package to the published npm package `@obvi/feedback-sdk`.

## Prerequisites

- The package is published to npm as `@obvi/feedback-sdk@1.0.x` or later
- At least one external example app has been validated against it

## Steps

### 1. Remove the workspace package

```bash
rm -rf packages/feedback-sdk
```

### 2. Install the published package in the dashboard

```bash
cd dashboard
bun add @obvi/feedback-sdk
```

### 3. Update the dashboard import

In `dashboard/src/features/feedback-sdk-integration/feedback-sdk-integration.tsx`, change:

```typescript
import { type FeedbackSdkConfig, type FeedbackSdkHandle, ObviousFeedback } from '@obvious/feedback-sdk'
```

to:

```typescript
import { type FeedbackSdkConfig, type FeedbackSdkHandle, ObviousFeedback } from '@obvi/feedback-sdk'
```

### 4. Update any other imports

Search the monorepo for `@obvious/feedback-sdk` and update to the published package name:

```bash
rg '@obvious/feedback-sdk' --files-with-matches
```

Files that may need updating:
- `dashboard/package.json` (remove `"@obvious/feedback-sdk": "workspace:*"`, add `"@obvi/feedback-sdk": "^1.0.0"`)
- `dashboard/src/features/feedback-sdk-integration/feedback-sdk-integration.tsx`
- `dashboard/src/features/feedback-sdk-integration/feedback-sdk-integration.test.tsx`

### 5. Clean up monorepo references

- Remove `packages/feedback-sdk` from any Turborepo pipeline config
- Remove `examples/feedback-sdk-host/` (now lives in the SDK repo)
- Update any CI/deploy scripts that reference the old workspace package

### 6. Verify

```bash
bun install
bun obvious typecheck --changed
bun obvious test --changed
```
