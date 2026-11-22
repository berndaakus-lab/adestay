"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type DbError, type DbErrorMessages } from "@/lib/db-errors";
import { authorizeStaffAction } from "@/lib/server/staff-action";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { idSchema } from "@/lib/validation/inventory";
import {
  operationalSettingsSchema,
  permissionSetKey,
  permissionSetSchema,
  permissionSetUpdateSchema,
  profileSchema,
} from "@/lib/validation/settings";

/**
 * Hostel profile, operational settings and custom permission sets (Phase 2, task 12). tenant_id
 * always comes from the membership, and writes use the user's session, so RLS stays the authority.
 */
export interface SettingsFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

const NO_PERMISSION: SettingsFormState = { status: "error", message: "You do not have permission to do that." };
const NOT_FOUND: SettingsFormState = { status: "error", message: "That record no longer exists. Refresh the page." };
const SET_MESSAGES: DbErrorMessages = {
  duplicate: "A permission set with this name already exists.",
  linked: "Staff still use this set. Move them to another set first.",
  rule: "That permission cannot be given to staff.",
};

function failure(error: DbError, messages: DbErrorMessages = {}): SettingsFormState {
  const message = dbErrorMessage(error, messages);
  if (message) return { status: "error", message };
  const reference = randomUUID().slice(0, 8);
  console.error("settings action failed", { reference, code: error.code });
  return { status: "error", message: `Could not save. Try again, or quote reference ${reference}.` };
}

export async function updateHostelProfile(tenantSlug: string, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const access = await authorizeStaffAction(tenantSlug, "settings.manage");
  if (!access) return NO_PERMISSION;
  const parsed = profileSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("tenant_profiles")
    .update({
      display_name: v.displayName,
      tagline: v.tagline,
      about: v.about,
      primary_color: v.primaryColor,
      accent_color: v.accentColor,
      contact_phone: v.contactPhone,
      whatsapp_phone: v.whatsappPhone,
      contact_email: v.contactEmail,
      address: v.address,
      digital_address: v.digitalAddress,
      landmark_directions: v.landmarkDirections,
      map_url: v.mapUrl,
      policies_md: v.policiesMd,
      terms_md: v.termsMd,
      is_published: v.isPublished,
    })
    .eq("tenant_id", access.tenantId)
    .select("tenant_id");
  if (error) return failure(error, { rule: "One of the values is not allowed. Check colours, phone numbers and links." });
  if (!data?.length) return NOT_FOUND;
  revalidatePath(`/t/${tenantSlug}`, "layout");
  revalidatePath(`/sites/${tenantSlug}`, "layout");
  return { status: "success", message: v.isPublished ? "Profile saved. It is visible on the public site." : "Profile saved. The public site stays hidden until you publish it." };
}

export async function updateOperationalSettings(tenantSlug: string, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const access = await authorizeStaffAction(tenantSlug, "settings.manage");
  if (!access) return NO_PERMISSION;
  const parsed = operationalSettingsSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("tenant_settings")
    .update({
      hold_duration_hours: v.holdDays * 24,
      hold_extension_max: v.holdExtensionMax,
      deposit_policy: v.depositPolicy,
      deposit_value: v.depositValue,
      min_paid_percent_for_checkin: v.minPaidPercentForCheckin,
      require_payment_before_allocation: v.requirePaymentBeforeAllocation,
      student_id_required: v.studentIdRequired,
      gender_policy_enforced: v.genderPolicyEnforced,
    })
    .eq("tenant_id", access.tenantId)
    .select("tenant_id");
  if (error) return failure(error);
  if (!data?.length) return NOT_FOUND;
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return { status: "success", message: "Settings saved." };
}

const permissionInput = (formData: FormData) => ({ ...Object.fromEntries(formData.entries()), permissions: formData.getAll("permissions") });

export async function createPermissionSet(tenantSlug: string, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const access = await authorizeStaffAction(tenantSlug, "staff.manage");
  if (!access) return NO_PERMISSION;
  const parsed = permissionSetSchema.safeParse(permissionInput(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("permission_sets")
    .insert({ tenant_id: access.tenantId, key: permissionSetKey(parsed.data.name), ...parsed.data })
    .select("id");
  if (error) return failure(error, SET_MESSAGES);
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return { status: "success", message: "Permission set created.", id: data?.[0]?.id };
}

export async function updatePermissionSet(tenantSlug: string, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const access = await authorizeStaffAction(tenantSlug, "staff.manage");
  if (!access) return NO_PERMISSION;
  const parsed = permissionSetUpdateSchema.safeParse(permissionInput(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("permission_sets")
    .update({ name: parsed.data.name, description: parsed.data.description, permissions: parsed.data.permissions })
    .eq("tenant_id", access.tenantId)
    .eq("id", parsed.data.id)
    .eq("is_system", false)
    .select("id");
  if (error) return failure(error, SET_MESSAGES);
  if (!data?.length) return NOT_FOUND;
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return { status: "success", message: "Saved. Staff using this set have the new permissions now.", id: parsed.data.id };
}

export async function deletePermissionSet(tenantSlug: string, _prev: SettingsFormState, formData: FormData): Promise<SettingsFormState> {
  const access = await authorizeStaffAction(tenantSlug, "staff.manage");
  if (!access) return NO_PERMISSION;
  const parsed = idSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("permission_sets")
    .delete()
    .eq("tenant_id", access.tenantId)
    .eq("id", parsed.data.id)
    .eq("is_system", false)
    .select("id");
  if (error) return failure(error, SET_MESSAGES);
  if (!data?.length) return NOT_FOUND;
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return { status: "success", message: "Permission set removed." };
}
