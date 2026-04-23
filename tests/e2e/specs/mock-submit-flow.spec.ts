import { test, expect } from '@playwright/test'

test.describe('Mock submit flow', () => {
  test('submitting feedback round hits the mock API and returns success', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#status')).toHaveText('SDK initialized successfully.')

    const response = await page.evaluate(async () => {
      const res = await fetch('http://localhost:4444/prepare/v1/feedback/submit-round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'fsk_pub_test',
          items: [{ description: 'Test feedback from Playwright' }],
        }),
      })
      return res.json()
    })

    expect(response.success).toBe(true)
    expect(response.data.issueId).toContain('abi_mock_')
    expect(response.data.status).toBe('received')
  })

  test('status polling returns mock issue data', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const response = await page.evaluate(async () => {
      const res = await fetch('http://localhost:4444/prepare/v1/feedback/status/abi_mock_1?publicKey=fsk_pub_test')
      return res.json()
    })

    expect(response.success).toBe(true)
    expect(response.data.status).toBe('in_progress')
    expect(response.data.title).toBe('Mock issue title')
  })

  test('attachment upload endpoint returns mock presigned URL', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const response = await page.evaluate(async () => {
      const res = await fetch('http://localhost:4444/prepare/v1/feedback/attachments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: 'fsk_pub_test',
          sessionId: 'test_session',
          clientAttachmentId: 'attach_1',
          name: 'screenshot.png',
          mimeType: 'image/png',
          sizeBytes: 1024,
        }),
      })
      return res.json()
    })

    expect(response.success).toBe(true)
    expect(response.data.uploadUrl).toContain('s3.mock.test')
    expect(response.data.attachmentToken).toBeTruthy()
  })
})
