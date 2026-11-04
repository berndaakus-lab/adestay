import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { safeNextPath } from "@/lib/safe-redirect";
import { firstParam } from "@/lib/search-params";
import { requireStaffSession } from "@/lib/server/auth";
import { getTenantContext } from "@/lib/server/tenant/context";

// After sign-in: applies the MFA policy (setup or verify) before continuing to `next`.
async function Continue({ searchParams }: { searchParams: PageProps<"/account/continue">["searchParams"] }): Promise<never> {
  if ((await getTenantContext()).surface !== "app") notFound();
  const next = safeNextPath(firstParam((await searchParams).next), "/account");
  await requireStaffSession(next);
  redirect(next);
}

export default function ContinuePage({ searchParams }: PageProps<"/account/continue">) {
  return (
    <main className="flex flex-1 items-center justify-center">
      <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Signing you in…</p>}>
        <Continue searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
