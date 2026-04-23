# Cursor Browser Verification Checklist

Use the Cursor IDE browser (or any Chromium-based browser) to manually verify the SDK end-to-end after automated tests pass.

## Prerequisites

- SDK built locally (`bun run build`)
- A real Feedback SDK key with `localhost` in allowed domains
- The Obvious API running (local or production)

## Checklist

### 1. Script-tag release asset path

- [ ] Open a plain HTML page that loads `<script src="https://github.com/FlatFilers/obvious-feedback-sdk/releases/download/v0.1.0/index.global.js" data-pub-key="fsk_pub_...">`
- [ ] Verify the widget trigger appears (bottom-right by default)
- [ ] Verify no console errors

### 2. Widget render and interaction

- [ ] Click the trigger button — feedback card opens
- [ ] Press Cmd/Ctrl+Shift+. — feedback card opens via keyboard shortcut
- [ ] Type a description and verify text input works
- [ ] Close the card and reopen — draft text is preserved

### 3. Submit flow (real backend)

- [ ] Submit a feedback item with a description
- [ ] Verify the submission succeeds (no error shown)
- [ ] Verify the issue appears in the Obvious workspace under Autobuild
- [ ] Verify status polling shows the issue status in the widget

### 4. Identity verification

- [ ] Submit with a valid `identityToken` — verify identity appears as "verified" in Obvious
- [ ] Submit without an identity token — verify it is accepted but marked "unverified"
- [ ] Submit with an invalid/expired token — verify it degrades to unverified (no error)

### 5. Attachments

- [ ] Drag and drop an image file onto the widget dropzone
- [ ] Verify the attachment chip appears with filename and upload progress
- [ ] Submit with the attachment and verify it arrives in Obvious

### 6. Theme visibility

- [ ] Set theme to `light` — verify trigger is visible on a white page
- [ ] Set theme to `dark` — verify trigger is visible on a dark page
- [ ] Set theme to `system` with macOS in light mode — verify light appearance
- [ ] Set theme to `system` with macOS in dark mode — verify dark appearance
- [ ] Set theme to `system` on a light-only host page with macOS dark mode — verify the trigger is still visible (this is the known edge case)

### 7. CSS isolation

- [ ] Load the widget on a page with Tailwind CSS — verify no style bleeding
- [ ] Load the widget on a page with aggressive CSS resets — verify widget looks correct
- [ ] Verify `--obv-feedback-*` CSS custom property overrides work

### 8. Domain restrictions

- [ ] Load the widget from an allowed domain — verify submissions succeed
- [ ] Load the widget from a non-allowed domain — verify submissions are rejected with 403

### 9. Cross-browser spot checks

- [ ] Chrome — full verification above
- [ ] Safari — trigger renders, card opens, submit works
- [ ] Firefox — trigger renders, card opens, submit works

## When to run

- Before any public release
- After significant widget UI or theming changes
- After changes to the IIFE build or packaging
- When investigating customer-reported visibility or rendering issues
