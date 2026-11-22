import { describe, expect, it } from "vitest";
import { brandColorSchema, contrastRatio, isReadableBrandColor } from "@/lib/brand-color";
import { dbErrorMessage } from "@/lib/db-errors";
import { parseCedisToPesewas } from "@/lib/money";
import { fieldErrors } from "@/lib/validation/auth";
import {
  bedBlockSchema,
  bookingPeriodSchema,
  inclusiveDateRange,
  roomSchema,
  roomTypePriceSchema,
  roomTypeSchema,
  slugify,
} from "@/lib/validation/inventory";

const TYPE = "20000000-0000-4000-8000-0000000000a1";
const PERIOD = "10000000-0000-4000-8000-0000000000a1";
const BED = "40000000-0000-4000-8000-0000000000a1";

describe("brand colours (criterion 3)", () => {
  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#234536", "#f7f5ef")).toBeCloseTo(9.75, 1);
  });

  it.each([["#234536", true], ["#2f5d74", true], ["#000000", true], ["#b69a61", false], ["#68765a", false], ["#767676", false], ["#ffffff", false], ["#FFFFFF", false], ["red", false]])(
    "%s readable: %s",
    (hex, expected) => expect(isReadableBrandColor(hex as string)).toBe(expected),
  );

  it("normalises input, allows empty, and refuses low contrast", () => {
    expect(brandColorSchema.parse(" #234536 ")).toBe("#234536");
    expect(brandColorSchema.parse("#2F5D74")).toBe("#2f5d74");
    expect(brandColorSchema.parse("")).toBeNull();
    expect(brandColorSchema.parse(undefined)).toBeNull();
    expect(brandColorSchema.safeParse("#b69a61").success).toBe(false);
    expect(brandColorSchema.safeParse("javascript:alert(1)").success).toBe(false);
  });
});

describe("parseCedisToPesewas", () => {
  it.each([["1,250.50", 125050], ["900", 90000], ["0.05", 5], ["19.99", 1999], ["1,000,000", 100000000], [" 12.5 ", 1250]])("%s", (text, pesewas) =>
    expect(parseCedisToPesewas(text)).toBe(pesewas),
  );
  it.each(["", "abc", "-5", "1.999", "1,25", "1e5", "12,34.00", "1.", ".5", "99999999999999999999"])("refuses %s", (text) =>
    expect(parseCedisToPesewas(text)).toBeNull(),
  );
});

describe("booking periods", () => {
  const valid = { name: "2026/27 Academic Year", kind: "academic_year", startsOn: "2026-09-01", endsOn: "2027-07-31" };

  it("accepts a period, defaults to draft, reads times as Accra (UTC)", () => {
    const v = bookingPeriodSchema.parse({ ...valid, bookingOpensAt: "2026-06-01T09:00", bookingClosesAt: "" });
    expect(v.status).toBe("draft");
    expect(v.bookingOpensAt).toBe("2026-06-01T09:00:00.000Z");
    expect(v.bookingClosesAt).toBeNull();
  });

  it.each([
    [{ endsOn: "2026-09-01" }, "endsOn"],
    [{ endsOn: "2026-08-01" }, "endsOn"],
    [{ startsOn: "2026-02-30" }, "startsOn"],
    [{ kind: "weekly" }, "kind"],
    [{ status: "deleted" }, "status"],
    [{ bookingOpensAt: "2026-06-02T09:00", bookingClosesAt: "2026-06-01T09:00" }, "bookingClosesAt"],
  ])("refuses %j", (change, field) => {
    const result = bookingPeriodSchema.safeParse({ ...valid, ...change });
    expect(result.success).toBe(false);
    if (!result.success) expect(fieldErrors(result.error)).toHaveProperty(field);
  });
});

describe("room types", () => {
  const valid = { name: "4 in a Room (En-suite)", occupancy: "4" };

  it("derives the slug and normalises amenities", () => {
    const v = roomTypeSchema.parse({ ...valid, amenities: "Wi-Fi, Desk\nWi-Fi,, Fan", isPublished: "on" });
    expect(v.slug).toBe("4-in-a-room-en-suite");
    expect(v.amenities).toEqual(["Wi-Fi", "Desk", "Fan"]);
    expect(v.isPublished).toBe(true);
    expect(v.occupancy).toBe(4);
    expect(v.sortOrder).toBe(0);
    expect(v.description).toBeNull();
  });

  it("handles accents in slugs", () => expect(slugify("Chambre à deux")).toBe("chambre-a-deux"));

  it.each([{ occupancy: "0" }, { occupancy: "13" }, { occupancy: "2.5" }, { slug: "Bad Slug!" }, { name: "x" }, { genderPolicy: "other" }])("refuses %j", (change) =>
    expect(roomTypeSchema.safeParse({ ...valid, ...change }).success).toBe(false),
  );

  it("limits amenities", () => {
    const many = Array.from({ length: 31 }, (_, i) => `a${i}`).join(",");
    expect(roomTypeSchema.safeParse({ ...valid, amenities: many }).success).toBe(false);
  });
});

describe("rooms and blocks", () => {
  it("turns empty optional fields into null", () => {
    const v = roomSchema.parse({ roomTypeId: TYPE, label: " C-214 ", block: "", genderPolicyOverride: "" });
    expect(v).toMatchObject({ label: "C-214", block: null, genderPolicyOverride: null, status: "active" });
  });

  it("refuses a room without a valid room type", () =>
    expect(roomSchema.safeParse({ roomTypeId: "1 or 1=1", label: "C-214" }).success).toBe(false));

  it("allows a one-day block, as an inclusive range", () => {
    const v = bedBlockSchema.parse({ bedId: BED, startsOn: "2026-10-01", endsOn: "2026-10-01", reason: "Leak" });
    expect(inclusiveDateRange(v.startsOn, v.endsOn)).toBe("[2026-10-01,2026-10-01]");
  });

  it("refuses a backwards block", () =>
    expect(bedBlockSchema.safeParse({ bedId: BED, startsOn: "2026-10-02", endsOn: "2026-10-01", reason: "Leak" }).success).toBe(false));
});

describe("prices", () => {
  const valid = { roomTypeId: TYPE, bookingPeriodId: PERIOD, amount: "4,500.00", deposit: "1,000" };

  it("stores pesewas", () => {
    expect(roomTypePriceSchema.parse(valid)).toMatchObject({ amount: 450000, deposit: 100000 });
    expect(roomTypePriceSchema.parse({ ...valid, deposit: undefined }).deposit).toBe(0);
  });

  it.each([{ amount: "0" }, { amount: "1,000,000.01" }, { amount: "abc" }, { deposit: "4,500.01" }, { deposit: "-1" }])("refuses %j", (change) =>
    expect(roomTypePriceSchema.safeParse({ ...valid, ...change }).success).toBe(false),
  );
});

describe("database errors", () => {
  it("maps known codes and hides unknown ones", () => {
    expect(dbErrorMessage({ code: "23505" }, { duplicate: "Taken" })).toBe("Taken");
    expect(dbErrorMessage({ code: "23P01" })).toMatch(/overlaps/);
    expect(dbErrorMessage({ code: "42501" })).toMatch(/permission/);
    expect(dbErrorMessage({ code: "XX000" })).toBeNull();
  });
});
