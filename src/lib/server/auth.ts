import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { mfaRequirement, type AssuranceLevel } from "@/lib/mfa-policy";
import { getMyMemberships } from "@/lib/server/authz";
import { isSupabaseConfigured } from "@/lib/server/env";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

/**
 * Data access layer for the signed-in user (docs/adr/0002-authn-authz.md). Identity comes from
 * a verified JWT (getClaims), never from cookies the client could edit.
 */
export interface SessionUser {
  id: string;
  email: string | null;
  aal: AssuranceLevel;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return {
    id: data.claims.sub,
    email: (data.claims.email as string | undefined) ?? null,
    aal: data.claims.aal === "aal2" ? "aal2" : "aal1",
  };
});

/** Does this account hold a platform-admin record (whatever its current MFA level)? */
const isPlatformAdminAccount = cache(async (userId: string): Promise<boolean> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .maybeSingle();
  return Boolean(data);
});

export const getMfaState = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = (data?.totp ?? []).filter((f) => f.status === "verified");
  return { verifiedTotpFactorIds: verifiedTotp.map((f) => f.id) };
});

/** Origin of this request (for auth email links). */
export async function getRequestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host) || host.endsWith(".localhost") || host.includes(".localhost:");
  const proto = h.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return `${proto}://${host}`;
}

/** Staff and platform pages: signed in, and MFA where policy requires it. */
export async function requireStaffSession(nextPath: string): Promise<SessionUser> {
  const user = await getSessionUser();
  const next = encodeURIComponent(nextPath);
  if (!user) redirect(`/sign-in?next=${next}`);

  const [memberships, platformAdmin, mfa] = await Promise.all([
    getMyMemberships(),
    isPlatformAdminAccount(user.id),
    getMfaState(),
  ]);
  const requirement = mfaRequirement({
    isHostelAdminAnywhere: memberships.some((m) => m.role === "hostel_admin"),
    isPlatformAdminAccount: platformAdmin,
    currentLevel: user.aal,
    hasVerifiedTotpFactor: mfa.verifiedTotpFactorIds.length > 0,
  });
  if (requirement === "setup") redirect(`/mfa/setup?next=${next}`);
  if (requirement === "verify") redirect(`/mfa/verify?next=${next}`);
  return user;
}

/** Student portal pages on a tenant host: signed in (email code). */
export async function requireStudentSession(nextPath: string, signInPath = "/portal/sign-in"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`${signInPath}?next=${encodeURIComponent(nextPath)}`);
  return user;
}
