import { test, expect } from "@playwright/test";

async function enterAnnotationMode(page: import("@playwright/test").Page) {
  await page.locator('[data-toolbar-action="comment"]').click();
  await expect(
    page.locator('[data-obvious-feedback-pick-overlay="true"]'),
  ).toBeAttached();
}

async function pinElement(
  page: import("@playwright/test").Page,
  selector: string,
  comment: string,
) {
  const targetBox = await page.locator(selector).boundingBox();
  expect(targetBox).not.toBeNull();
  if (!targetBox) return;
  await page.mouse.click(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
  );
  const popover = page.locator(".obv-pin-popover");
  await expect(popover).toBeVisible();
  await popover.locator("textarea").fill(comment);
  await popover.locator('[data-pin-action="close"]').click();
  await expect(page.locator(".obv-pin")).toHaveCount(1);
}

test.describe("Inline pin annotations", () => {
  test("comment enters annotation mode and creates a numbered pin", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#status")).toHaveText(
      "SDK initialized successfully.",
    );

    await enterAnnotationMode(page);
    await pinElement(page, "#card-title", "This title is hard to read");

    await expect(page.locator('[data-obvious-feedback-pick-overlay="true"]')).toHaveCount(
      0,
    );
    await expect(page.locator(".obv-pin").first()).toHaveText("1");
    await expect(page.locator('[data-toolbar-action="send"]')).toBeVisible();
  });

  test("reopening a pin shows the saved comment", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await enterAnnotationMode(page);
    await pinElement(page, "#card-title", "Saved comment");

    await page.locator(".obv-pin").first().click();
    const popover = page.locator(".obv-pin-popover");
    await expect(popover).toBeVisible();
    await expect(popover.locator("textarea")).toHaveValue("Saved comment");
  });

  test("Escape exits annotation mode when no popover is open", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await enterAnnotationMode(page);
    await page.keyboard.press("Escape");
    await expect(page.locator('[data-obvious-feedback-pick-overlay="true"]')).toHaveCount(
      0,
    );
  });
});
