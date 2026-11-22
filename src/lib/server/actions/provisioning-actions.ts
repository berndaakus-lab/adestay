"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type DbError, type DbErrorMessages } from "@/lib/db-errors";
import { requireStaffSession } from "@/lib/server/auth";
import { isPlatformAdmin } from "@/lib/server/authz";
import { sendInvitationEmail, type InvitationDelivery } from "@/lib/server/provisioning/invitations";
import { authorizeStaffAction } from "@/lib/server/staff-action";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { getTenantContext } from "@/lib/server/tenant/context";
import { fieldErrors } from "@/lib/validation/auth";
import {
  changeRoleSchema,
  createTenantSchema,
  firstAdminSchema,
  inviteStaffSchema,
  membershipIdSchema,
  revokeMemberSchema,
  tenantStatusSchema,
} from "@/lib/validation/provisioning";

/**
 * Tenant onboarding and staff invitations (Phase 2, task 8). Every permission decision is made by
 * an RPC running with the caller's session. The service role is used only afterwards, to send the
 * invitation email (src/lib/server/provisioning/invitations.ts).
 */
export interface ProvisioningFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  /** False when the record was saved but the email could not be sent, so the UI can offer a resend. */
  emailSent?: boolean;
}

const NO_PERMISSION: ProvisioningFormState = { status: "error", message: "You do not have permission to do that." };
const SENT = "They will get an email, or see this hostel the next time they sign in.";
const NOT_SENT = "The invitation is saved, but the email could not be sent. Use Resend to try again.";
const MEMBER_MESSAGES: DbErrorMessages = {
  duplicate: "This person is already a member or has an open invitation.",
  invalid: "Check the role and permission set, then try again.",
  rule: "A hostel must keep at least one active admin.",
};

const entries = (formData: FormData) => Object.fromEntries(formData.entries());

function failure(error: DbError, messages: DbErrorMessages): ProvisioningFormState {
  const message = dbErrorMessage(error, messages);
  if (message) return { status: "error", message };
  const reference = randomUUID().slice(0, 8);
  console.error("provisioning action failed", { reference, code: error.code });
  return { status: "error", message: `Could not save. Try again, or quote reference ${reference}.` };
}

function delivered(delivery: InvitationDelivery, id?: string): ProvisioningFormState {
  return delivery === "failed"
    ? { status: "success", message: NOT_SENT, id, emailSent: false }
    : { status: "success", message: `Invitation saved. ${SENT}`, id, emailSent: true };
}

/** Same layered check as staff actions: host, session + MFA (may redirect), then platform admin. */
async function authorizePlatformAction(): Promise<boolean> {
  if ((await getTenantContext()).surface !== "app") return false;
  await requireStaffSession("/platform");
  return isPlatformAdmin();
}

// ---------------------------------------------------------------------------------------------
// Platform: onboarding
// ---------------------------------------------------------------------------------------------
export async function createTenant(_prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = createTenantSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("create_tenant", {
    p_slug: parsed.data.slug,
    p_name: parsed.data.name,
    p_reference_prefix: parsed.data.referencePrefix,
    // Until D-1 no subdomain row is created and the hostel is reached through the staging preview.
    p_platform_root_domain: process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN || null,
    p_admin_email: parsed.data.adminEmail,
    p_legal_name: parsed.data.legalName,
  });
  if (error) {
    return failure(error, {
      duplicate: "That web address or reference prefix is already in use.",
      rule: "Check the web address and reference prefix.",
    });
  }

  const delivery = await sendInvitationEmail(parsed.data.adminEmail);
  revalidatePath("/platform", "layout");
  return delivery === "failed"
    ? { status: "success", message: `Hostel created. ${NOT_SENT}`, id: data as string, emailSent: false }
    : { status: "success", message: `Hostel created and admin invited. ${SENT}`, id: data as string, emailSent: true };
}

export async function setTenantStatus(_prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = tenantStatusSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("set_tenant_status", {
    p_tenant_id: parsed.data.tenantId,
    p_status: parsed.data.status,
    p_reason: parsed.data.reason,
  });
  if (error) {
    return failure(error, { invalid: "This hostel cannot move to that status. A new hostel needs an admin invitation first." });
  }
  revalidatePath("/platform", "layout");
  return { status: "success", message: parsed.data.status === "suspended" ? "Hostel suspended." : "Hostel is active.", id: parsed.data.tenantId };
}

export async function inviteFirstAdmin(_prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = firstAdminSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("platform_invite_hostel_admin", { p_tenant_id: parsed.data.tenantId, p_email: parsed.data.email });
  if (error) {
    return failure(error, {
      duplicate: "This hostel already has an active admin, or this address already has an invitation.",
      invalid: "Check the hostel and email address.",
    });
  }
  const delivery = await sendInvitationEmail(parsed.data.email);
  revalidatePath("/platform", "layout");
  return delivered(delivery, data as string);
}

/** Re-sends only an invitation that is really open for this hostel. */
export async function resendFirstAdminInvite(_prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = firstAdminSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("platform_hostel_admin_invitations", { p_tenant_id: parsed.data.tenantId });
  if (error) return failure(error, {});
  const open = ((data ?? []) as { membership_id: string; email: string | null; status: string }[]).find(
    (row) => row.status === "invited" && row.email === parsed.data.email,
  );
  if (!open) return { status: "error", message: "There is no open invitation for this address." };
  return delivered(await sendInvitationEmail(parsed.data.email), open.membership_id);
}

// ---------------------------------------------------------------------------------------------
// Hostel: staff (staff.manage). tenant_id comes from the membership, never from the form.
// ---------------------------------------------------------------------------------------------
export async function inviteStaff(tenantSlug: string, _prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  const access = await authorizeStaffAction(tenantSlug, "staff.manage");
  if (!access) return NO_PERMISSION;
  const parsed = inviteStaffSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("invite_staff_member", {
    p_tenant_id: access.tenantId,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_permission_set_id: parsed.data.permissionSetId,
  });
  if (error) return failure(error, MEMBER_MESSAGES);
  const delivery = await sendInvitationEmail(parsed.data.email);
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return delivered(delivery, data as string);
}

export async function resendStaffInvitation(tenantSlug: string, _prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  const access = await authorizeStaffAction(tenantSlug, "staff.manage");
  if (!access) return NO_PERMISSION;
  const parsed = membershipIdSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  // Read under RLS, so only an open invitation of this hostel can trigger an email.
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("tenant_memberships")
    .select("id, invited_email")
    .eq("tenant_id", access.tenantId)
    .eq("id", parsed.data.membershipId)
    .eq("status", "invited")
    .maybeSingle();
  if (error) return failure(error, {});
  if (!data?.invited_email) return { status: "error", message: "There is no open invitation for this person." };
  return delivered(await sendInvitationEmail(data.invited_email as string), data.id as string);
}

export async function changeMemberRole(tenantSlug: string, _prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  const access = await authorizeStaffAction(tenantSlug, "staff.manage");
  if (!access) return NO_PERMISSION;
  const parsed = changeRoleSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("change_member_role", {
    p_membership_id: parsed.data.membershipId,
    p_role: parsed.data.role,
    p_permission_set_id: parsed.data.permissionSetId,
  });
  if (error) return failure(error, MEMBER_MESSAGES);
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return { status: "success", message: "Role updated.", id: parsed.data.membershipId };
}

export async function revokeMember(tenantSlug: string, _prev: ProvisioningFormState, formData: FormData): Promise<ProvisioningFormState> {
  const access = await authorizeStaffAction(tenantSlug, "staff.manage");
  if (!access) return NO_PERMISSION;
  const parsed = revokeMemberSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("revoke_membership", { p_membership_id: parsed.data.membershipId, p_reason: parsed.data.reason });
  if (error) return failure(error, { ...MEMBER_MESSAGES, invalid: "This person's access has already been removed." });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return { status: "success", message: "Access removed.", id: parsed.data.membershipId };
}
