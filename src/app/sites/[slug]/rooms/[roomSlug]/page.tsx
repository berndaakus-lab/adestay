import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { MoneyAmount } from "@/components/money-amount";
import { AvailabilityBadge, GENDER_LABEL, occupancyLabel, periodDates } from "@/components/site/room-card";
import { SiteImage } from "@/components/site/site-image";
import { SuspendedNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicRooms } from "@/lib/server/tenant/public-content";
import { getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";
import { cn } from "@/lib/utils";

type Props = PageProps<"/sites/[slug]/rooms/[roomSlug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, roomSlug } = await params;
  const site = await getSiteTenant(slug);
  if (!site) return {};
  const room = (await getPublicRooms(site.tenant)).find((r) => r.slug === roomSlug.toLowerCase());
  return room ? { title: room.name, description: room.description?.slice(0, 160) } : { title: "Room" };
}

async function RoomDetail({ params, searchParams }: Props) {
  const [{ slug, roomSlug }, query] = await Promise.all([params, searchParams]);
  const site = await getSiteTenant(slug);
  if (!site) notFound();
  const name = await getTenantDisplayName(site.tenant);
  if (site.tenant.status === "suspended") return <SuspendedNotice name={name} portalHref={sitePath(site, "/portal")} />;

  const room = (await getPublicRooms(site.tenant)).find((r) => r.slug === roomSlug.toLowerCase());
  if (!room) notFound();
  const [main, ...more] = room.photos;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-10 md:py-14">
      <Button asChild variant="ghost" className="-ml-3 mb-4">
        <Link href={sitePath(site, "/rooms")}>
          <ArrowLeft aria-hidden="true" /> All rooms
        </Link>
      </Button>
      <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <p className="eyebrow mb-3">{name}</p>
          <h1 className="text-4xl md:text-5xl">{room.name}</h1>
          <p className="mt-3 text-muted-foreground">
            {occupancyLabel(room.occupancy)} · {GENDER_LABEL[room.genderPolicy]}
          </p>
          {main ? (
            <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-lg bg-muted">
              <SiteImage src={main.url} alt={main.alt} priority sizes="(min-width: 1024px) 620px, 100vw" />
            </div>
          ) : null}
          {more.length ? (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {more.map((photo) => (
                <li key={photo.url} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-muted">
                  <SiteImage src={photo.url} alt={photo.alt} sizes="(min-width: 640px) 200px, 50vw" />
                </li>
              ))}
            </ul>
          ) : null}
          {room.description ? <p className="mt-6 whitespace-pre-line">{room.description}</p> : null}
          {room.amenities.length ? (
            <section className="mt-8">
              <h2 className="text-2xl">What is included</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {room.amenities.map((amenity) => (
                  <li key={amenity} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <section aria-labelledby="prices" className="lg:pt-16">
          <h2 id="prices" className="text-2xl">
            Prices and availability
          </h2>
          {room.offers.length ? (
            <ul className="mt-4 grid gap-3">
              {room.offers.map((offer) => (
                <li
                  key={offer.periodId}
                  className={cn("rounded-lg border bg-card p-4", offer.periodId === query.period ? "border-primary" : "border-border")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-sans text-base font-semibold">{offer.periodName}</h3>
                    <AvailabilityBadge availability={offer.availability} />
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{periodDates(offer)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Price</dt>
                      <dd><MoneyAmount pesewas={offer.amountMinor} className="font-semibold" /></dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Deposit</dt>
                      <dd>{offer.depositMinor > 0 ? <MoneyAmount pesewas={offer.depositMinor} className="font-semibold" /> : "None"}</dd>
                    </div>
                  </dl>
                  <Button asChild className="mt-4 w-full" variant={offer.availability === "full" ? "outline" : "default"}>
                    <Link href={sitePath(site, `/book?room=${encodeURIComponent(room.slug)}&period=${offer.periodId}`)}>
                      {offer.availability === "full" ? "Join the waitlist" : "Request this room"}
                      <span className="sr-only"> for {offer.periodName}</span>
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">This room is not open for booking right now.</p>
          )}
          <Button asChild variant="outline" className="mt-5 w-full">
            <Link href={sitePath(site, "/contact")}>Ask {name} about this room</Link>
          </Button>
          <p className="mt-3 text-xs text-muted-foreground">
            You request a room type. Your specific bed is assigned after approval.
          </p>
        </section>
      </div>
    </div>
  );
}

function RoomSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-16 md:px-10" aria-busy="true">
      <Skeleton className="h-12 w-2/3" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

export default function RoomPage(props: Props) {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomDetail {...props} />
    </Suspense>
  );
}
