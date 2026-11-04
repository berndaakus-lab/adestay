import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { MfaVerifyForm } from "@/components/auth/forms";
import { safeNextPath } from "@/lib/safe-redirect";
import { firstParam } from "@/lib/search-params";
import { getMfaState, getSessionUser } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant/context";

export const metadata: Metadata = { title: "Enter your verification code" };

async function Verify({ searchParams }: { searchParams: PageProps<"/mfa/verify">["searchParams"] }) {
  if ((await getTenantContext()).surface !== "app") notFound();
  const next = safeNextPath(firstParam((await searchParams).next), "/account");
  const user = await getSessionUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  if (user.aal === "aal2") redirect(next);
  const [factorId] = (await getMfaState()).verifiedTotpFactorIds;
  if (!factorId) redirect(`/mfa/setup?next=${encodeURIComponent(next)}`);
  return <MfaVerifyForm factorId={factorId} next={next} />;
}

export default function MfaVerifyPage({ searchParams }: PageProps<"/mfa/verify">) {
  return (
    <AuthCard
      eyebrow="2-step verification"
      title="Enter your code"
      description="Open your authenticator app and enter the 6-digit code for AdeStay."
    >
      <Suspense fallback={<FormSkeleton />}>
        <Verify searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
