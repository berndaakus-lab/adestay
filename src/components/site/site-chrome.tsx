import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { SiteImage } from "@/components/site/site-image";
import { Button } from "@/components/ui/button";
import { formatGhanaPhone, whatsappLink } from "@/lib/phone";
import type { PublicTenantProfile } from "@/lib/server/tenant/profile";

/** Header of a hostel's public site (Figma: PublicHeader). */
export function SiteHeader({ name, href, logoUrl }: { name: string; href: (path: string) => string; logoUrl?: string | null }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 md:px-10">
        <Link href={href("/")} className="inline-flex min-h-11 items-center gap-3">
          {logoUrl ? (
            <>
              <span className="relative size-11 shrink-0 overflow-hidden rounded-sm">
                <SiteImage src={logoUrl} alt="" sizes="44px" className="object-contain" />
              </span>
              <span className="font-heading text-lg tracking-wide text-forest">{name}</span>
            </>
          ) : (
            <Logo name={name} tagline="Student residence" />
          )}
        </Link>
        <Button asChild variant="outline" className="px-3 sm:order-3">
          <Link href={href("/portal")}>Student portal</Link>
        </Button>
        <nav aria-label="Main" className="flex w-full flex-wrap items-center gap-1 sm:order-2 sm:ml-auto sm:w-auto">
          <Button asChild variant="ghost" className="px-2 sm:px-3">
            <Link href={href("/rooms")}>Rooms</Link>
          </Button>
          <Button asChild variant="ghost" className="px-2 sm:px-3">
            <Link href={href("/policies")}>Policies</Link>
          </Button>
          <Button asChild variant="ghost" className="px-2 sm:px-3">
            <Link href={href("/contact")}>Contact</Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ name, profile }: { name: string; profile: PublicTenantProfile | null }) {
  const phone = formatGhanaPhone(profile?.contactPhone);
  return (
    <footer className="mt-auto bg-forest-deep text-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 md:flex-row md:items-end md:justify-between md:px-10">
        <Logo name={name} tagline="Student residence" inverse />
        <div className="text-sm text-[#c9d1cc]">
          {profile?.address ? <p>{profile.address}</p> : null}
          {phone ? <p>{phone}</p> : null}
          <p className="mt-2 text-xs">
            Booking powered by AdeStay
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Contact and directions block (Ghana: call, WhatsApp, Ghana Post GPS, landmark directions). */
export function ContactBlock({ profile, headingLevel = "h2" }: { profile: PublicTenantProfile; headingLevel?: "h1" | "h2" }) {
  const phone = formatGhanaPhone(profile.contactPhone);
  const Heading = headingLevel;
  return (
    <section id="contact" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 md:px-10">
      <p className="eyebrow mb-3">Find us</p>
      <Heading className="text-3xl md:text-4xl">Contact and directions</Heading>
      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <dl className="grid gap-4 text-sm">
          {profile.address ? (
            <div>
              <dt className="font-semibold">Address</dt>
              <dd className="text-muted-foreground">{profile.address}</dd>
            </div>
          ) : null}
          {profile.digitalAddress ? (
            <div>
              <dt className="font-semibold">Ghana Post GPS</dt>
              <dd className="font-mono text-muted-foreground">{profile.digitalAddress}</dd>
            </div>
          ) : null}
          {profile.landmarkDirections ? (
            <div>
              <dt className="font-semibold">Directions</dt>
              <dd className="whitespace-pre-line text-muted-foreground">{profile.landmarkDirections}</dd>
            </div>
          ) : null}
          {profile.contactEmail ? (
            <div>
              <dt className="font-semibold">Email</dt>
              <dd>
                <a className="break-all text-primary underline decoration-brass underline-offset-4" href={`mailto:${profile.contactEmail}`}>
                  {profile.contactEmail}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="flex flex-col gap-3 sm:flex-row md:flex-col md:items-start">
          {profile.contactPhone ? (
            <Button asChild>
              <a href={`tel:${profile.contactPhone}`}>Call {phone}</a>
            </Button>
          ) : null}
          {profile.whatsappPhone ? (
            <Button asChild variant="outline">
              <a href={whatsappLink(profile.whatsappPhone)} target="_blank" rel="noopener noreferrer">
                Chat on WhatsApp
              </a>
            </Button>
          ) : null}
          {profile.mapUrl?.startsWith("https://") ? (
            <Button asChild variant="outline">
              <a href={profile.mapUrl} target="_blank" rel="noopener noreferrer">
                Open map
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
