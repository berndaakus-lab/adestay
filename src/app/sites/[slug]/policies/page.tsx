import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { SuspendedNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicTenantProfile, getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";

export const metadata: Metadata = { title: "Policies" };

async function Policies({ params }: { params: PageProps<"/sites/[slug]/policies">["params"] }) {
  const { slug } = await params;
  const site = await getSiteTenant(slug);
  if (!site) notFound();
  const name = await getTenantDisplayName(site.tenant);
  if (site.tenant.status === "suspended") return <SuspendedNotice name={name} portalHref={sitePath(site, "/portal")} />;
  const profile = await getPublicTenantProfile(site.tenant);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 md:px-10 md:py-16">
      <p className="eyebrow mb-3">{name}</p>
      <h1 className="text-4xl md:text-5xl">Policies</h1>
      {/* Shown as plain text (approved 2026-11-22): React escapes it and no Markdown is parsed. */}
      {profile?.policies ? (
        <section className="mt-10">
          <h2 className="text-2xl md:text-3xl">House rules</h2>
          <p className="mt-4 whitespace-pre-line break-words">{profile.policies}</p>
        </section>
      ) : null}
      {profile?.terms ? (
        <section className="mt-10">
          <h2 className="text-2xl md:text-3xl">Booking terms</h2>
          <p className="mt-4 whitespace-pre-line break-words">{profile.terms}</p>
        </section>
      ) : null}
      {!profile?.policies && !profile?.terms ? (
        <div className="mt-8 rounded-lg border border-border bg-card">
          <EmptyState
            icon={<FileText />}
            title="Policies are on their way"
            description={`Contact ${name} to ask about its house rules and booking terms.`}
            action={
              <Button asChild variant="outline">
                <Link href={sitePath(site, "/contact")}>Contact {name}</Link>
              </Button>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

export default function PoliciesPage({ params }: PageProps<"/sites/[slug]/policies">) {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-3xl px-4 py-16" aria-busy="true"><Skeleton className="h-64 w-full" /></div>}>
      <Policies params={params} />
    </Suspense>
  );
}
