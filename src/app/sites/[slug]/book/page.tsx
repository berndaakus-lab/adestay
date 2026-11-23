import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BedDouble } from "lucide-react";
import { StudentSignInForm } from "@/components/auth/forms";
import { EmptyState } from "@/components/empty-state";
import { BookingForm, type BookingOption } from "@/components/site/booking-form";
import { periodDates } from "@/components/site/room-card";
import { SuspendedNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { firstParam } from "@/lib/search-params";
import { signOut } from "@/lib/server/actions/auth-actions";
import { getSessionUser } from "@/lib/server/auth";
import { getPublicSupabaseClient } from "@/lib/server/supabase/public";
import { getPublicRooms } from "@/lib/server/tenant/public-content";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";

export const metadata: Metadata = { title: "Request a room" };

type Props = PageProps<"/sites/[slug]/book">;

async function Book({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const site = await getSiteTenant(slug);
  if (!site) notFound();
  const name = await getTenantDisplayName(site.tenant);
  if (site.tenant.status === "suspended") return <SuspendedNotice name={name} portalHref={sitePath(site, "/portal")} />;

  const rooms = (await getPublicRooms(site.tenant)).filter((r) => r.offers.length > 0);
  if (!rooms.length) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="text-4xl">Request a room</h1>
        <div className="mt-8 rounded-lg border border-border bg-card">
          <EmptyState
            icon={<BedDouble />}
            title="Booking is not open right now"
            description={`Contact ${name} to ask when rooms will be available.`}
            action={
              <Button asChild variant="outline">
                <Link href={sitePath(site, "/contact")}>Contact {name}</Link>
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  // Only known rooms and periods reach the form or the sign-in return link.
  const room = rooms.find((r) => r.slug === firstParam(query.room)?.toLowerCase()) ?? rooms[0];
  const offer = room.offers.find((o) => o.periodId === firstParam(query.period)) ?? room.offers[0];
  const bookPath = sitePath(site, `/book?room=${encodeURIComponent(room.slug)}&period=${offer.periodId}`);

  const user = await getSessionUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-12">
        <p className="eyebrow mb-3">{name}</p>
        <h1 className="text-4xl md:text-5xl">Request a room</h1>
        <p className="mt-4 text-muted-foreground">
          You are requesting <strong className="text-foreground">{room.name}</strong> for {offer.periodName}. First, confirm your email address.
        </p>
        <div className="mt-8 rounded-lg border border-border bg-card p-5 md:p-6">
          <h2 className="mb-5 text-2xl">Verify your email</h2>
          <StudentSignInForm next={bookPath} site={site.tenant.slug} />
        </div>
      </div>
    );
  }

  const { data: rules, error } = await getPublicSupabaseClient().rpc("booking_form_rules", { p_tenant_id: site.tenant.id });
  if (error) {
    console.error("booking form rules could not be loaded", { code: error.code });
    throw new Error("Booking form rules could not be loaded");
  }
  const rule = (Array.isArray(rules) ? rules[0] : null) as { student_id_required: boolean; gender_required: boolean } | null;
  const options: BookingOption[] = rooms.flatMap((r) =>
    r.offers.map((o) => ({
      periodId: o.periodId,
      periodName: o.periodName,
      dates: periodDates(o),
      roomTypeId: r.id,
      roomName: r.name,
      amountMinor: o.amountMinor,
      depositMinor: o.depositMinor,
      availability: o.availability,
    })),
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <p className="eyebrow mb-3">{name}</p>
      <h1 className="text-4xl md:text-5xl">Request a room</h1>
      <form action={signOut} className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <input type="hidden" name="redirectTo" value={bookPath} />
        <span className="break-all">Verified as {user.email}.</span>
        <Button type="submit" variant="link" className="h-11 px-0">
          Use a different email
        </Button>
      </form>
      <div className="mt-6">
        <BookingForm
          site={site.tenant.slug}
          hostelName={name}
          options={options}
          defaultPeriodId={offer.periodId}
          defaultRoomTypeId={room.id}
          idempotencyKey={randomUUID()}
          studentIdRequired={Boolean(rule?.student_id_required)}
          genderRequired={Boolean(rule?.gender_required)}
          roomsHref={sitePath(site, "/rooms")}
          policiesHref={sitePath(site, "/policies")}
          statusHref={sitePath(site, "/booking-status")}
        />
      </div>
    </div>
  );
}

function BookSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-12" aria-busy="true">
      <Skeleton className="h-12 w-3/4" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default function BookPage(props: Props) {
  return (
    <Suspense fallback={<BookSkeleton />}>
      <Book {...props} />
    </Suspense>
  );
}
