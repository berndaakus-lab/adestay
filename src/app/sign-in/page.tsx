import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { StaffSignInForm } from "@/components/auth/forms";
import { safeNextPath } from "@/lib/safe-redirect";
import { firstParam } from "@/lib/search-params";
import { getSessionUser } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant/context";

export const metadata: Metadata = { title: "Staff sign in" };

async function SignIn({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  if ((await getTenantContext()).surface !== "app") notFound();
  const next = safeNextPath(firstParam((await searchParams).next), "/account");
  if (await getSessionUser()) redirect(`/account/continue?next=${encodeURIComponent(next)}`);
  return <StaffSignInForm next={next} />;
}

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthCard
      eyebrow="Hostel staff"
      title="Sign in"
      description="For hostel owners, managers and staff. Students sign in on their hostel's website."
    >
      <Suspense fallback={<FormSkeleton />}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
