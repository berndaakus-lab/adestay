import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { brandStyle } from "@/lib/brand-style";
import { publicAssetUrl } from "@/lib/server/tenant/public-content";
import { getPublicTenantProfile, getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getPublicSite } from "@/lib/server/tenant/public-site";
import { sitePath } from "@/lib/server/tenant/site";

/**
 * Hostels are not known at build time. Next.js needs one value per parameter to check the route and
 * to store each real hostel's pages after their first visit (generateStaticParams docs, "With Cache
 * Components"). The underscore can never be a hostel slug, so this placeholder is always a 404.
 */
export function generateStaticParams() {
  return [{ slug: "_placeholder" }];
}

export async function generateMetadata({ params }: LayoutProps<"/site/[mode]/[slug]">): Promise<Metadata> {
  const { mode, slug } = await params;
  const site = await getPublicSite(mode, slug);
  if (!site) return {};
  const [name, profile] = await Promise.all([getTenantDisplayName(site.tenant), getPublicTenantProfile(site.tenant)]);
  return {
    title: { default: name, template: `%s · ${name}` },
    description: profile?.tagline ?? `Student accommodation at ${name}.`,
  };
}

// Public hostel site shell. Reached by rewrite from the hostel's own domain, or directly as a
// staging preview (/sites/{slug}) outside production.
async function SiteFrame({ params, children }: { params: LayoutProps<"/site/[mode]/[slug]">["params"]; children: ReactNode }) {
  const { mode, slug } = await params;
  const site = await getPublicSite(mode, slug);
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
      {/* At least a full screen, so the footer cannot jump into view while content streams in. */}
      <main id="main" className="flex min-h-dvh flex-1 flex-col">
        {children}
      </main>
      <SiteFooter name={name} profile={profile} />
    </div>
  );
}

export default function SiteLayout({ children, params }: LayoutProps<"/site/[mode]/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh flex-1" aria-busy="true" />}>
      <SiteFrame params={params}>{children}</SiteFrame>
    </Suspense>
  );
}
