import { expect, test, type Locator, type Page } from "@playwright/test";
import { apiState, audit, open, resetData, seedPublicSite, signIn } from "./helpers";

// Phase 3, task 15 and acceptance criterion 1: the real booking form against the local fake API.
const SITE = "/sites/alder-house";
const BOOK = `${SITE}/book?room=two-in-a-room`;

test.describe.configure({ mode: "serial" });
test.beforeEach(() => seedPublicSite());
test.afterAll(resetData);

/** Presses Tab until the element has focus, as a keyboard user would. */
async function tabTo(page: Page, target: Locator) {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error("Could not reach the element with the Tab key");
}

async function typeInto(page: Page, target: Locator, text: string) {
  await tabTo(page, target);
  await page.keyboard.type(text);
}

test("a student verifies their email and books using only the keyboard", async ({ page, context }) => {
  await context.clearCookies();
  await open(page, `${SITE}/rooms/two-in-a-room`);
  const request = page.getByRole("link", { name: "Request this room for 2040/41 Academic Year" });
  await tabTo(page, request);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { level: 1, name: "Request a room" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
  await audit(page, "verify email");
  await typeInto(page, page.getByLabel("Email address"), "student@alder.test");
  await page.keyboard.press("Enter");

  const code = page.getByLabel("6-digit code");
  await expect(code).toBeFocused();
  await page.keyboard.type("000000");
  await page.keyboard.press("Enter");
  await expect(page.getByText("That code is wrong or has expired.")).toBeVisible();
  await code.focus();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("123456");
  await page.keyboard.press("Enter");

  const form = page.getByRole("form", { name: "Booking request" });
  await expect(form).toBeVisible();
  await expect(page.getByText("Verified as student@alder.test.")).toBeVisible();
  await expect(form.getByLabel("Room type")).toHaveValue("20000000-0000-4000-8000-000000000001");
  await expect(form.getByText("GH₵ 4,500.00")).toBeVisible();
  await expect(form.getByText("GH₵ 1,000.00")).toBeVisible();
  await audit(page, "booking form");

  await typeInto(page, form.getByLabel("Full name"), "Ama Mensah");
  await typeInto(page, form.getByLabel("Phone number"), "024 123 4567");
  await typeInto(page, form.getByLabel("School or university"), "University of Ghana");
  await typeInto(page, form.getByLabel("Note to the hostel"), "Near the library please");
  await tabTo(page, form.getByRole("button", { name: "Send booking request" }));
  await page.keyboard.press("Enter");

  const heading = page.getByRole("heading", { name: "We have your request" });
  await expect(heading).toBeFocused();
  await expect(page.getByText("ALD-7K3Q0P")).toBeVisible();
  await expect(page.getByText(/could not email a confirmation/)).toBeVisible();
  await expect(page.getByText("This request does not reserve a place yet.")).toBeVisible();
  await audit(page, "confirmation");

  const [saved] = (await apiState()).db.booking_requests;
  expect(saved).toMatchObject({ full_name: "Ama Mensah", phone: "+233241234567", note: "Near the library please" });
});

test("errors are announced, focused and keep what was typed", async ({ page, context }) => {
  await signIn(context, "student", "aal1");
  await open(page, BOOK);
  const form = page.getByRole("form", { name: "Booking request" });
  await form.getByLabel("Full name").fill("Ama Mensah");
  await form.getByLabel("Phone number").fill("12345");
  await form.getByRole("button", { name: "Send booking request" }).click();

  await expect(form.getByRole("alert").filter({ hasText: "Check the highlighted fields" })).toBeVisible();
  await expect(form.getByText(/Enter a valid phone number/)).toBeVisible();
  await expect(form.getByLabel("Phone number")).toBeFocused();
  await expect(form.getByLabel("Phone number")).toHaveAttribute("aria-invalid", "true");
  await expect(form.getByLabel("Full name")).toHaveValue("Ama Mensah");
  await audit(page, "form errors");
  expect((await apiState()).db.booking_requests).toHaveLength(0);
});

test("changing the period updates the rooms and the price", async ({ page, context }) => {
  await signIn(context, "student", "aal1");
  await open(page, `${SITE}/book?room=single-room`);
  const form = page.getByRole("form", { name: "Booking request" });
  await expect(form.getByText("GH₵ 8,000.00")).toBeVisible();
  await form.getByLabel("Booking period").selectOption({ label: "Vacation 2041" });
  await expect(form.getByLabel("Room type").locator("option")).toHaveCount(1);
  await expect(form.getByLabel("Room type")).toHaveValue("20000000-0000-4000-8000-000000000001");
  await expect(form.getByText("GH₵ 600.00")).toBeVisible();
});

test("a double submit creates one request with one reference", async ({ page, context }) => {
  await signIn(context, "student", "aal1");
  await open(page, BOOK);
  const form = page.getByRole("form", { name: "Booking request" });
  await form.getByLabel("Full name").fill("Ama Mensah");
  await form.getByLabel("Phone number").fill("0241234567");
  await form.evaluate((el: HTMLFormElement) => {
    el.requestSubmit();
    el.requestSubmit();
  });
  await expect(page.getByRole("heading", { name: "We have your request" })).toBeVisible();
  await expect(page.getByText("ALD-7K3Q0P")).toBeVisible();
  expect((await apiState()).db.booking_requests).toHaveLength(1);
});

test("a second request for the same period is explained", async ({ page, context }) => {
  await signIn(context, "student", "aal1");
  for (const expected of ["We have your request", "already have a booking request"]) {
    await open(page, BOOK);
    const form = page.getByRole("form", { name: "Booking request" });
    await form.getByLabel("Full name").fill("Ama Mensah");
    await form.getByLabel("Phone number").fill("0241234567");
    await form.getByRole("button", { name: "Send booking request" }).click();
    await expect(page.getByText(new RegExp(expected)).first()).toBeVisible();
  }
  expect((await apiState()).db.booking_requests).toHaveLength(1);
});

test("the form asks for a student ID and gender only when the hostel requires them", async ({ page, context }) => {
  await signIn(context, "student", "aal1");
  await open(page, BOOK);
  await expect(page.getByLabel("Student ID number")).toHaveCount(0);
  await expect(page.getByLabel("Gender")).toHaveCount(0);

  await seedPublicSite({ rules: true });
  await open(page, BOOK);
  const form = page.getByRole("form", { name: "Booking request" });
  await form.getByLabel("Full name").fill("Ama Mensah");
  await form.getByLabel("Phone number").fill("0241234567");
  await form.getByRole("button", { name: "Send booking request" }).click();
  await expect(form.getByText("Enter your student ID number")).toBeVisible();
  await expect(form.getByLabel("Student ID number")).toBeFocused();
  await form.getByLabel("Student ID number").fill("UG123");
  await form.getByRole("button", { name: "Send booking request" }).click();
  await expect(form.getByText("Choose an option").last()).toBeVisible();
  await form.getByLabel("Gender").selectOption("female");
  await form.getByRole("button", { name: "Send booking request" }).click();
  await expect(page.getByRole("heading", { name: "We have your request" })).toBeVisible();
});

test("a fully booked room offers the waitlist", async ({ page, context }) => {
  await context.clearCookies();
  await open(page, `${SITE}/rooms/four-in-a-room`);
  await page.getByRole("link", { name: "Join the waitlist for 2040/41 Academic Year" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Request a room" })).toBeVisible();
  await signIn(context, "student", "aal1");
  await open(page, `${SITE}/book?room=four-in-a-room`);
  await expect(page.getByText(/fully booked\. You can still send a request/)).toBeVisible();
});

test("a suspended hostel takes no bookings", async ({ page, context }) => {
  await signIn(context, "student", "aal1");
  await open(page, "/sites/closed-hostel/book");
  await expect(page.getByText(/not taking bookings|temporarily unavailable/i).first()).toBeVisible();
  await expect(page.getByRole("form", { name: "Booking request" })).toHaveCount(0);
});
