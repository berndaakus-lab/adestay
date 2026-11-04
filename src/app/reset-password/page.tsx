import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/forms";
import { getSessionUser } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant/context";

export const metadata: Metadata = { title: "Choose a new password" };

async function Reset() {
  if ((await getTenantContext()).surface !== "app") notFound();
  if (!(await getSessionUser())) {
    return (
      <p className="text-sm">
        This reset link has expired or was already used.{" "}
        <Link href="/forgot-password" className="text-primary underline decoration-brass underline-offset-4">
          Request a new link
        </Link>
        .
      </p>
    );
  }
  return <ResetPasswordForm />;
}

export default function ResetPasswordPage() {
  return (
    <AuthCard eyebrow="Account recovery" title="Choose a new password">
      <Suspense fallback={<FormSkeleton />}>
        <Reset />
      </Suspense>
    </AuthCard>
  );
}
