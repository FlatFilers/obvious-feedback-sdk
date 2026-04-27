import { test, expect } from '@playwright/test'

test.describe('Theme visibility', () => {
  test('light theme renders visible trigger on white background', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#status')).toHaveText('SDK initialized successfully.')
    const shadowHost = page.locator('body > div').last()
    await expect(shadowHost).toHaveAttribute('data-theme', 'light')
  })

  test('dark theme applies dark color scheme', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await page.evaluate(() => {
      const existingWidget = (window as unknown as Record<string, unknown>).__feedbackWidget as
        | { destroy: () => void }
        | undefined
      existingWidget?.destroy()

      const ns = (window as unknown as Record<string, unknown>).ObviousFeedback as Record<string, unknown>
      const sdk = (ns.ObviousFeedback ?? ns) as { init: (config: Record<string, unknown>) => unknown }
      sdk.init({
        publicKey: 'fsk_pub_test',
        apiBaseUrl: 'http://localhost:4444',
        theme: 'dark',
      })
    })

    const shadowHost = page.locator('body > div').last()
    await expect(shadowHost).toHaveAttribute('data-theme', 'dark')
  })

  test('system theme follows prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    await page.evaluate(() => {
      const existingWidget = (window as unknown as Record<string, unknown>).__feedbackWidget as
        | { destroy: () => void }
        | undefined
      existingWidget?.destroy()

      const ns = (window as unknown as Record<string, unknown>).ObviousFeedback as Record<string, unknown>
      const sdk = (ns.ObviousFeedback ?? ns) as { init: (config: Record<string, unknown>) => unknown }
      sdk.init({
        publicKey: 'fsk_pub_test',
        apiBaseUrl: 'http://localhost:4444',
        theme: 'system',
      })
    })

    const shadowHost = page.locator('body > div').last()
    await expect(shadowHost).toHaveAttribute('data-theme', 'dark')
  })
})
