import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BedDouble } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { periodDates, RoomCard } from "@/components/site/room-card";
import { SuspendedNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { firstParam } from "@/lib/search-params";
import { bookablePeriods, getPublicRooms, type PublicRoomType, type RoomOffer } from "@/lib/server/tenant/public-content";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getPublicSite } from "@/lib/server/tenant/public-site";
import { sitePath, type SiteTenant } from "@/lib/server/tenant/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Rooms" };

type Props = PageProps<"/site/[mode]/[slug]/rooms">;

interface Listing {
  site: SiteTenant;
  name: string;
  rooms: PublicRoomType[];
  periods: RoomOffer[];
}

function RoomsForPeriod({ site, name, rooms, periods, selected }: Listing & { selected: RoomOffer | undefined }) {
  const shown = selected ? rooms.filter((r) => r.offers.some((o) => o.periodId === selected.periodId)) : rooms;
  return (
    <>
      {periods.length > 1 ? (
        <nav aria-label="Booking period" className="mt-8 flex flex-wrap gap-2">
          {periods.map((period) => {
            const current = period.periodId === selected?.periodId;
            return (
              <Link
                key={period.periodId}
                href={sitePath(site, `/rooms?period=${period.periodId}`)}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-sm border px-4 text-sm font-medium",
                  current ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:bg-accent",
                )}
              >
                {period.periodName}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {selected ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {selected.periodName}: {periodDates(selected)}
        </p>
      ) : null}

      {shown.length ? (
        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((room, index) => (
            <RoomCard
              key={room.id}
              room={room}
              offer={room.offers.find((o) => o.periodId === selected?.periodId)}
              href={sitePath(site, `/rooms/${room.slug}`)}
              priority={index === 0}
            />
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-lg border border-border bg-card">
          <EmptyState
            icon={<BedDouble />}
            title="Room listings are on their way"
            description={`${name} is setting up its rooms and prices. Contact the hostel to ask about availability.`}
            action={
              <Button asChild variant="outline">
                <Link href={sitePath(site, "/contact")}>Contact {name}</Link>
              </Button>
            }
          />
        </div>
      )}
    </>
  );
}

/** Only this part reads the query string, so the default listing can be stored as a finished page. */
async function RoomsForQuery({ searchParams, ...listing }: Listing & { searchParams: Props["searchParams"] }) {
  const requested = firstParam((await searchParams).period);
  return <RoomsForPeriod {...listing} selected={listing.periods.find((p) => p.periodId === requested) ?? listing.periods[0]} />;
}

async function RoomsList({ params, searchParams }: Props) {
  const { mode, slug } = await params;
  const site = await getPublicSite(mode, slug);
  if (!site) notFound();
  const name = await getTenantDisplayName(site.tenant);
  if (site.tenant.status === "suspended") return <SuspendedNotice name={name} portalHref={sitePath(site, "/portal")} />;

  const rooms = await getPublicRooms(site.tenant);
  const listing: Listing = { site, name, rooms, periods: bookablePeriods(rooms) };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 md:px-10 md:py-16">
      <p className="eyebrow mb-3">{name}</p>
      <h1 className="text-4xl md:text-5xl">Rooms and prices</h1>
      <Suspense fallback={<RoomsForPeriod {...listing} selected={listing.periods[0]} />}>
        <RoomsForQuery {...listing} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function RoomsSkeleton() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-16 sm:grid-cols-2 md:px-10 lg:grid-cols-3" aria-busy="true">
      {[0, 1, 2].map((key) => (
        <Skeleton key={key} className="h-80 w-full" />
      ))}
    </div>
  );
}

export default function RoomsPage(props: Props) {
  return (
    <Suspense fallback={<RoomsSkeleton />}>
      <RoomsList {...props} />
    </Suspense>
  );
}
