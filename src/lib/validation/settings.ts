import { z } from "zod";
import { brandColorSchema } from "@/lib/brand-color";
import { parseCedisToPesewas } from "@/lib/money";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { normalizePhone } from "@/lib/phone";

/** Hostel profile, operational settings and permission sets. Limits mirror the database constraints. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} is too long (${max} characters at most)`)
    .default("")
    .transform((v) => (v === "" ? null : v));

const optionalPhone = z
  .string()
  .default("")
  .transform((value, ctx) => {
    if (value.trim() === "") return null;
    const phone = normalizePhone(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a phone number like 024 123 4567" });
      return z.NEVER;
    }
    return phone;
  });

const checkbox = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

const wholeNumber = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, `${label} must be a whole number`)
    .transform(Number)
    .pipe(z.number().min(min, `${label} must be at least ${min}`).max(max, `${label} must be at most ${max}`));

export const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Enter the hostel's name").max(120, "Name is too long"),
  tagline: optionalText(160, "Tagline"),
  about: optionalText(4000, "About"),
  primaryColor: brandColorSchema,
  accentColor: brandColorSchema,
  contactPhone: optionalPhone,
  whatsappPhone: optionalPhone,
  contactEmail: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email address is too long")
    .default("")
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid email address")
    .transform((v) => (v === "" ? null : v)),
  address: optionalText(300, "Address"),
  digitalAddress: z
    .string()
    .trim()
    .toUpperCase()
    .default("")
    .refine((v) => v === "" || /^[A-Z]{2}-[0-9]{3,4}-[0-9]{4}$/.test(v), "Use the Ghana Post GPS format, e.g. GA-123-4567")
    .transform((v) => (v === "" ? null : v)),
  landmarkDirections: optionalText(500, "Directions"),
  mapUrl: z
    .string()
    .trim()
    .max(2000, "Map link is too long")
    .default("")
    .refine((v) => {
      if (v === "") return true;
      try {
        return new URL(v).protocol === "https:" && v.startsWith("https://");
      } catch {
        return false;
      }
    }, "Enter a full link starting with https://")
    .transform((v) => (v === "" ? null : v)),
  policiesMd: optionalText(20000, "House rules"),
  termsMd: optionalText(20000, "Terms"),
  isPublished: checkbox,
});

export const operationalSettingsSchema = z
  .object({
    holdDays: wholeNumber(1, 14, "Hold period"),
    holdExtensionMax: wholeNumber(0, 3, "Extensions"),
    depositPolicy: z.enum(["none", "fixed", "percent", "full"], "Choose a deposit rule"),
    depositValue: z.string().trim().default(""),
    minPaidPercentForCheckin: wholeNumber(0, 100, "Payment needed for check-in"),
    requirePaymentBeforeAllocation: checkbox,
    studentIdRequired: checkbox,
    genderPolicyEnforced: checkbox,
  })
  .transform((v, ctx) => {
    let depositValue = 0;
    if (v.depositPolicy === "fixed") {
      const pesewas = parseCedisToPesewas(v.depositValue);
      if (pesewas === null || pesewas <= 0 || pesewas > 100_000_000) {
        ctx.addIssue({ code: "custom", path: ["depositValue"], message: "Enter the deposit in cedis, e.g. 500.00" });
        return z.NEVER;
      }
      depositValue = pesewas;
    }
    if (v.depositPolicy === "percent") {
      if (!/^\d{1,3}$/.test(v.depositValue) || Number(v.depositValue) < 1 || Number(v.depositValue) > 100) {
        ctx.addIssue({ code: "custom", path: ["depositValue"], message: "Enter a percentage from 1 to 100" });
        return z.NEVER;
      }
      depositValue = Number(v.depositValue);
    }
    return { ...v, depositValue };
  });

/** Permissions a staff set may hold: never payments.configure or staff.manage (RBAC_MATRIX §2). */
export const DELEGABLE_PERMISSIONS = PERMISSIONS.filter((p) => p !== "payments.configure" && p !== "staff.manage") as Permission[];

export const permissionSetSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(80, "Name is too long"),
  description: optionalText(300, "Description"),
  permissions: z
    .array(z.enum(DELEGABLE_PERMISSIONS as [Permission, ...Permission[]], "That permission cannot be given to staff"))
    .min(1, "Choose at least one permission")
    .transform((list) => [...new Set(list)]),
});

export const permissionSetUpdateSchema = z.object({ id: z.uuid("Choose a permission set") }).and(permissionSetSchema);

/** Stable key from a name: lowercase letters, digits and underscores, starting with a letter. */
export function permissionSetKey(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const key = /^[a-z]/.test(base) ? base : `set_${base}`;
  return (key.length < 2 ? `${key}_set` : key).slice(0, 41).replace(/_+$/, "");
}
