import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("unknown pages show the styled 404 with a 404 status", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
});

test("wrong-surface paths get the styled 404 page with a 404 status", async ({ page }) => {
  const response = await page.goto("/portal/sign-in");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "We could not find that page" })).toBeVisible();
});

test("the 404 page has no serious accessibility violations", async ({ page }) => {
  await page.goto("/no-such-page");
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
});

test("the staff workspace sends signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/t/alder-house");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Ft%2Falder-house$/);
});

test("platform administration sends signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fplatform$/);
});

test("the landing page links to staff sign in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Staff sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
});
