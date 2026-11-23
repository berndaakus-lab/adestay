import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { brandStyle } from "@/lib/brand-style";
import { publicAssetUrl } from "@/lib/server/tenant/public-content";
import { getPublicTenantProfile, getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";

export async function generateMetadata({ params }: LayoutProps<"/sites/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const site = await getSiteTenant(slug);
  if (!site) return {};
  const [name, profile] = await Promise.all([getTenantDisplayName(site.tenant), getPublicTenantProfile(site.tenant)]);
  return {
    title: { default: name, template: `%s · ${name}` },
    description: profile?.tagline ?? `Student accommodation at ${name}.`,
  };
}

// Public hostel site shell. Reached by rewrite from the hostel's own domain, or directly as a
// staging preview (/sites/{slug}) outside production.
async function SiteFrame({ params, children }: { params: LayoutProps<"/sites/[slug]">["params"]; children: ReactNode }) {
  const { slug } = await params;
  const site = await getSiteTenant(slug);
  if (!site) notFound();
  const [name, profile] = await Promise.all([getTenantDisplayName(site.tenant), getPublicTenantProfile(site.tenant)]);
  const href = (path: string) => sitePath(site, path);

  return (
    <div className="flex flex-1 flex-col" style={brandStyle(profile?.primaryColor, profile?.accentColor)}>
      {site.mode === "preview" ? (
        <p className="bg-warning-bg px-4 py-2 text-center text-xs font-semibold text-warning" role="note">
          Staging preview of {name}&apos;s website. On a live domain this banner is not shown.
        </p>
      ) : null}
      <SiteHeader name={name} href={href} logoUrl={publicAssetUrl(profile?.logoPath)} />
      <main id="main" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter name={name} profile={profile} />
    </div>
  );
}

export default function SiteLayout({ children, params }: LayoutProps<"/sites/[slug]">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <SiteFrame params={params}>{children}</SiteFrame>
    </Suspense>
  );
}
