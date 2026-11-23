import { expect, test } from "@playwright/test";
import { audit, NOT_FOUND, open, resetData, seedPublicSite } from "./helpers";

// Phase 3, task 14: the real public pages against the local fake API (made-up data).
const SITE = "/sites/alder-house";

test.describe.configure({ mode: "serial" });
test.beforeEach(() => seedPublicSite());
test.afterAll(resetData);

test("a visitor browses the branded home page", async ({ page }) => {
  await open(page, SITE);
  await expect(page.getByRole("heading", { level: 1, name: "A calm place to study and live" })).toBeVisible();
  await expect(page).toHaveTitle(/Alder House/);
  await expect(page.getByText("<b>Quiet</b> and secure.")).toBeVisible();
  const hero = page.locator("main section").first();
  expect(await hero.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(122, 31, 61)");
  await expect(page.getByRole("heading", { level: 3, name: "Two in a room" })).toBeVisible();
  await expect(page.getByText("Hidden room")).toHaveCount(0);
  await expect(page.getByText("GA-123-4567")).toBeVisible();
  await audit(page, "home");
});

test("rooms show price and an indicator, never an exact count", async ({ page }) => {
  await open(page, `${SITE}/rooms`);
  await expect(page.getByRole("heading", { level: 1, name: "Rooms and prices" })).toBeVisible();
  const card = (name: string) => page.getByRole("article").filter({ has: page.getByRole("heading", { name }) });
  await expect(card("Two in a room").getByText("Available", { exact: true })).toBeVisible();
  await expect(card("Two in a room").getByText("GH₵ 4,500.00")).toBeVisible();
  await expect(card("Single room").getByText("Limited", { exact: true })).toBeVisible();
  await expect(card("Four in a room").getByText("Fully booked", { exact: true })).toBeVisible();
  await expect(page.getByText("Hidden room")).toHaveCount(0);
  await expect(page.getByText("Draft period")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(/\b\d+ (beds?|left|remaining)\b/i);
  await audit(page, "rooms");

  await page.getByRole("link", { name: "Vacation 2041" }).click();
  await expect(page).toHaveURL(/period=/);
  await expect(page.getByRole("link", { name: "Vacation 2041" })).toHaveAttribute("aria-current", "true");
  await expect(card("Two in a room").getByText("GH₵ 600.00")).toBeVisible();
  await expect(card("Single room")).toHaveCount(0);
});

test("a room page shows photos, amenities, prices and deposits", async ({ page }) => {
  await open(page, `${SITE}/rooms`);
  await page.getByRole("link", { name: "Two in a room" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Two in a room" })).toBeVisible();
  await expect(page).toHaveTitle(/Two in a room · Alder House/);
  await expect(page.getByRole("img", { name: "Two beds by a bright window" })).toBeVisible();
  await expect(page.getByText("Study desk")).toBeVisible();
  const year = page.getByRole("listitem").filter({ hasText: "2040/41 Academic Year" });
  await expect(year.getByText("GH₵ 4,500.00")).toBeVisible();
  await expect(year.getByText("GH₵ 1,000.00")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Vacation 2041" }).getByText("None")).toBeVisible();
  await audit(page, "room detail");
});

test("policies are plain text and contact actions work", async ({ page }) => {
  await open(page, `${SITE}/policies`);
  await expect(page.getByRole("heading", { level: 2, name: "House rules" })).toBeVisible();
  await expect(page.getByText("<script>window.__xss = 1</script>")).toBeVisible();
  await expect(page.getByText("**Not bold**")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  await audit(page, "policies");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Contact" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Contact and directions" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Call 024 123 4567/ })).toHaveAttribute("href", "tel:+233241234567");
  await expect(page.getByRole("link", { name: "Chat on WhatsApp" })).toHaveAttribute("href", "https://wa.me/233241234567");
  await expect(page.getByRole("link", { name: "Open map" })).toHaveAttribute("rel", /noopener/);
  // The title streams in just after a client-side navigation.
  await expect(page).toHaveTitle("Contact · Alder House");
  await audit(page, "contact");
});

test("unknown rooms, unpublished rooms and suspended hostels show nothing private", async ({ page }) => {
  await open(page, `${SITE}/rooms/not-a-room`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await open(page, `${SITE}/rooms/hidden-room`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  for (const path of ["", "/rooms", "/policies", "/contact", "/rooms/two-in-a-room"]) {
    await open(page, `/sites/closed-hostel${path}`);
    await expect(page.getByText(/not taking bookings|temporarily unavailable/i).first()).toBeVisible();
  }
});

test("a hostel with no rooms explains what to do next", async ({ page }) => {
  await resetData();
  await open(page, `${SITE}/rooms`);
  await expect(page.getByText("Room listings are on their way")).toBeVisible();
  await audit(page, "rooms empty");
  await open(page, `${SITE}/policies`);
  await expect(page.getByText("Policies are on their way")).toBeVisible();
  await audit(page, "policies empty");
});
