import type { Metadata } from "next";
import { Suspense } from "react";
import { CreatePermissionSetForm, PermissionSetList, type PermissionSetRow } from "@/components/staff/team-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Permission sets" };

async function PermissionSets({ params }: { params: PageProps<"/t/[tenantSlug]/settings/permissions">["params"] }) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/settings/permissions", ["staff.manage"]);
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("permission_sets")
    .select("id, name, description, permissions, is_system")
    .or(`tenant_id.eq.${access.tenantId},is_system.eq.true`)
    .order("is_system", { ascending: false })
    .order("name");
  if (error) throw new Error(`Could not load permission sets (${error.code})`);
  const sets = (data ?? []) as PermissionSetRow[];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="sets-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 md:p-6">
        <div>
          <h2 id="sets-heading" className="font-heading text-xl">
            Permission sets
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Managing staff and payment gateway keys always stays with hostel admins.</p>
        </div>
        <PermissionSetList tenantSlug={access.slug} sets={sets} />
      </section>
      <section aria-labelledby="new-set-heading" className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 md:p-6">
        <h2 id="new-set-heading" className="font-heading text-xl">
          Create a custom set
        </h2>
        <CreatePermissionSetForm tenantSlug={access.slug} sets={sets} />
      </section>
    </div>
  );
}

export default function PermissionSetsPage({ params }: PageProps<"/t/[tenantSlug]/settings/permissions">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <PermissionSets params={params} />
    </Suspense>
  );
}
