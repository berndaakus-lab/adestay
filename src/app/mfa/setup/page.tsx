import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { MfaSetup } from "@/components/auth/forms";
import { safeNextPath } from "@/lib/safe-redirect";
import { firstParam } from "@/lib/search-params";
import { getMfaState, getSessionUser } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant/context";

export const metadata: Metadata = { title: "Set up 2-step verification" };

async function Setup({ searchParams }: { searchParams: PageProps<"/mfa/setup">["searchParams"] }) {
  if ((await getTenantContext()).surface !== "app") notFound();
  const next = safeNextPath(firstParam((await searchParams).next), "/account");
  if (!(await getSessionUser())) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  // Already enrolled: verify instead of creating a second factor.
  if ((await getMfaState()).verifiedTotpFactorIds.length > 0) redirect(`/mfa/verify?next=${encodeURIComponent(next)}`);
  return <MfaSetup next={next} />;
}

export default function MfaSetupPage({ searchParams }: PageProps<"/mfa/setup">) {
  return (
    <AuthCard
      eyebrow="Account security"
      title="Set up 2-step verification"
      description="Hostel admins protect student and payment data with a code from an authenticator app, as well as a password."
    >
      <Suspense fallback={<FormSkeleton />}>
        <Setup searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
