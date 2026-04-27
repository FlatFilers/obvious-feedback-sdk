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

  test("visual suggestions preview live and submit with feedback context", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await page.locator(".obv-trigger").click();
    await page
      .locator('[data-item-input="__new"]')
      .fill("Make the fixture paragraph larger");
    await page.locator('[data-visual-suggest-start="true"]').click();

    const targetBox = await page.locator("#visual-target").boundingBox();
    expect(targetBox).not.toBeNull();
    await page.mouse.click(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
    );

    const fontSizeSlider = page.locator('[data-vs-slider="font-size"]');
    await expect(fontSizeSlider).toBeVisible();
    await fontSizeSlider.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "28";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.locator("#visual-target")).toHaveCSS("font-size", "28px");

    await page.locator('[data-item-input="__new"]').press("Enter");
    await page.locator('[data-submit-round="true"]').click();

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
          context: {
            visualSuggestions: {
              version: 1,
              suggestions: [
                {
                  property: "font-size",
                  originalValue: "16px",
                  suggestedValue: "28px",
                },
              ],
            },
          },
        },
      });
  });

  test("visual suggestions resize card text when the title is clicked", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await page.locator(".obv-trigger").click();
    await page
      .locator('[data-item-input="__new"]')
      .fill("Make the card title larger");
    await page.locator('[data-visual-suggest-start="true"]').click();

    const titleBox = await page.locator("#card-title").boundingBox();
    expect(titleBox).not.toBeNull();
    await page.mouse.click(
      titleBox!.x + titleBox!.width / 2,
      titleBox!.y + titleBox!.height / 2,
    );

    await expect(page.locator(".obv-vs-target")).toContainText("Text");

    const fontSizeSlider = page.locator('[data-vs-slider="font-size"]');
    await expect(fontSizeSlider).toBeVisible();
    await fontSizeSlider.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = "28";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await expect(page.locator("#card-title")).toHaveCSS("font-size", "28px");
    await expect(page.locator("#card-target")).not.toHaveCSS(
      "font-size",
      "28px",
    );
  });
});
