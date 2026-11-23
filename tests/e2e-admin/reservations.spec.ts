import { expect, test, type Page } from "@playwright/test";
import { apiState, audit, dialog, NOT_FOUND, open, resetData, seedPublicSite, signIn, submitDialog } from "./helpers";

// Phase 3, task 17: the real staff queue and review pages against the local fake API.
// The fake API does not prove RLS or the booking rules; pgTAP and the parallel tests do.
const BASE = "/t/alder-house/reservations";
const request = (n: number) => `${BASE}/70000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`;
const row = async (n: number) => (await apiState()).db.booking_requests.find((r) => r.reference === `ALD-REQ0${String(n).padStart(2, "0")}`);
const hold = async (n: number) => {
  const state = await apiState();
  const r = state.db.booking_requests.find((x) => x.reference === `ALD-REQ0${String(n).padStart(2, "0")}`);
  return state.db.reservations.find((x) => x.booking_request_id === r.id);
};

async function decide(page: Page, trigger: string, confirm: string, fields: Record<string, string> = {}) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  for (const [label, value] of Object.entries(fields)) await dialog(page).getByLabel(label).fill(value);
  await submitDialog(page, confirm);
}

test.describe.configure({ mode: "serial" });
test.beforeEach(() => seedPublicSite({ bookings: true }));
test.afterAll(resetData);

test("a manager works through the queue", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, "/t/alder-house");
  const menu = page.getByText("Menu", { exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("link", { name: "Reservations" }).locator("visible=true").first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Reservations" })).toBeVisible();
  if (await menu.isVisible()) await expect(page.locator("details")).not.toHaveAttribute("open", "");
  const tabs = page.getByRole("navigation", { name: "Booking status" });
  await expect(tabs.getByRole("link", { name: "To review (4)" })).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("link", { name: "Waitlist (1)" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Approved (3)" })).toBeVisible();
  await expect(tabs.getByRole("link", { name: "Closed (1)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ALD-REQ001" }).locator("visible=true")).toBeVisible();
  await expect(page.getByText("Student 1", { exact: true }).locator("visible=true")).toBeVisible();
  await expect(page.getByText("Period ended").locator("visible=true")).toBeVisible();
  await audit(page, "queue");

  await tabs.getByRole("link", { name: "Approved (3)" }).click();
  await expect(page.getByText(/left$/).locator("visible=true").first()).toBeVisible();
  await expect(page.getByText("Overdue").locator("visible=true")).toBeVisible();
  await audit(page, "approved queue");

  await open(page, `${BASE}?view=closed&q=nothing-here`);
  await expect(page.getByText("No booking with that reference here")).toBeVisible();
  await open(page, `${BASE}?view=review&q=req002`);
  await expect(page.getByRole("link", { name: "ALD-REQ002" }).locator("visible=true")).toBeVisible();
  await expect(page.getByRole("link", { name: "ALD-REQ001" })).toHaveCount(0);
});

test("a request is reviewed and rejected, with a reason the student will see", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, request(1));
  await expect(page.getByText("Near the library please")).toBeVisible();
  await expect(page.getByRole("link", { name: "student1@example.com" })).toBeVisible();
  await expect(page.getByText("GH₵ 4,500.00")).toBeVisible();
  await audit(page, "review page");
  await expect(page.getByRole("button", { name: "Reject", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Start review" }).click();
  await page.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(dialog(page).getByText("The student will see this reason")).toBeVisible();
  await audit(page, "reject dialog");
  await dialog(page).getByRole("button", { name: "Reject request" }).click();
  await expect(dialog(page).getByText("Give a short reason")).toBeVisible();
  await dialog(page).getByLabel("Reason").fill("Details were incomplete");
  await submitDialog(page, "Reject request");

  await expect(page.getByText("Request rejected.")).toBeVisible();
  await expect(page.getByText("The student was not emailed. Contact them directly.")).toBeVisible();
  await expect(page.getByText("Reason given to student:")).toBeVisible();
  expect(await row(1)).toMatchObject({ status: "rejected", decision_reason: "Details were incomplete" });
});

test("approving holds a place and shows the timer", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, request(2));
  await expect(page.getByText(/beds? left for this room type/)).toBeVisible();
  await decide(page, "Approve", "Approve request");
  await expect(page.getByText("Request approved and a place is on hold.")).toBeVisible();
  await expect(page.getByText("The student was not emailed. Contact them directly.")).toBeVisible();
  await expect(page.getByText(/Place held until/)).toBeVisible();
  await expect(page.getByText(/4 days 2\d hours left|5 days 0 hours left/)).toBeVisible();
  expect((await row(2)).status).toBe("approved");
  expect((await hold(2)).status).toBe("held");
});

test("no bed left is explained and the request stays open", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, request(8));
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await dialog(page).getByRole("button", { name: "Approve request" }).click();
  await expect(dialog(page).getByText(/No bed is left/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Go back" }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect((await row(8)).status).toBe("submitted");
  await decide(page, "Waitlist", "Add to waitlist");
  await expect(page.getByText("Request added to the waitlist.")).toBeVisible();
});

test("a hold can be extended once, confirmed and cancelled", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, request(4));
  await decide(page, "Extend hold", "Extend hold", { "Extra hours": "24", Reason: "Parent paying on Friday" });
  await expect(page.getByText("Hold extended.")).toBeVisible();
  await expect(page.getByText("No email is sent for this action. Tell the student directly.")).toBeVisible();
  await expect(page.getByText("Extensions used: 1.")).toBeVisible();

  await page.getByRole("button", { name: "Extend hold", exact: true }).click();
  await dialog(page).getByLabel("Reason").fill("Again");
  await dialog(page).getByRole("button", { name: "Extend hold" }).click();
  await expect(dialog(page).getByText(/used all its extensions/)).toBeVisible();
  await dialog(page).getByRole("button", { name: "Go back" }).click();
  await expect(dialog(page)).toHaveCount(0);

  await decide(page, "Confirm place", "Confirm place", { Reason: "Deposit paid in cash" });
  await expect(page.getByText("Reservation confirmed.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Extend hold", exact: true })).toHaveCount(0);
  expect((await hold(4)).status).toBe("confirmed");

  await decide(page, "Cancel booking", "Cancel booking", { Reason: "Student left" });
  await expect(page.getByText("Booking cancelled and the place released.")).toBeVisible();
  await expect(page.getByText("No actions are available for this booking.")).toBeVisible();
  expect(await row(4)).toMatchObject({ status: "cancelled", cancel_reason: "Student left" });
});

test("an old request cannot be approved, and an overdue hold says so", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, request(9));
  await expect(page.getByText(/period has ended/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);
  await audit(page, "ended period");
  await open(page, request(5));
  await expect(page.getByText("Overdue")).toBeVisible();
});

test("the capacity table counts reserved beds", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, "/t/alder-house/inventory");
  await expect(page.getByRole("heading", { name: "2040/41 Academic Year" })).toBeVisible();
  const line = page.getByText("2 reserved · 3 left").or(page.getByRole("row", { name: /^Two in a room 5 0 0 5 2 3$/ }));
  await expect(line.locator("visible=true").first()).toBeVisible();
  await audit(page, "capacity with reservations");
});

test("each role sees only what it may do", async ({ page, context }) => {
  await signIn(context, "desk");
  await open(page, request(2));
  await expect(page.getByRole("link", { name: "student2@example.com" })).toBeVisible();
  await expect(page.getByText("No actions are available for this booking.")).toBeVisible();

  await signIn(context, "reviewer");
  await open(page, BASE);
  await expect(page.getByRole("link", { name: "ALD-REQ001" }).locator("visible=true")).toBeVisible();
  await expect(page.getByText("Student 1", { exact: true })).toHaveCount(0);
  await open(page, request(2));
  await expect(page.getByText("Your role does not include student details.")).toBeVisible();
  await expect(page.getByText("student2@example.com")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  await open(page, request(4));
  await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);

  for (const who of ["pricer", "accounts"] as const) {
    await signIn(context, who);
    await open(page, BASE);
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
    await open(page, request(1));
    await expect(page.getByText(NOT_FOUND)).toBeVisible();
  }

  await signIn(context, "admin", "aal1");
  await open(page, BASE);
  await expect(page).toHaveURL(/\/mfa\/verify/);
  await signIn(context, "admin");
  await open(page, request(2));
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();

  await signIn(context, "suspended");
  await open(page, "/t/closed-hostel/reservations");
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});

test("a bad or unknown id is a 404", async ({ page, context }) => {
  await signIn(context, "manager");
  await open(page, `${BASE}/not-a-uuid`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
  await open(page, `${BASE}/70000000-0000-4000-8000-000000000099`);
  await expect(page.getByText(NOT_FOUND)).toBeVisible();
});
