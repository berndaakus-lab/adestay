import { expect, test } from "@playwright/test";
import { apiState, audit, dialog, NOT_FOUND, open, resetData, signIn, submitDialog } from "./helpers";

test.beforeEach(async () => {
  await resetData();
});

test("platform admin onboards, suspends and restores a hostel", async ({ page, context }, info) => {
  const tag = info.project.name === "desktop" ? "dsk" : "mob";
  const slug = `cedar-court-${tag}`;
  await signIn(context, "platform");

  await open(page, "/platform");
  await expect(page.getByRole("link", { name: /Alder House/ }).first()).toBeVisible();
  await audit(page, "hostel list");

  await page.getByRole("link", { name: "Add a hostel" }).first().click();
  await page.waitForURL("**/platform/hostels/new");
  await page.getByRole("button", { name: /Create hostel/ }).click();
  await expect(page.getByText("Enter the hostel name")).toBeVisible();
  await audit(page, "wizard errors");

  await page.getByLabel("Hostel name").fill(`Cedar Court ${tag}`);
  await expect(page.getByLabel("Web address name")).toHaveValue(slug);
  await page.getByLabel("Booking reference prefix").fill(tag === "dsk" ? "ced" : "cdm");
  await page.getByLabel("Admin's email address").fill("Owner@Cedar.test");
  await page.getByRole("button", { name: /Create hostel/ }).click();
  await page.waitForURL("**/platform/hostels/*?created=1");
  await expect(page.getByText("owner@cedar.test")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Next steps" })).toBeVisible();
  await audit(page, "hostel detail");

  await page.getByRole("button", { name: "Resend invitation to owner@cedar.test" }).click();
  await expect(page.getByText(/Invitation saved/).first()).toBeVisible();

  await page.getByRole("button", { name: "Activate hostel" }).click();
  await audit(page, "status dialog");
  await dialog(page).getByRole("button", { name: "Activate" }).click();
  await expect(dialog(page).getByText("Give a short reason")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Onboarding call done");
  await submitDialog(page, "Activate");
  await expect(page.getByRole("button", { name: "Suspend hostel" })).toBeVisible();

  const host = `book.${tag}.example.test`;
  await page.getByLabel("Add a custom domain").fill("https://not-valid");
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(/Enter a domain like/)).toBeVisible();
  await expect(page.getByLabel("Add a custom domain"), "typed value survives a failed submit").toHaveValue("https://not-valid");
  await page.getByLabel("Add a custom domain").fill(host);
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByText(host, { exact: true }).first()).toBeVisible();
  await page.getByLabel("Set status").selectOption("verified");
  await page.getByRole("button", { name: `Save status of ${host}` }).click();
  await page.getByRole("button", { name: `Make ${host} the primary domain` }).click();
  await expect(page.getByText("Primary", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" }), "a primary domain cannot be removed").toHaveCount(0);

  // Criterion 5: suspension. The site is first requested while suspended, so no cached status applies.
  await page.getByRole("button", { name: "Suspend hostel" }).click();
  await dialog(page).getByLabel("Reason").fill("Subscription unpaid");
  await submitDialog(page, "Suspend hostel");
  await expect(page.getByText(/Reason: Subscription unpaid/)).toBeVisible();
  await audit(page, "suspended hostel");
  const detail = page.url();
  await open(page, `/sites/${slug}`);
  await expect(page.getByText(/not taking bookings|temporarily unavailable/i).first()).toBeVisible();
  await audit(page, "suspended public site");

  await open(page, detail);
  await page.getByRole("button", { name: "Restore hostel" }).click();
  await dialog(page).getByLabel("Reason").fill("Payment received");
  await submitDialog(page, "Restore");
  await expect(page.getByRole("button", { name: "Suspend hostel" })).toBeVisible();
  expect((await apiState()).db.tenants.find((t) => t.slug === slug).status).toBe("active");

  await open(page, "/platform/hostels/not-a-uuid");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});

test("only platform admins reach the platform area", async ({ page, context }) => {
  await signIn(context, "admin");
  await open(page, "/platform");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await open(page, "/platform/hostels/new");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();

  await signIn(context, "platform", "aal1");
  await open(page, "/platform");
  await expect(page, "a platform admin without MFA must verify").toHaveURL(/\/mfa\/verify/);
});

test("a suspended hostel's site is unavailable and its staff are denied", async ({ page, context }) => {
  await open(page, "/sites/closed-hostel");
  await expect(page.getByText(/not taking bookings|temporarily unavailable/i).first()).toBeVisible();
  await audit(page, "suspended site");

  await signIn(context, "suspended");
  await open(page, "/t/closed-hostel");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await open(page, "/t/closed-hostel/settings");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await open(page, "/t/closed-hostel/inventory");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});
