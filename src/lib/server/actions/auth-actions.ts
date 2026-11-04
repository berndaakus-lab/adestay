"use server";

import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/safe-redirect";
import { getRequestOrigin, getSessionUser } from "@/lib/server/auth";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { getTenantContext } from "@/lib/server/tenant/context";
import {
  emailOnlySchema,
  fieldErrors,
  newPasswordSchema,
  otpCodeSchema,
  staffSignInSchema,
  totpCodeSchema,
} from "@/lib/validation/auth";

export interface FormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so a two-step form can keep the email between steps. */
  email?: string;
  step?: "email" | "code";
}

const entries = (formData: FormData) => Object.fromEntries(formData.entries());
const unavailable: FormState = { status: "error", message: "Sign-in is temporarily unavailable. Please try again shortly." };

async function requireSurface(surface: "app" | "tenant"): Promise<boolean> {
  const ctx = await getTenantContext();
  return ctx.surface === surface;
}

// ---------------------------------------------------------------------------
// Staff (app host): email + password, then MFA where required
// ---------------------------------------------------------------------------
export async function staffSignIn(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireSurface("app"))) return unavailable;
  const parsed = staffSignInSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // Same message for unknown email and wrong password: no account enumeration (T4).
    return { status: "error", message: "Email or password is incorrect.", email: parsed.data.email };
  }

  const next = safeNextPath(String(formData.get("next") ?? ""), "/account");
  redirect(`/account/continue?next=${encodeURIComponent(next)}`);
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireSurface("app"))) return unavailable;
  const parsed = emailOnlySchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const origin = await getRequestOrigin();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });
  // Always the same answer, whether or not the account exists.
  return {
    status: "success",
    message: "If an account exists for that email, a reset link is on its way. It expires in 1 hour.",
  };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireSurface("app"))) return unavailable;
  if (!(await getSessionUser())) return { status: "error", message: "Your reset link has expired. Request a new one." };
  const parsed = newPasswordSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { status: "error", message: error.message.includes("weak") ? "Choose a stronger password." : "Could not update the password." };
  }
  redirect("/account/continue?next=%2Faccount");
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const ctx = await getTenantContext();
  redirect(ctx.surface === "tenant" ? "/portal/sign-in" : "/sign-in");
}

// ---------------------------------------------------------------------------
// MFA (TOTP) enrolment and verification
// ---------------------------------------------------------------------------
export interface EnrolResult {
  factorId: string;
  qrCode: string;
  secret: string;
}

export async function startTotpEnrolment(): Promise<EnrolResult | { error: string }> {
  if (!(await getSessionUser())) return { error: "Please sign in again." };
  const supabase = await createSupabaseServerClient();

  // Remove abandoned, unverified factors so enrolment can be retried.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `AdeStay ${new Date().toISOString().slice(0, 10)}` });
  if (error || !data) return { error: "Could not start authenticator setup. Please try again." };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

export async function verifyTotp(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await getSessionUser())) return { status: "error", message: "Please sign in again." };
  const parsed = totpCodeSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: parsed.data.factorId, code: parsed.data.code });
  if (error) return { status: "error", fieldErrors: { code: "That code is not valid. Check the time on your phone and try again." } };

  redirect(safeNextPath(String(formData.get("next") ?? ""), "/account"));
}

// ---------------------------------------------------------------------------
// Students (tenant host): 6-digit email code
// ---------------------------------------------------------------------------
export async function requestStudentCode(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireSurface("tenant"))) return unavailable;
  const parsed = emailOnlySchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", step: "email", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { shouldCreateUser: true } });
  if (error) {
    const tooMany = error.status === 429 || /rate|seconds/i.test(error.message);
    return {
      status: "error",
      step: "email",
      email: parsed.data.email,
      message: tooMany ? "Too many codes requested. Wait a minute, then try again." : "We could not send a code. Please try again.",
    };
  }
  return { status: "success", step: "code", email: parsed.data.email, message: `We sent a 6-digit code to ${parsed.data.email}.` };
}

export async function verifyStudentCode(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireSurface("tenant"))) return unavailable;
  const parsed = otpCodeSchema.safeParse(entries(formData));
  if (!parsed.success) {
    return { status: "error", step: "code", email: String(formData.get("email") ?? ""), fieldErrors: fieldErrors(parsed.error) };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  if (error) {
    return { status: "error", step: "code", email: parsed.data.email, fieldErrors: { code: "That code is wrong or has expired." } };
  }
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/portal"));
}
