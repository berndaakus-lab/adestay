import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";
import { getPublicSupabaseClient } from "@/lib/server/supabase/public";
import { PUBLIC_CACHE_LIFE, publicCacheEnabled, publicSiteTag } from "./public-cache";
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
  logoPath: string | null;
  heroImagePath: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  mapUrl: string | null;
  policies: string | null;
  terms: string | null;
}

async function loadPublicProfile(tenantId: string): Promise<PublicTenantProfile | null> {
  const { data, error } = await getPublicSupabaseClient()
    .from("tenant_profiles")
    .select("display_name, tagline, about, contact_phone, contact_email, whatsapp_phone, address, digital_address, landmark_directions, logo_path, hero_image_path, primary_color, accent_color, map_url, policies_md, terms_md")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  // Thrown, not returned as null, so a brief outage is never cached as "this hostel has no profile".
  if (error) {
    console.error("public profile could not be loaded", { code: error.code });
    throw new Error("Public profile could not be loaded");
  }
  if (!data) return null;
  return {
    logoPath: data.logo_path,
    heroImagePath: data.hero_image_path,
    primaryColor: data.primary_color,
    accentColor: data.accent_color,
    mapUrl: data.map_url,
    policies: data.policies_md,
    terms: data.terms_md,
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
}

async function cachedPublicProfile(tenantId: string) {
  "use cache";
  cacheLife(PUBLIC_CACHE_LIFE);
  cacheTag(publicSiteTag(tenantId));
  return loadPublicProfile(tenantId);
}

export const getPublicTenantProfile = cache(async (tenant: ResolvedTenant): Promise<PublicTenantProfile | null> => {
  // A suspended hostel has no public profile, whatever an earlier cached copy says.
  if (tenant.status !== "active") return null;
  return publicCacheEnabled() ? cachedPublicProfile(tenant.id) : loadPublicProfile(tenant.id);
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
