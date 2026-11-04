import { expect, test } from "@playwright/test";

test("staff sign-in page shows labelled fields and a working reset link", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await page.getByRole("link", { name: "Forgot your password?" }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
});

test("student portal pages do not exist on the staff (app) host", async ({ page }) => {
  const response = await page.goto("/portal/sign-in");
  expect(response?.status()).toBe(404);
});

test("account pages send signed-out visitors to sign in, keeping a safe next path", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Faccount$/);
});

test("an external next parameter is ignored", async ({ page }) => {
  await page.goto("/sign-in?next=https://evil.example");
  const next = await page.locator('input[name="next"]').inputValue();
  expect(next).toBe("/account");
});
