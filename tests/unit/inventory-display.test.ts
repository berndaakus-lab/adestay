import { describe, expect, it } from "vitest";
import { formatDay, parseDayRange } from "@/lib/inventory-display";
import { STAFF_NAV, visibleStaffNav } from "@/lib/staff-nav";

describe("parseDayRange", () => {
  it("shows the last blocked day of Postgres's canonical range", () => {
    expect(parseDayRange("[2026-10-01,2026-10-16)")).toEqual({ start: "2026-10-01", end: "2026-10-15" });
  });
  it("handles a one-day block, month ends and leap days", () => {
    expect(parseDayRange("[2026-10-01,2026-10-02)")).toEqual({ start: "2026-10-01", end: "2026-10-01" });
    expect(parseDayRange("[2026-12-31,2027-01-01)")).toEqual({ start: "2026-12-31", end: "2026-12-31" });
    expect(parseDayRange("[2028-02-28,2028-03-01)")).toEqual({ start: "2028-02-28", end: "2028-02-29" });
  });
  it("handles other bounds", () => {
    expect(parseDayRange("(2026-10-01,2026-10-05]")).toEqual({ start: "2026-10-02", end: "2026-10-05" });
  });
  it.each(["", "empty", "[2026-10-01,)", "nonsense"])("refuses %s", (range) => expect(parseDayRange(range)).toBeNull());
});

describe("formatDay", () => {
  it("does not shift the calendar day", () => {
    expect(formatDay("2026-09-01")).toBe("1 Sept 2026".replace("Sept", new Date("2026-09-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })));
  });
});

describe("inventory menu", () => {
  const access = (permissions: string[]) => ({ tenantId: "t", slug: "s", name: "n", role: "staff" as const, permissions });
  const shows = (permissions: string[]) => visibleStaffNav(access(permissions)).some((item) => item.path === "/inventory");

  it("is live", () => expect(STAFF_NAV.find((item) => item.path === "/inventory")?.comingIn).toBeUndefined());
  it.each(["inventory.read", "inventory.manage", "pricing.manage"])("shows for %s", (permission) => expect(shows([permission])).toBe(true));
  it("is hidden from staff without an inventory permission", () => expect(shows(["finance.read"])).toBe(false));
});
