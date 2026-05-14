import { test, expect } from "@playwright/test";

const FIXTURE_URL = "/?inlineAnnotations=true";

test.describe("Inline pin annotations", () => {
  test("trigger enters annotation mode and creates a pin on submit", async ({
    page,
  }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await page.locator(".obv-trigger").click();

    const overlay = page.locator('[data-annotation-overlay="true"]');
    await expect(overlay).toBeAttached();

    const titleBox = await page.locator("#card-title").boundingBox();
    expect(titleBox).not.toBeNull();
    if (!titleBox) return;
    await page.mouse.click(
      titleBox.x + titleBox.width / 2,
      titleBox.y + titleBox.height / 2,
    );

    const popup = page.locator('[data-annotation-popup="true"]');
    await expect(popup).toBeVisible();

    const textarea = popup.locator('[data-inline-popup-textarea="true"]');
    await textarea.fill("This title is hard to read");
    await popup.locator('[data-inline-popup-submit="true"]').click();

    const pin = page.locator(".obv-pin");
    await expect(pin).toHaveCount(1);
    await expect(pin.locator(".obv-pin-number")).toHaveText("1");

    await page.locator('[data-annotation-open-card="true"]').click();
    await expect(
      page.locator(".obv-list-row .obv-row-input").first(),
    ).toHaveValue("This title is hard to read");
  });

  test("clicking a pin re-opens the popup in edit mode", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await page.locator(".obv-trigger").click();
    const titleBox = await page.locator("#card-title").boundingBox();
    expect(titleBox).not.toBeNull();
    if (!titleBox) return;
    await page.mouse.click(
      titleBox.x + titleBox.width / 2,
      titleBox.y + titleBox.height / 2,
    );

    const popup = page.locator('[data-annotation-popup="true"]');
    await popup.locator('[data-inline-popup-textarea="true"]').fill("First");
    await popup.locator('[data-inline-popup-submit="true"]').click();

    await expect(popup).toHaveCount(0);

    const pin = page.locator(".obv-pin").first();
    await pin.click();

    const reopened = page.locator('[data-annotation-popup="true"]');
    await expect(reopened).toBeVisible();
    await expect(
      reopened.locator('[data-inline-popup-textarea="true"]'),
    ).toHaveValue("First");

    await reopened
      .locator('[data-inline-popup-textarea="true"]')
      .fill("First (edited)");
    await reopened.locator('[data-inline-popup-submit="true"]').click();

    await page.locator('[data-annotation-open-card="true"]').click();
    await expect(
      page.locator(".obv-list-row .obv-row-input").first(),
    ).toHaveValue("First (edited)");
  });

  test("delete button removes the pin and round item", async ({ page }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await page.locator(".obv-trigger").click();
    const titleBox = await page.locator("#card-title").boundingBox();
    expect(titleBox).not.toBeNull();
    if (!titleBox) return;
    await page.mouse.click(
      titleBox.x + titleBox.width / 2,
      titleBox.y + titleBox.height / 2,
    );

    const popup = page.locator('[data-annotation-popup="true"]');
    await popup.locator('[data-inline-popup-textarea="true"]').fill("Doomed");
    await popup.locator('[data-inline-popup-submit="true"]').click();

    await expect(page.locator(".obv-pin")).toHaveCount(1);

    await page.locator(".obv-pin").first().click();
    const reopened = page.locator('[data-annotation-popup="true"]');
    await reopened.locator('[data-inline-popup-delete="true"]').click();

    await expect(page.locator(".obv-pin")).toHaveCount(0);
  });

  test("Escape exits annotation mode when no popup is open", async ({
    page,
  }) => {
    await page.goto(FIXTURE_URL, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await page.locator(".obv-trigger").click();
    const overlay = page.locator('[data-annotation-overlay="true"]');
    await expect(overlay).toBeAttached();

    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
  });
});
