import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { OperationalSettingsForm, type OperationalValues } from "@/components/staff/settings-forms";
import { Skeleton } from "@/components/ui/skeleton";
import { hasPermission } from "@/lib/permissions";
import { requireStaffPage } from "@/lib/server/staff-page";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Booking rules" };

async function Operations({ params }: { params: PageProps<"/t/[tenantSlug]/settings/operations">["params"] }) {
  const { tenantSlug } = await params;
  const access = await requireStaffPage(tenantSlug, "/settings/operations", ["settings.read", "settings.manage"]);
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from("tenant_settings")
    .select("hold_duration_hours, hold_extension_max, deposit_policy, deposit_value, min_paid_percent_for_checkin, require_payment_before_allocation, student_id_required, gender_policy_enforced")
    .eq("tenant_id", access.tenantId)
    .maybeSingle();
  if (error) throw new Error(`Could not load settings (${error.code})`);
  if (!data) notFound();
  return <OperationalSettingsForm tenantSlug={access.slug} settings={data as OperationalValues} canEdit={hasPermission(access, "settings.manage")} />;
}

export default function OperationsPage({ params }: PageProps<"/t/[tenantSlug]/settings/operations">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Operations params={params} />
    </Suspense>
  );
}
