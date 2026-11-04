import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { formatGhanaPhone, whatsappLink } from "@/lib/phone";
import type { PublicTenantProfile } from "@/lib/server/tenant/profile";

/** Header of a hostel's public site (Figma: PublicHeader). */
export function SiteHeader({ name, href }: { name: string; href: (path: string) => string }) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-4 md:px-10">
        <Link href={href("/")} aria-label={`${name} home`}>
          <Logo name={name} tagline="Student residence" />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link href={href("/#contact")}>Contact</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={href("/portal")}>Student portal</Link>
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
export function ContactBlock({ profile }: { profile: PublicTenantProfile }) {
  const phone = formatGhanaPhone(profile.contactPhone);
  return (
    <section id="contact" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 py-16 md:px-10">
      <p className="eyebrow mb-3">Find us</p>
      <h2 className="text-3xl md:text-4xl">Contact and directions</h2>
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
              <dd className="text-muted-foreground">{profile.landmarkDirections}</dd>
            </div>
          ) : null}
          {profile.contactEmail ? (
            <div>
              <dt className="font-semibold">Email</dt>
              <dd>
                <a className="text-primary underline decoration-brass underline-offset-4" href={`mailto:${profile.contactEmail}`}>
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
        </div>
      </div>
    </section>
  );
}
