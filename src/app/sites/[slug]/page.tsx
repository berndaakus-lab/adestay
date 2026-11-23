import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BedDouble } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { RoomCard } from "@/components/site/room-card";
import { ContactBlock } from "@/components/site/site-chrome";
import { SiteImage } from "@/components/site/site-image";
import { SuspendedNotice } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getPublicRooms, publicAssetUrl } from "@/lib/server/tenant/public-content";
import { getPublicTenantProfile, getTenantDisplayName } from "@/lib/server/tenant/profile";
import { getSiteTenant, sitePath } from "@/lib/server/tenant/site";

async function HostelHome({ params }: { params: PageProps<"/sites/[slug]">["params"] }) {
  const { slug } = await params;
  const site = await getSiteTenant(slug);
  if (!site) notFound();
  const name = await getTenantDisplayName(site.tenant);
  if (site.tenant.status === "suspended") return <SuspendedNotice name={name} portalHref={sitePath(site, "/portal")} />;

  const [profile, rooms] = await Promise.all([getPublicTenantProfile(site.tenant), getPublicRooms(site.tenant)]);
  const hero = publicAssetUrl(profile?.heroImagePath);
  const featured = rooms.slice(0, 3);
  return (
    <>
      <section className="relative isolate overflow-hidden bg-forest text-white">
        {hero ? (
          <>
            <SiteImage src={hero} alt="" priority sizes="100vw" className="-z-20" />
            <div className="absolute inset-0 -z-10 bg-forest-deep/75" aria-hidden="true" />
          </>
        ) : null}
        <div className="mx-auto w-full max-w-6xl px-4 py-20 md:px-10 md:py-28">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-white">Student accommodation</p>
          <h1 className="max-w-3xl text-5xl md:text-7xl">{profile?.tagline ?? name}</h1>
          <div className="mt-6 h-px w-24 bg-[var(--site-accent,var(--brass))]" aria-hidden="true" />
          {profile?.about ? <p className="mt-6 max-w-xl whitespace-pre-line text-lg text-white">{profile.about}</p> : null}
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild variant="secondary" size="lg">
              <Link href={sitePath(site, "/rooms")}>See rooms</Link>
            </Button>
            <Button asChild variant="link" className="text-white decoration-[#d6c79f]">
              <Link href={sitePath(site, "/portal")}>Already booked? Student sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section id="rooms" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 md:px-10">
        <p className="eyebrow mb-3">Find your space</p>
        <h2 className="text-3xl md:text-4xl">Rooms</h2>
        {featured.length ? (
          <>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((room) => (
                <RoomCard key={room.id} room={room} offer={room.offers[0]} href={sitePath(site, `/rooms/${room.slug}`)} />
              ))}
            </div>
            <Button asChild variant="outline" className="mt-8">
              <Link href={sitePath(site, "/rooms")}>View all rooms and prices</Link>
            </Button>
          </>
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
      </section>

      {profile ? <ContactBlock profile={profile} /> : null}
    </>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-20 md:px-10" aria-busy="true">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-14 w-3/4" />
      <Skeleton className="h-5 w-1/2" />
    </div>
  );
}

export default function HostelHomePage({ params }: PageProps<"/sites/[slug]">) {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HostelHome params={params} />
    </Suspense>
  );
}
