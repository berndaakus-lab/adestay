import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/server/actions/auth-actions";
import { requireStaffSession } from "@/lib/server/auth";
import { getMyMemberships, isPlatformAdmin } from "@/lib/server/authz";
import { getTenantContext } from "@/lib/server/tenant/context";

export const metadata: Metadata = { title: "Your account" };

// Temporary signed-in landing page; the staff workspace shell replaces it in task 7.
async function Account() {
  if ((await getTenantContext()).surface !== "app") notFound();
  const user = await requireStaffSession("/account");
  const [memberships, platformAdmin] = await Promise.all([getMyMemberships(), isPlatformAdmin()]);

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">Signed in as</dt>
          <dd className="font-semibold">{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">2-step verification</dt>
          <dd>
            {user.aal === "aal2" ? <Badge variant="success">Verified this session</Badge> : <Badge variant="neutral">Not used</Badge>}
          </dd>
        </div>
        {platformAdmin ? (
          <div>
            <dt className="text-muted-foreground">Platform</dt>
            <dd>
              <Badge variant="info">Platform admin</Badge>
            </dd>
          </div>
        ) : null}
      </dl>
      <div>
        <h2 className="mb-3 text-xl">Your hostels</h2>
        {memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground">You are not a member of any hostel yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {memberships.map((m) => (
              <li key={m.tenantId} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{m.name}</span>
                <Badge variant={m.role === "hostel_admin" ? "default" : "outline"}>
                  {m.role === "hostel_admin" ? "Hostel admin" : "Staff"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AuthCard eyebrow="AdeStay" title="Your account">
      <Suspense fallback={<FormSkeleton />}>
        <Account />
      </Suspense>
    </AuthCard>
  );
}
