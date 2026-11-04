import "server-only";
import { cache } from "react";
import { getPublicSupabaseClient } from "@/lib/server/supabase/public";
import type { ResolvedTenant } from "./resolve";

/** Public hostel profile (tenant_profiles). RLS returns it only when published and the tenant is active. */
export interface PublicTenantProfile {
  displayName: string;
  tagline: string | null;
  about: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  whatsappPhone: string | null;
  address: string | null;
  digitalAddress: string | null;
  landmarkDirections: string | null;
}

export const getPublicTenantProfile = cache(async (tenant: ResolvedTenant): Promise<PublicTenantProfile | null> => {
  const { data } = await getPublicSupabaseClient()
    .from("tenant_profiles")
    .select("display_name, tagline, about, contact_phone, contact_email, whatsapp_phone, address, digital_address, landmark_directions")
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!data) return null;
  return {
    displayName: data.display_name,
    tagline: data.tagline,
    about: data.about,
    contactPhone: data.contact_phone,
    contactEmail: data.contact_email,
    whatsappPhone: data.whatsapp_phone,
    address: data.address,
    digitalAddress: data.digital_address,
    landmarkDirections: data.landmark_directions,
  };
});

/** Display name of a hostel, falling back to its slug when no public profile is available. */
export const getTenantDisplayName = cache(async (tenant: ResolvedTenant): Promise<string> => {
  const profile = await getPublicTenantProfile(tenant);
  if (profile?.displayName) return profile.displayName;
  return tenant.slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
});
