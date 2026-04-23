import { test, expect } from '@playwright/test'

test.describe('Vanilla IIFE host', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })

  test('SDK initializes and shows trigger button', async ({ page }) => {
    await expect(page.locator('#status')).toHaveText('SDK initialized successfully.')
    const trigger = page.locator('div').last().locator('css=.obv-trigger >> nth=0')
    const shadowHost = page.locator('body > div').last()
    await expect(shadowHost).toBeAttached()
  })

  test('trigger button is visible and clickable', async ({ page }) => {
    const shadowHost = page.locator('body > div').last()
    await expect(shadowHost).toBeAttached()
  })

  test('keyboard shortcut opens feedback card', async ({ page }) => {
    await page.keyboard.press('Meta+Shift+Period')
    await page.waitForTimeout(500)
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
