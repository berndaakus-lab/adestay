import "server-only";
import { cache } from "react";
import { getPublicSupabaseClient } from "@/lib/server/supabase/public";
import type { ResolvedTenant } from "./resolve";

/** Public display name of a hostel (published profile), falling back to its slug. */
export const getTenantDisplayName = cache(async (tenant: ResolvedTenant): Promise<string> => {
  const { data } = await getPublicSupabaseClient()
    .from("tenant_profiles")
    .select("display_name")
    .eq("tenant_id", tenant.id)
    .maybeSingle<{ display_name: string }>();
  if (data?.display_name) return data.display_name;
  return tenant.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
});
