import { expect, test, type Page } from "@playwright/test";
import { audit, open, resetData, seedPublicSite, signIn } from "./helpers";

// Phase 3, task 16 and acceptance criterion 5: the real lookup page against the local fake API.
const PAGE = "/sites/alder-house/booking-status";
const form = (page: Page) => page.getByRole("form", { name: "Check booking status" });

async function lookUp(page: Page, reference: string, contact: string) {
  await form(page).getByLabel("Booking reference").fill(reference);
  await form(page).getByLabel("Email or phone you booked with").fill(contact);
  await form(page).getByRole("button", { name: "Check status" }).click();
}

test.describe.configure({ mode: "serial" });
test.beforeEach(() => seedPublicSite());
test.afterAll(resetData);

test("a student checks a booking using only the keyboard", async ({ page, context }) => {
  await context.clearCookies();
  await open(page, "/sites/alder-house");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Check status" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Check booking status" })).toBeVisible();
  await expect(page).toHaveTitle("Check booking status · Alder House");
  await audit(page, "lookup");

  await form(page).getByLabel("Booking reference").focus();
  await page.keyboard.type("ald-appr0v");
  await page.keyboard.press("Tab");
  await page.keyboard.type("AMA@example.com");
  await page.keyboard.press("Enter");

  const heading = page.getByRole("heading", { name: "Your booking status" });
  await expect(heading).toBeFocused();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText(/a place is on hold/)).toBeVisible();
  await audit(page, "lookup result");
});

test("each status has a clear message, and only the status is shown", async ({ page }) => {
  await open(page, PAGE);
  const cases: [string, string, RegExp][] = [
    ["ALD-SUBM1T", "Submitted", /does not reserve a place/],
    ["ALD-REV1EW", "Under review", /reviewing/],
    ["ALD-WA1TL5", "Waitlisted", /waitlist/],
    ["ALD-C0NF1R", "Confirmed", /place is confirmed/],
  ];
  for (const [reference, label, message] of cases) {
    await lookUp(page, reference, "0241234567");
    const result = page.getByRole("status").filter({ hasText: "Your booking status" });
    await expect(result.getByText(label, { exact: true })).toBeVisible();
    await expect(result).toContainText(message);
    await expect(result).not.toContainText(/GH₵|Ama|room type|\b20\d\d\b/i);
  }
});

test("wrong details get one answer, and the old result disappears", async ({ page }) => {
  await open(page, PAGE);
  await lookUp(page, "ALD-APPR0V", "ama@example.com");
  await expect(page.getByRole("heading", { name: "Your booking status" })).toBeVisible();

  await lookUp(page, "ALD-APPR0V", "someone@example.com");
  const alert = form(page).getByRole("alert");
  await expect(alert).toContainText("could not find a booking");
  const wrongContact = await alert.textContent();
  await expect(page.getByRole("heading", { name: "Your booking status" })).toHaveCount(0);
  await audit(page, "lookup not found");

  await lookUp(page, "ALD-NOPE00", "ama@example.com");
  await expect(alert).toHaveText(wrongContact as string);
});

test("an incomplete form is explained without using an attempt", async ({ page }) => {
  await open(page, PAGE);
  await form(page).getByRole("button", { name: "Check status" }).click();
  await expect(form(page).getByText("Enter your booking reference")).toBeVisible();
  await expect(form(page).getByLabel("Booking reference")).toBeFocused();
  await audit(page, "lookup errors");
});

test("the sixth attempt is refused even with correct details", async ({ page }) => {
  await open(page, PAGE);
  for (let i = 0; i < 5; i++) {
    await lookUp(page, `ALD-WR0NG${i}`, "ama@example.com");
    await expect(form(page).getByRole("alert")).toContainText("could not find");
    await form(page).getByRole("button", { name: "Check status" }).waitFor();
  }
  await lookUp(page, "ALD-APPR0V", "ama@example.com");
  await expect(form(page).getByRole("alert")).toContainText("wait 15 minutes");
  await expect(page.getByRole("heading", { name: "Your booking status" })).toHaveCount(0);
});

test("one hostel's booking cannot be found through another hostel", async ({ page }) => {
  await open(page, PAGE);
  await lookUp(page, "CLO-7K3Q9P", "kofi@example.com");
  await expect(form(page).getByRole("alert")).toContainText("could not find");
});

test("a student of a suspended hostel can still check", async ({ page }) => {
  await open(page, "/sites/closed-hostel/booking-status");
  await lookUp(page, "CLO-7K3Q9P", "kofi@example.com");
  await expect(page.getByRole("heading", { name: "Your booking status" })).toBeVisible();
});

test("the booking confirmation links to the status page", async ({ page, context }) => {
  await signIn(context, "student", "aal1");
  await open(page, "/sites/alder-house/book?room=two-in-a-room");
  const booking = page.getByRole("form", { name: "Booking request" });
  await booking.getByLabel("Full name").fill("Ama Mensah");
  await booking.getByLabel("Phone number").fill("0241234567");
  await booking.getByRole("button", { name: "Send booking request" }).click();
  await page.getByRole("link", { name: "Check booking status" }).click();
  await expect(page).toHaveURL(/\/booking-status$/);
  await expect(page.getByRole("heading", { level: 1, name: "Check booking status" })).toBeVisible();
});

test("the phone header stays tidy with all its links", async ({ page }) => {
  await open(page, PAGE);
  const nav = page.getByRole("navigation", { name: "Main" });
  const tops = await nav.getByRole("link").evaluateAll((links) => links.map((l) => Math.round(l.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);
});
