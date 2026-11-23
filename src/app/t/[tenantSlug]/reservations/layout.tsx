import { Suspense, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireStaffPage } from "@/lib/server/staff-page";

async function ReservationsFrame({ params, children }: { params: LayoutProps<"/t/[tenantSlug]/reservations">["params"]; children: ReactNode }) {
  const { tenantSlug } = await params;
  await requireStaffPage(tenantSlug, "/reservations", ["bookings.read"]);
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>{children}</Suspense>
    </div>
  );
}

export default function ReservationsLayout({ params, children }: LayoutProps<"/t/[tenantSlug]/reservations">) {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-64 w-full max-w-5xl" />}>
      <ReservationsFrame params={params}>{children}</ReservationsFrame>
    </Suspense>
  );
}
