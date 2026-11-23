import { describe, expect, it } from "vitest";
import { availableDecisions, holdTimeLeft, referenceSearch, REVIEW_TABS, reviewTab } from "@/lib/booking-review";
import { bookingRequestStatus } from "@/lib/status";

const all = { review: true, cancel: true };

describe("review tabs", () => {
  it("place every request status in exactly one tab", () => {
    const statuses = REVIEW_TABS.flatMap((tab) => [...tab.statuses]).sort();
    expect(statuses).toEqual(Object.keys(bookingRequestStatus).sort());
  });
  it("fall back to the review tab", () => {
    expect(reviewTab("closed").key).toBe("closed");
    expect(reviewTab("nonsense").key).toBe("review");
    expect(reviewTab(undefined).key).toBe("review");
  });
});

describe("availableDecisions follows the state diagram", () => {
  it.each([
    ["submitted", null, ["start", "approve", "waitlist"]],
    ["under_review", null, ["approve", "waitlist", "reject"]],
    ["waitlisted", null, ["approve", "reject"]],
    ["approved", "held", ["confirm", "extend", "cancel"]],
    ["approved", "confirmed", ["cancel"]],
    ["approved", "fulfilled", []],
    ["rejected", null, []],
    ["withdrawn", null, []],
    ["expired", null, []],
    ["cancelled", "cancelled", []],
    ["lapsed", "expired", []],
  ])("%s with reservation %s", (status, reservation, expected) => {
    expect(availableDecisions(status, reservation, all)).toEqual(expected);
  });

  it("offers review actions only with bookings.review", () => {
    expect(availableDecisions("submitted", null, { review: false, cancel: true })).toEqual([]);
    expect(availableDecisions("approved", "held", { review: false, cancel: true })).toEqual(["cancel"]);
  });
  it("offers cancel only with bookings.cancel", () => {
    expect(availableDecisions("approved", "held", { review: true, cancel: false })).toEqual(["confirm", "extend"]);
  });
  it("offers nothing to read-only staff", () => {
    expect(availableDecisions("approved", "held", { review: false, cancel: false })).toEqual([]);
  });
  it("does not offer approval after the period has ended", () => {
    expect(availableDecisions("under_review", null, all, true)).toEqual(["waitlist", "reject"]);
    expect(availableDecisions("waitlisted", null, all, true)).toEqual(["reject"]);
  });
});

describe("holdTimeLeft", () => {
  const now = Date.parse("2027-01-01T00:00:00Z");
  const after = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  it.each([
    [3 * 1440 + 120, "3 days 2 hours left"],
    [1440 + 60, "1 day 1 hour left"],
    [125, "2 hours 5 minutes left"],
    [60, "1 hour 0 minutes left"],
    [45, "45 minutes left"],
    [1, "1 minute left"],
    [0.5, "Less than a minute left"],
    [0, "Overdue"],
    [-5, "Overdue"],
  ])("%d minutes: %s", (minutes, expected) => expect(holdTimeLeft(after(minutes), now)).toBe(expected));
});

describe("referenceSearch", () => {
  it("normalises a reference", () => expect(referenceSearch(" ald-7k3 ")).toBe("ALD-7K3"));
  it.each(["", undefined, "a%b", "a,b", "a*b", "a b", "x".repeat(21), "name(eq.1)"])("ignores %j", (input) => {
    expect(referenceSearch(input)).toBeNull();
  });
});
