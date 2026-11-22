import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BrandingImageForm, ProfileForm, type ProfileValues } from "@/components/staff/settings-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission } from "@/lib/permissions";
import { getPublicSupabaseEnv } from "@/lib/server/env";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Hostel profile" };

const COLUMNS = "display_name, tagline, about, logo_path, hero_image_path, primary_color, accent_color, contact_phone, whatsapp_phone, contact_email, address, digital_address, landmark_directions, map_url, policies_md, terms_md, is_published";

async function Profile({ params }: { params: PageProps<"/t/[tenantSlug]/settings">["params"] }) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/settings", ["settings.read", "settings.manage", "staff.manage"]);
  const db = await createSupabaseServerClient();
  const { data, error } = await db.from("tenant_profiles").select(COLUMNS).eq("tenant_id", access.tenantId).maybeSingle();
  if (error) throw new Error(`Could not load the profile (${error.code})`);
  if (!data) notFound();

  const profile = data as unknown as ProfileValues & { logo_path: string | null; hero_image_path: string | null };
  const canEdit = hasPermission(access, "settings.manage");
  const { url } = getPublicSupabaseEnv();
  const publicUrl = (path: string | null) => (path ? `${url}/storage/v1/object/public/tenant-public/${path}` : null);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="images-heading" className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 id="images-heading" className="font-heading text-xl">
          Logo and main photo
        </h2>
        <div className="grid gap-8 md:grid-cols-2">
          <BrandingImageForm tenantSlug={access.slug} kind="logo" label="Logo" help="JPEG, PNG or WebP. Shown up to 800 px wide." currentUrl={publicUrl(profile.logo_path)} canEdit={canEdit} />
          <BrandingImageForm tenantSlug={access.slug} kind="hero" label="Main photo" help="JPEG, PNG or WebP. A wide photo works best." currentUrl={publicUrl(profile.hero_image_path)} canEdit={canEdit} />
        </div>
      </section>
      <ProfileForm tenantSlug={access.slug} profile={profile} canEdit={canEdit} />
    </div>
  );
}

export default function ProfilePage({ params }: PageProps<"/t/[tenantSlug]/settings">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Profile params={params} />
    </Suspense>
  );
}
