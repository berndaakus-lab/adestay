import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { StudentSignInForm } from "@/components/auth/forms";
import { safeNextPath } from "@/lib/safe-redirect";
import { firstParam } from "@/lib/search-params";
import { getSessionUser } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant/context";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";

export const metadata: Metadata = { title: "Student sign in" };

async function StudentSignIn({ searchParams }: { searchParams: PageProps<"/portal/sign-in">["searchParams"] }) {
  const ctx = await getTenantContext();
  if (ctx.surface !== "tenant") notFound();
  const next = safeNextPath(firstParam((await searchParams).next), "/portal");
  if (await getSessionUser()) redirect(next);
  const name = await getTenantDisplayName(ctx.tenant);
  return (
    <>
      <p className="mb-5 text-sm text-muted-foreground">Track your booking, payments and room at {name}.</p>
      <StudentSignInForm next={next} />
    </>
  );
}

export default function StudentSignInPage({ searchParams }: PageProps<"/portal/sign-in">) {
  return (
    <AuthCard eyebrow="Student portal" title="Sign in">
      <Suspense fallback={<FormSkeleton />}>
        <StudentSignIn searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
