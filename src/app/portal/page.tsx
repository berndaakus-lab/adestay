import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/server/actions/auth-actions";
import { requireStudentSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant/context";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";

export const metadata: Metadata = { title: "Student portal" };

// Placeholder until the student portal is built (Phase 4).
async function Portal() {
  const ctx = await getTenantContext();
  if (ctx.surface !== "tenant") notFound();
  const user = await requireStudentSession("/portal");
  const name = await getTenantDisplayName(ctx.tenant);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        Signed in as <span className="font-semibold">{user.email}</span> at {name}.
      </p>
      <p className="text-sm text-muted-foreground">Your bookings, room and payments will appear here.</p>
      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export default function PortalPage() {
  return (
    <AuthCard eyebrow="Student portal" title="Welcome">
      <Suspense fallback={<FormSkeleton />}>
        <Portal />
      </Suspense>
    </AuthCard>
  );
}
