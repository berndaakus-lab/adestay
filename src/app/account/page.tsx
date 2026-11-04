import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth/auth-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/server/actions/auth-actions";
import { requireStaffSession } from "@/lib/server/auth";
import { getMyMemberships, isPlatformAdmin } from "@/lib/server/authz";
import { getTenantContext } from "@/lib/server/tenant/context";

export const metadata: Metadata = { title: "Choose a workspace" };

// Landing after staff sign-in: one hostel goes straight to its workspace; otherwise choose.
async function Account() {
  if ((await getTenantContext()).surface !== "app") notFound();
  const user = await requireStaffSession("/account");
  const [memberships, platformAdmin] = await Promise.all([getMyMemberships(), isPlatformAdmin()]);
  if (memberships.length === 1 && !platformAdmin) redirect(`/t/${memberships[0].slug}`);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm">
        Signed in as <span className="font-semibold">{user.email}</span>
        {user.aal === "aal2" ? (
          <Badge variant="success" className="ml-2">
            2-step verified
          </Badge>
        ) : null}
      </p>
      {memberships.length === 0 && !platformAdmin ? (
        <p className="text-sm text-muted-foreground">
          You are not a member of any hostel yet. Ask the hostel&apos;s admin to invite you.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {platformAdmin ? (
            <li>
              <Link href="/platform" className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted">
                <span className="font-semibold">Platform administration</span>
                <Badge variant="info">Platform admin</Badge>
              </Link>
            </li>
          ) : null}
          {memberships.map((m) => (
            <li key={m.tenantId}>
              <Link href={`/t/${m.slug}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted">
                <span className="font-semibold">{m.name}</span>
                <Badge variant={m.role === "hostel_admin" ? "default" : "outline"}>
                  {m.role === "hostel_admin" ? "Hostel admin" : "Staff"}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={signOut}>
        <input type="hidden" name="redirectTo" value="/sign-in" />
        <Button type="submit" variant="outline" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}

export default function AccountPage() {
  return (
    <AuthCard eyebrow="AdeStay" title="Choose a workspace">
      <Suspense fallback={<FormSkeleton />}>
        <Account />
      </Suspense>
    </AuthCard>
  );
}
