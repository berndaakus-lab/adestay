import type { Metadata } from "next";
import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tenantStatus, type TenantStatus } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Platform overview" };

// Tenants come through RLS: platform admins with MFA see all tenants (no student or financial data).
async function TenantDirectory() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, status, created_at")
    .order("name");
  if (error) throw new Error(`Could not load tenants: ${error.message}`);

  if (!data?.length) {
    return (
      <EmptyState
        icon={<Building2 />}
        title="No hostels yet"
        description="Hostel onboarding (create tenant, domain and first admin) arrives in Phase 2."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Hostel</TableHead>
          <TableHead>Address name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="font-semibold">{t.name}</TableCell>
            <TableCell className="font-mono text-xs">{t.slug}</TableCell>
            <TableCell>
              <StatusBadge status={tenantStatus[t.status as TenantStatus]} />
            </TableCell>
            <TableCell className="tabular-nums">
              {new Date(t.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function PlatformPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="eyebrow mb-3">Platform</p>
        <h1 className="text-4xl">Hostels on AdeStay</h1>
        <p className="mt-2 text-muted-foreground">Operational status only. Student and payment data needs an audited break-glass grant.</p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <TenantDirectory />
        </Suspense>
      </div>
    </div>
  );
}
