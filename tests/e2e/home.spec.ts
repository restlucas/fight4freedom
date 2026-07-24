import { expect, test } from "@playwright/test";

test("home loads and shows the title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /fight4freedom/i })).toBeVisible();
});
