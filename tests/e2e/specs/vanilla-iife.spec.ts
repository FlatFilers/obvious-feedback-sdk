import { test, expect } from '@playwright/test'

test.describe('Vanilla IIFE host', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })

  test('SDK initializes and shows the feedback toolbar', async ({ page }) => {
    await expect(page.locator('#status')).toHaveText('SDK initialized successfully.')
    await expect(page.locator('[data-obvious-feedback-toolbar]')).toBeAttached()
    await expect(page.locator('[data-toolbar-action="comment"]')).toBeVisible()
  })

  test('comment button enters annotation mode', async ({ page }) => {
    await page.locator('[data-toolbar-action="comment"]').click()
    await expect(page.locator('[data-obvious-feedback-pick-overlay="true"]')).toBeAttached()
  })

  test('page does not have console errors on load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    expect(errors).toEqual([])
  })
})
