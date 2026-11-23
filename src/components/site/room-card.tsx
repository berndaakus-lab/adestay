import Link from "next/link";
import { BedDouble } from "lucide-react";
import { MoneyAmount } from "@/components/money-amount";
import { SiteImage } from "@/components/site/site-image";
import type { Availability, PublicRoomType, RoomOffer } from "@/lib/server/tenant/public-content";
import { formatEmailDate } from "@/lib/server/email/booking-templates";
import { cn } from "@/lib/utils";

const AVAILABILITY: Record<Availability, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-success-bg text-success" },
  limited: { label: "Limited", className: "bg-warning-bg text-warning" },
  full: { label: "Fully booked", className: "bg-danger-bg text-danger" },
};

/** Never an exact count (D-4). */
export function AvailabilityBadge({ availability }: { availability: Availability }) {
  const { label, className } = AVAILABILITY[availability];
  return <span className={cn("inline-flex rounded-sm px-2 py-1 text-xs font-semibold", className)}>{label}</span>;
}

export const periodDates = (offer: Pick<RoomOffer, "startsOn" | "endsOn">) => `${formatEmailDate(offer.startsOn)} to ${formatEmailDate(offer.endsOn)}`;
export const occupancyLabel = (beds: number) => (beds === 1 ? "1 person per room" : `${beds} people per room`);
export const GENDER_LABEL = { any: "Open to all", female: "Female only", male: "Male only" } as const;

export function RoomCard({ room, offer, href, priority = false }: { room: PublicRoomType; offer?: RoomOffer; href: string; priority?: boolean }) {
  const photo = room.photos[0];
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-[4/3] bg-muted">
        {photo ? (
          <SiteImage src={photo.url} alt={photo.alt} priority={priority} sizes="(min-width: 1024px) 340px, (min-width: 640px) 50vw, 100vw" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground" aria-hidden="true">
            <BedDouble className="size-10" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-2xl">
            <Link href={href} className="underline-offset-4 hover:underline">
              {room.name}
            </Link>
          </h3>
          {offer ? <AvailabilityBadge availability={offer.availability} /> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {occupancyLabel(room.occupancy)} · {GENDER_LABEL[room.genderPolicy]}
        </p>
        <div className="mt-auto">
          {offer ? (
            <p className="text-sm">
              <MoneyAmount pesewas={offer.amountMinor} className="text-lg font-semibold" />
              <span className="text-muted-foreground"> for {offer.periodName}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Contact the hostel for prices and dates.</p>
          )}
        </div>
      </div>
    </article>
  );
}
