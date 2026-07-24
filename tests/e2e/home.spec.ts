import { expect, test } from "@playwright/test";

test("home loads and shows the clan hero and join CTA", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /fight 4 freedom/i, level: 1 }),
  ).toBeAttached();
  await expect(
    page.getByRole("link", { name: /quero ser membro/i }),
  ).toBeVisible();
});
