import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/server/actions/auth-actions";
import { requireStudentSession } from "@/lib/server/auth";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";

export const metadata: Metadata = { title: "Student portal" };

// Placeholder until the student portal is built (Phase 4).
async function Portal({ params }: { params: PageProps<"/sites/[slug]/portal">["params"] }) {
  const site = await getSiteTenant((await params).slug);
  if (!site) notFound();
  const user = await requireStudentSession(sitePath(site, "/portal"), sitePath(site, "/portal/sign-in"));
  const name = await getTenantDisplayName(site.tenant);
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        Signed in as <span className="font-semibold">{user.email}</span> at {name}.
      </p>
      <p className="text-sm text-muted-foreground">Your bookings, room and payments will appear here.</p>
      <form action={signOut}>
        <input type="hidden" name="redirectTo" value={sitePath(site, "/portal/sign-in")} />
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export default function PortalPage({ params }: PageProps<"/sites/[slug]/portal">) {
  return (
    <AuthCard eyebrow="Student portal" title="Welcome" inSite>
      <Suspense fallback={<FormSkeleton />}>
        <Portal params={params} />
      </Suspense>
    </AuthCard>
  );
}
