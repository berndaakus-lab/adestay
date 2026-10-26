import { expect, test } from "@playwright/test";

test("home page renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  const response = await page.goto("/");

  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toBeVisible();
  expect(errors).toEqual([]);
});
