import { z } from "zod";
import { emailOnlySchema } from "@/lib/validation/auth";

/** Tenant onboarding and staff invitations. Limits mirror the database constraints. */
const email = emailOnlySchema.shape.email;

/** Same list as the tenants_slug_not_reserved constraint. */
export const RESERVED_SLUGS = ["app", "www", "api", "admin", "platform", "mail", "staging", "status", "help", "support"];

export const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Enter the hostel name").max(120, "Name is too long"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Use 3-40 lowercase letters, numbers and hyphens")
    .refine((v) => !RESERVED_SLUGS.includes(v), "This web address is reserved"),
  referencePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,4}$/, "Use 2-4 letters, e.g. ALD"),
  legalName: z
    .string()
    .trim()
    .max(200, "Legal name is too long")
    .default("")
    .transform((v) => (v === "" ? null : v)),
  adminEmail: email,
});

export const tenantStatusSchema = z.object({
  tenantId: z.uuid("Choose a hostel"),
  status: z.enum(["active", "suspended"], "Choose a status"),
  reason: z.string().trim().min(3, "Give a short reason").max(500, "Reason is too long"),
});

export const firstAdminSchema = z.object({ tenantId: z.uuid("Choose a hostel"), email });

export const membershipIdSchema = z.object({ membershipId: z.uuid("Choose a team member") });

const roleFields = {
  role: z.enum(["hostel_admin", "staff"], "Choose a role"),
  permissionSetId: z
    .union([z.uuid("Choose a permission set"), z.literal("")])
    .default("")
    .transform((v) => (v === "" ? null : v)),
};

type RoleInput = { role: "hostel_admin" | "staff"; permissionSetId: string | null };
const staffNeedsSet = (v: RoleInput) => v.role === "hostel_admin" || v.permissionSetId !== null;
const adminHasNoSet = (v: RoleInput) => v.role === "staff" || v.permissionSetId === null;
const NEEDS_SET = { message: "Choose a permission set", path: ["permissionSetId"] };
const NO_SET = { message: "Hostel admins have every permission, so no set applies", path: ["permissionSetId"] };

export const inviteStaffSchema = z.object({ email, ...roleFields }).refine(staffNeedsSet, NEEDS_SET).refine(adminHasNoSet, NO_SET);

export const changeRoleSchema = z
  .object({ membershipId: z.uuid("Choose a team member"), ...roleFields })
  .refine(staffNeedsSet, NEEDS_SET)
  .refine(adminHasNoSet, NO_SET);

export const revokeMemberSchema = z.object({
  membershipId: z.uuid("Choose a team member"),
  reason: z.string().trim().min(3, "Give a short reason").max(500, "Reason is too long"),
});
