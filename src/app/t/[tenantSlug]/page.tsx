import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Settings2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthorizationError, requireTenantMember } from "@/lib/server/authz";

export const metadata: Metadata = { title: "Overview" };

async function Overview({ params }: { params: PageProps<"/t/[tenantSlug]">["params"] }) {
  let access;
  try {
    access = await requireTenantMember((await params).tenantSlug);
  } catch (error) {
    if (error instanceof AuthorizationError) notFound();
    throw error;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
      <div>
        <p className="eyebrow mb-3">Overview</p>
        <h1 className="text-4xl">{access.name}</h1>
        <p className="mt-2 text-muted-foreground">Bookings, beds and payments for this hostel will be managed here.</p>
      </div>
      <div className="rounded-lg border border-border bg-card">
        {/* Real figures (occupancy, pending requests, arrivals, balances) come with the phases that create them. */}
        <EmptyState
          icon={<Settings2 />}
          title="Your workspace is ready"
          description={
            access.role === "hostel_admin"
              ? "Next, the hostel's rooms, beds and prices will be set up here (Phase 2). Booking requests follow in Phase 3."
              : "Your hostel admin is setting things up. Sections you can use will appear in the menu."
          }
        />
      </div>
    </div>
  );
}

export default function OverviewPage({ params }: PageProps<"/t/[tenantSlug]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-4" aria-busy="true">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-48 w-full" />
        </div>
      }
    >
      <Overview params={params} />
    </Suspense>
  );
}
