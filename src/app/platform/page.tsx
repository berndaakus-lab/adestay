import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tenantStatus, type TenantStatus } from "@/lib/status";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";

export const metadata: Metadata = { title: "Platform overview" };

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });

const AddHostel = () => (
  <Button asChild>
    <Link href="/platform/hostels/new">Add a hostel</Link>
  </Button>
);

// Tenants come through RLS: platform admins with MFA see all tenants (no student or financial data).
async function TenantDirectory() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, slug, status, created_at")
    .order("name");
  if (error) throw new Error(`Could not load tenants: ${error.code}`);

  if (!data?.length) {
    return (
      <EmptyState
        icon={<Building2 />}
        title="No hostels yet"
        description="Add the first hostel: its web address and admin invitation take a few minutes."
        action={<AddHostel />}
      />
    );
  }

  return (
    <>
      {/* Phones: cards. Tablets and up: a table (docs/UI_UX_DESIGN_SYSTEM.md §4). */}
      <ul className="flex flex-col divide-y divide-border md:hidden">
        {data.map((t) => (
          <li key={t.id}>
            <Link href={`/platform/hostels/${t.id}`} className="flex min-h-14 flex-col gap-2 p-3 hover:bg-muted">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold break-words">{t.name}</span>
                <StatusBadge status={tenantStatus[t.status as TenantStatus]} />
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-mono">{t.slug}</span> · {formatDate(t.created_at)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden md:block">
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
                <TableCell className="font-semibold">
                  <Link href={`/platform/hostels/${t.id}`} className="text-primary underline decoration-brass underline-offset-4">
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{t.slug}</TableCell>
                <TableCell>
                  <StatusBadge status={tenantStatus[t.status as TenantStatus]} />
                </TableCell>
                <TableCell className="tabular-nums">{formatDate(t.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export default function PlatformPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Platform</p>
          <h1 className="text-4xl">Hostels on AdeStay</h1>
          <p className="mt-2 text-muted-foreground">Operational status only. Student and payment data needs an audited break-glass grant.</p>
        </div>
        <AddHostel />
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <TenantDirectory />
        </Suspense>
      </div>
    </div>
  );
}
