import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { StudentSignInForm } from "@/components/auth/forms";
import { safeNextPath } from "@/lib/safe-redirect";
import { firstParam } from "@/lib/search-params";
import { getSessionUser } from "@/lib/server/auth";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";

export const metadata: Metadata = { title: "Student sign in" };

async function StudentSignIn({
  params,
  searchParams,
}: {
  params: PageProps<"/sites/[slug]/portal/sign-in">["params"];
  searchParams: PageProps<"/sites/[slug]/portal/sign-in">["searchParams"];
}) {
  const site = await getSiteTenant((await params).slug);
  if (!site) notFound();
  const next = safeNextPath(firstParam((await searchParams).next), sitePath(site, "/portal"));
  if (await getSessionUser()) redirect(next);
  const name = await getTenantDisplayName(site.tenant);
  return (
    <>
      <p className="mb-5 text-sm text-muted-foreground">Track your booking, payments and room at {name}.</p>
      <StudentSignInForm next={next} site={site.tenant.slug} />
    </>
  );
}

export default function StudentSignInPage({ params, searchParams }: PageProps<"/sites/[slug]/portal/sign-in">) {
  return (
    <AuthCard eyebrow="Student portal" title="Sign in" inSite>
      <Suspense fallback={<FormSkeleton />}>
        <StudentSignIn params={params} searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
