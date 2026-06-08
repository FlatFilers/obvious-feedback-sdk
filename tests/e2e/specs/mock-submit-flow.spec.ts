import { test, expect } from "@playwright/test";

test.describe("Mock submit flow", () => {
  test("submitting feedback round hits the mock API and returns success", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    const response = await page.evaluate(async () => {
      const res = await fetch(
        "http://localhost:4444/prepare/v1/feedback/submit-round",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: "fsk_pub_test",
            items: [{ description: "Test feedback from Playwright" }],
          }),
        },
      );
      return res.json();
    });

    expect(response.success).toBe(true);
    expect(response.data.issueId).toContain("abi_mock_");
    expect(response.data.status).toBe("received");
  });

  test("status polling returns mock issue data", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const response = await page.evaluate(async () => {
      const res = await fetch(
        "http://localhost:4444/prepare/v1/feedback/status/abi_mock_1?publicKey=fsk_pub_test",
      );
      return res.json();
    });

    expect(response.success).toBe(true);
    expect(response.data.status).toBe("in_progress");
    expect(response.data.title).toBe("Mock issue title");
  });

  test("attachment upload endpoint returns mock presigned URL", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const response = await page.evaluate(async () => {
      const res = await fetch(
        "http://localhost:4444/prepare/v1/feedback/attachments/upload",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            publicKey: "fsk_pub_test",
            sessionId: "test_session",
            clientAttachmentId: "attach_1",
            name: "screenshot.png",
            mimeType: "image/png",
            sizeBytes: 1024,
          }),
        },
      );
      return res.json();
    });

    expect(response.success).toBe(true);
    expect(response.data.uploadUrl).toContain("s3.mock.test");
    expect(response.data.attachmentToken).toBeTruthy();
  });

  test("toolbar pin round submits element grab to the mock API", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await page.locator('[data-toolbar-action="comment"]').click();
    const targetBox = await page.locator("#visual-target").boundingBox();
    expect(targetBox).not.toBeNull();
    if (!targetBox) return;
    await page.mouse.click(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
    );

    const popover = page.locator(".obv-pin-popover");
    await popover.locator("textarea").fill("Point at the fixture paragraph");
    await popover.locator('[data-pin-action="close"]').click();
    await page.locator('[data-toolbar-action="send"]').click();

    await expect
      .poll(async () => {
        return page.evaluate(async () => {
          const res = await fetch(
            "http://localhost:4444/_test/last-submission",
          );
          return res.json();
        });
      })
      .toMatchObject({
        data: {
          items: [
            {
              description: "Point at the fixture paragraph",
              elementGrabs: [
                {
                  tagName: "P",
                  cssSelector: "#visual-target",
                },
              ],
            },
          ],
        },
      });
  });
});
