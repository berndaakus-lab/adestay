import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forms";
import { firstParam } from "@/lib/search-params";
import { getTenantContext } from "@/lib/server/tenant/context";

export const metadata: Metadata = { title: "Reset your password" };

async function Forgot({ searchParams }: { searchParams: PageProps<"/forgot-password">["searchParams"] }) {
  if ((await getTenantContext()).surface !== "app") notFound();
  const expired = firstParam((await searchParams).expired) === "1";
  return (
    <>
      {expired ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          That link has expired or was already used. Request a new one below.
        </p>
      ) : null}
      <ForgotPasswordForm />
    </>
  );
}

export default function ForgotPasswordPage({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <AuthCard
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter the email you sign in with. We will send a link to choose a new password."
      footer={
        <Link href="/sign-in" className="text-primary underline decoration-brass underline-offset-4">
          Back to sign in
        </Link>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <Forgot searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}
