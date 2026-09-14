import { test, expect } from '@playwright/test'

/**
 * Real-browser witness for the dock-click guard (PR #22 retrospective, F3).
 *
 * The original unit regression dispatched events directly on a snooze menu
 * item — a synthetic path that skips the real interaction chain (hover the
 * peek sliver, right-click, native click). This spec runs the built IIFE
 * bundle in real Chromium and replays that chain end to end.
 *
 * Mechanism under test: the dock and the menu share the widget's shadow
 * root, so nothing retargets the click between them — `handleDockClick` is
 * a capture-phase listener on the dock, an ancestor of the menu, and
 * therefore sees every menu click before the menu's own listener runs.
 * Without the `composedPath()` guard the item (not a
 * `[data-toolbar-action]`) fell through to the undock branch: the click was
 * swallowed, `revealFully()` undocked the bar, and the wipe persisted
 * `toolbarVisible: "true"` — every assertion below fails. Proven in this
 * PR: reverting the guard makes this spec fail.
 */
test.describe('Snooze menu in docked state (real-browser witness)', () => {
  test.beforeEach(async ({ page }) => {
    // Seed before any page script runs: the widget reads the standing
    // preference at construction, so the bar mounts docked and user-hidden.
    await page.addInitScript(() => {
      window.localStorage.setItem(
        `obvious.feedback.toolbarVisible:${window.location.origin}`,
        'false',
      )
    })
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#status')).toHaveText('SDK initialized successfully.')
  })

  test('real click on a snooze menu item arms the snooze and preserves the standing preference', async ({
    page,
  }) => {
    const host = page.locator('[data-obvious-feedback-toolbar]')
    const viewport = page.viewportSize()
    if (!viewport) throw new Error('viewport size unavailable')

    await expect(host).toHaveAttribute('data-presentation', 'docked')
    const visibleBefore = await page.evaluate(() =>
      window.localStorage.getItem(
        `obvious.feedback.toolbarVisible:${window.location.origin}`,
      ),
    )
    expect(visibleBefore).toBe('false')

    // The user-hidden bar rests fully below the viewport; hover the
    // bottom-edge strip to reveal the peek sliver.
    await page.mouse.move(viewport.width / 2, viewport.height - 4)
    await expect(host).toHaveAttribute('data-peeking', 'true')

    // Wait out the 200ms dock slide so the sliver is actually under the
    // cursor before the right-click.
    const toolbar = host.locator('.obv-toolbar')
    await expect
      .poll(
        async () => (await toolbar.boundingBox())?.y ?? Number.POSITIVE_INFINITY,
      )
      .toBeLessThan(viewport.height - 20)
    const box = await toolbar.boundingBox()
    if (!box) throw new Error('toolbar bounding box unavailable')

    // Real right-click on the peeked sliver opens the snooze menu.
    await page.mouse.click(box.x + box.width / 2, viewport.height - 12, {
      button: 'right',
    })
    const menu = host.locator('.obv-toolbar-menu')
    await expect(menu).toBeVisible()

    // Real click on the menu item — the dock's capture-phase handler (an
    // ancestor of the menu) sees this click before the menu's own listener.
    await menu.locator('[data-obv-snooze="1h"]').click()

    // The snooze arms: the bar fully removes itself instead of undocking.
    await expect(host).toHaveAttribute('data-presentation', 'hidden')
    await expect(menu).toBeHidden()

    // The standing preference must survive untouched — the old behavior
    // persisted `toolbarVisible: "true"` via revealFully().
    const visibleAfter = await page.evaluate(() =>
      window.localStorage.getItem(
        `obvious.feedback.toolbarVisible:${window.location.origin}`,
      ),
    )
    expect(visibleAfter).toBe('false')

    // And the snooze record is persisted for reloads/sibling tabs.
    const snoozeKey = await page.evaluate(() =>
      Object.keys(window.localStorage).find((key) =>
        key.startsWith('obvious.feedback.toolbarSnoozedUntil:'),
      ),
    )
    expect(snoozeKey).not.toBeUndefined()
  })
})
