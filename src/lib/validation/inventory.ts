import { z } from "zod";
import { parseCedisToPesewas } from "@/lib/money";

/**
 * Inventory and pricing forms (docs/DATABASE_DESIGN.md §4.3). Shared by forms and server actions;
 * the limits mirror the database constraints, which remain the last line of defence.
 */
const MAX_PRICE_PESEWAS = 100_000_000; // GH₵ 1,000,000, same as room_type_prices_amount_range

export const idSchema = z.object({ id: z.uuid("Choose a valid record") });

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (${max} characters at most)`)
    .default("")
    .transform((v) => (v === "" ? null : v));

const wholeNumber = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,5}$/, `${label} must be a whole number`)
    .transform(Number)
    .pipe(z.number().min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`));

/** A real calendar date as YYYY-MM-DD. */
const isoDate = (label: string) =>
  z
    .string()
    .trim()
    .refine((v) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
      const date = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === v;
    }, `Enter a valid ${label}`);

/** datetime-local input. Africa/Accra is UTC+0 all year, so the wall clock is UTC. */
const optionalAccraDateTime = (label: string) =>
  z
    .string()
    .trim()
    .default("")
    .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}:00Z`).getTime())), `Enter a valid ${label}`)
    .transform((v) => (v === "" ? null : new Date(`${v}:00Z`).toISOString()));

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

const genderPolicy = z.enum(["any", "female", "male"], "Choose a gender policy");
const unitStatus = z.enum(["active", "maintenance", "retired"], "Choose a status");

// ---------------------------------------------------------------------------------------------
// Booking periods
// ---------------------------------------------------------------------------------------------
export const bookingPeriodSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(120, "Name is too long"),
    kind: z.enum(["academic_year", "semester", "vacation", "short_stay"], "Choose a period type"),
    startsOn: isoDate("start date"),
    endsOn: isoDate("end date"),
    bookingOpensAt: optionalAccraDateTime("opening time"),
    bookingClosesAt: optionalAccraDateTime("closing time"),
    status: z.enum(["draft", "open", "closed", "archived"], "Choose a status").default("draft"),
  })
  .refine((v) => v.endsOn > v.startsOn, { message: "The end date must be after the start date", path: ["endsOn"] })
  .refine((v) => !v.bookingOpensAt || !v.bookingClosesAt || v.bookingClosesAt > v.bookingOpensAt, {
    message: "Bookings must close after they open",
    path: ["bookingClosesAt"],
  });

// ---------------------------------------------------------------------------------------------
// Room types
// ---------------------------------------------------------------------------------------------
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** Comma- or line-separated list, trimmed and de-duplicated. */
const amenities = z
  .string()
  .default("")
  .transform((v) => [...new Set(v.split(/[,\n]/).map((a) => a.trim()).filter(Boolean))])
  .refine((list) => list.length <= 30, "List at most 30 amenities")
  .refine((list) => list.every((a) => a.length <= 60), "Each amenity can be at most 60 characters");

export const roomTypeSchema = z
  .object({
    name: z.string().trim().min(2, "Enter a name").max(80, "Name is too long"),
    slug: z.string().trim().toLowerCase().default(""),
    description: optionalText(4000, "Description"),
    occupancy: wholeNumber(1, 12, "Beds per room"),
    genderPolicy: genderPolicy.default("any"),
    amenities,
    isPublished: checkbox,
    sortOrder: wholeNumber(0, 10000, "Display order").default(0),
  })
  .transform((v, ctx) => {
    const slug = v.slug || slugify(v.name);
    if (!SLUG.test(slug) || slug.length > 60) {
      ctx.addIssue({ code: "custom", path: ["slug"], message: "Use lowercase letters, numbers and hyphens" });
      return z.NEVER;
    }
    return { ...v, slug };
  });

// ---------------------------------------------------------------------------------------------
// Rooms, beds, blocks
// ---------------------------------------------------------------------------------------------
const label = (max: number, name: string) =>
  z.string().trim().min(1, `Enter a ${name}`).max(max, `${name} is too long (${max} characters at most)`);

export const roomSchema = z.object({
  roomTypeId: z.uuid("Choose a room type"),
  label: label(20, "room number"),
  block: optionalText(40, "Block"),
  floor: optionalText(20, "Floor"),
  genderPolicyOverride: z
    .union([genderPolicy, z.literal("")], "Choose a gender policy")
    .default("")
    .transform((v) => (v === "" ? null : v)),
  status: unitStatus.default("active"),
  notes: optionalText(1000, "Notes"),
});

export const bedCreateSchema = z.object({
  roomId: z.uuid("Choose a room"),
  label: label(10, "bed label"),
  status: unitStatus.default("active"),
});

export const bedUpdateSchema = z.object({
  label: label(10, "bed label"),
  status: unitStatus,
});

export const bedBlockSchema = z
  .object({
    bedId: z.uuid("Choose a bed"),
    startsOn: isoDate("start date"),
    endsOn: isoDate("end date"),
    reason: z.string().trim().min(3, "Give a short reason").max(500, "Reason is too long"),
  })
  .refine((v) => v.endsOn >= v.startsOn, { message: "The end date cannot be before the start date", path: ["endsOn"] });

/** Postgres daterange literal covering both days. */
export const inclusiveDateRange = (startsOn: string, endsOn: string) => `[${startsOn},${endsOn}]`;

// ---------------------------------------------------------------------------------------------
// Prices: typed in cedis, stored in pesewas
// ---------------------------------------------------------------------------------------------
const cedis = (name: string) =>
  z.string().transform((value, ctx) => {
    const pesewas = parseCedisToPesewas(value);
    if (pesewas === null) {
      ctx.addIssue({ code: "custom", message: `Enter ${name} in cedis, e.g. 1,250.00` });
      return z.NEVER;
    }
    return pesewas;
  });

export const roomTypePriceSchema = z
  .object({
    roomTypeId: z.uuid("Choose a room type"),
    bookingPeriodId: z.uuid("Choose a booking period"),
    amount: cedis("the price"),
    deposit: cedis("the deposit").default(0),
  })
  .refine((v) => v.amount > 0, { message: "The price must be more than zero", path: ["amount"] })
  .refine((v) => v.amount <= MAX_PRICE_PESEWAS, { message: "The price cannot be over GH₵ 1,000,000", path: ["amount"] })
  .refine((v) => v.deposit <= v.amount, { message: "The deposit cannot be more than the price", path: ["deposit"] });
