import { test, expect } from '@playwright/test'

const FEEDBACK_API_BASE_URL = process.env.FEEDBACK_API_BASE_URL
const FEEDBACK_PUBLIC_KEY = process.env.FEEDBACK_PUBLIC_KEY

const isLiveEnabled = Boolean(FEEDBACK_API_BASE_URL && FEEDBACK_PUBLIC_KEY)

test.describe('Live Obvious smoke test', () => {
  test.skip(!isLiveEnabled, 'Skipped: set FEEDBACK_API_BASE_URL and FEEDBACK_PUBLIC_KEY env vars to enable')

  test('submits real feedback and polls status successfully', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const response = await page.evaluate(
      async ({ apiBaseUrl, publicKey }) => {
        const res = await fetch(`${apiBaseUrl}/prepare/v1/feedback/submit-round`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicKey,
            env: 'e2e-test',
            items: [{ description: 'Automated e2e smoke test from Playwright' }],
            context: { source: 'playwright-live-smoke', timestamp: new Date().toISOString() },
          }),
        })
        return res.json()
      },
      { apiBaseUrl: FEEDBACK_API_BASE_URL, publicKey: FEEDBACK_PUBLIC_KEY }
    )

    expect(response.success).toBe(true)
    expect(response.data.issueId).toBeTruthy()
    expect(response.data.status).toBe('received')

    const statusResponse = await page.evaluate(
      async ({ apiBaseUrl, publicKey, issueId }) => {
        const res = await fetch(
          `${apiBaseUrl}/prepare/v1/feedback/status/${issueId}?publicKey=${publicKey}`
        )
        return res.json()
      },
      {
        apiBaseUrl: FEEDBACK_API_BASE_URL,
        publicKey: FEEDBACK_PUBLIC_KEY,
        issueId: response.data.issueId,
      }
    )

    expect(statusResponse.success).toBe(true)
    expect(statusResponse.data.issueId).toBe(response.data.issueId)
  })
})
