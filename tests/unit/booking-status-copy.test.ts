import { describe, expect, it } from "vitest";
import { lookupStatusCopy } from "@/lib/booking-status-copy";
import { bookingRequestStatus } from "@/lib/status";

describe("lookupStatusCopy", () => {
  it.each(Object.keys(bookingRequestStatus))("explains %s", (status) => {
    const copy = lookupStatusCopy(status);
    expect(copy.style.label).toBe(bookingRequestStatus[status as keyof typeof bookingRequestStatus].label);
    expect(copy.message.length).toBeGreaterThan(10);
  });

  it("explains the lookup-only statuses", () => {
    expect(lookupStatusCopy("confirmed").style.label).toBe("Confirmed");
    expect(lookupStatusCopy("checked_in").style.label).toBe("Checked in");
  });

  it.each(["submitted", "under_review", "waitlisted"])("never implies %s holds a place", (status) => {
    expect(lookupStatusCopy(status).message).toMatch(/does not reserve a place/);
  });

  it.each(["something_new", "constructor", "__proto__", "toString"])("handles the unknown status %s safely", (status) => {
    expect(lookupStatusCopy(status).style.label).toBe("Contact the hostel");
  });
});
