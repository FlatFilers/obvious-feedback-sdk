import { test, expect } from "@playwright/test";

const FIXTURE_URL = "/?inlineAnnotations=true";

test.describe("Inline pin annotations", () => {
  test("trigger enters annotation mode and opens the list after first pin", async ({
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
    await expect(overlay).toHaveCount(0);
    await expect(
      page.locator(".obv-list-row .obv-row-input").first(),
    ).toHaveValue("This title is hard to read");

    await page.locator(".obv-row-pill").first().click();
    await expect(popup).toBeVisible();
    await expect(
      popup.locator('[data-inline-popup-textarea="true"]'),
    ).toHaveValue("This title is hard to read");
  });

  test("clicking or pressing Enter in a pinned list row does not open the popup", async ({ page }) => {
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

    const input = page.locator(".obv-list-row .obv-row-input").first();
    await input.click();
    await expect(popup).toHaveCount(0);

    await input.press("Enter");
    await expect(popup).toHaveCount(0);
  });

  test("select element from a typed feedback line pre-fills and attaches that item", async ({
    page,
  }) => {
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
    await expect(page.locator(".obv-list-row .obv-row-input")).toHaveCount(1);

    await page.locator(".obv-list-row .obv-row-input").first().press("Enter");
    await page
      .locator(".obv-list-row .obv-row-input")
      .nth(1)
      .fill("Second from typed line");
    await page.locator('[data-element-select-start="true"]').click();
    const paragraphBox = await page.locator("#visual-target").boundingBox();
    expect(paragraphBox).not.toBeNull();
    if (!paragraphBox) return;
    await page.mouse.click(
      paragraphBox.x + paragraphBox.width / 2,
      paragraphBox.y + paragraphBox.height / 2,
    );

    await expect(popup).toBeVisible();
    await expect(
      popup.locator('[data-inline-popup-textarea="true"]'),
    ).toHaveValue("Second from typed line");
    await popup.locator('[data-inline-popup-submit="true"]').click();

    await expect(page.locator('[data-annotation-overlay="true"]')).toHaveCount(
      0,
    );
    await expect(page.locator(".obv-list-row .obv-row-input")).toHaveCount(2);
    await expect(page.locator(".obv-list-row .obv-row-input").nth(1)).toHaveValue(
      "Second from typed line",
    );
    await expect(page.locator(".obv-row-pill").last()).toContainText("<p>");
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

  test("editing a pin only shows cancel and save actions", async ({ page }) => {
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

    await expect(reopened.locator('[data-inline-popup-close="true"]')).toHaveCount(
      0,
    );
    await expect(
      reopened.locator('[data-inline-popup-delete="true"]'),
    ).toHaveCount(0);
    await expect(
      reopened.locator('[data-inline-popup-cancel="true"]'),
    ).toBeVisible();
    await expect(
      reopened.locator('[data-inline-popup-submit="true"]'),
    ).toBeVisible();
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
