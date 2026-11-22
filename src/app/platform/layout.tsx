import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/server/actions/auth-actions";
import { requireStaffSession } from "@/lib/server/auth";
import { AuthorizationError, requirePlatformAdmin } from "@/lib/server/authz";
import { getTenantContext } from "@/lib/server/tenant/context";

// Platform admin: signed in, MFA (aal2) and an active platform_admins record; 404 otherwise.
async function PlatformFrame({ children }: { children: ReactNode }) {
  if ((await getTenantContext()).surface !== "app") notFound();
  const user = await requireStaffSession("/platform");
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-forest-deep text-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 md:px-10">
          <Link href="/platform">
            <Logo inverse name="AdeStay" tagline="Platform administration" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-[#c9d1cc] sm:inline">{user.email}</span>
            <form action={signOut}>
              <input type="hidden" name="redirectTo" value="/sign-in" />
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 md:px-10">
        {children}
      </main>
    </div>
  );
}

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <PlatformFrame>{children}</PlatformFrame>
    </Suspense>
  );
}
