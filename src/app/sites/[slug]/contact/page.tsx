import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Phone } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ContactBlock } from "@/components/site/site-chrome";
import { SuspendedNotice } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicTenantProfile, getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";

export const metadata: Metadata = { title: "Contact" };

async function Contact({ params }: { params: PageProps<"/sites/[slug]/contact">["params"] }) {
  const { slug } = await params;
  const site = await getSiteTenant(slug);
  if (!site) notFound();
  const name = await getTenantDisplayName(site.tenant);
  if (site.tenant.status === "suspended") return <SuspendedNotice name={name} portalHref={sitePath(site, "/portal")} />;
  const profile = await getPublicTenantProfile(site.tenant);
  if (profile) return <ContactBlock profile={profile} headingLevel="h1" />;
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-16">
      <h1 className="text-4xl">Contact {name}</h1>
      <div className="mt-8 rounded-lg border border-border bg-card">
        <EmptyState icon={<Phone />} title="Contact details are on their way" description={`${name} is still setting up its website.`} />
      </div>
    </div>
  );
}

export default function ContactPage({ params }: PageProps<"/sites/[slug]/contact">) {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-3xl px-4 py-16" aria-busy="true"><Skeleton className="h-64 w-full" /></div>}>
      <Contact params={params} />
    </Suspense>
  );
}
