import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingLookupForm } from "@/components/site/booking-lookup-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant } from "@/lib/server/tenant/site";

export const metadata: Metadata = { title: "Check booking status", robots: { index: false } };

// Stays available while a hostel is suspended, so students can still check a booking (D-16).
async function BookingStatus({ params }: { params: PageProps<"/sites/[slug]/booking-status">["params"] }) {
  const { slug } = await params;
  const site = await getSiteTenant(slug);
  if (!site) notFound();
  const name = await getTenantDisplayName(site.tenant);
  return (
    <>
      <p className="eyebrow mb-3">{name}</p>
      <h1 className="text-4xl md:text-5xl">Check booking status</h1>
      <p className="mt-4 text-muted-foreground">Enter your reference and the email or phone number you used when you booked.</p>
      <div className="mt-8">
        <BookingLookupForm site={site.tenant.slug} />
      </div>
    </>
  );
}

export default function BookingStatusPage({ params }: PageProps<"/sites/[slug]/booking-status">) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <BookingStatus params={params} />
      </Suspense>
    </div>
  );
}
