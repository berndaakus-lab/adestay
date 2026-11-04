import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

/** Full-page message used by 404, 403, suspended and error screens. */
export function StatePage({
  eyebrow,
  title,
  children,
  action,
  brandName,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  brandName?: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <Logo name={brandName} tagline={brandName ? "Student residence" : "Hostel management"} />
      <div>
        <p className="eyebrow mb-3">{eyebrow}</p>
        <h1 className="text-4xl md:text-5xl">{title}</h1>
        <div className="mt-4 max-w-lg text-muted-foreground">{children}</div>
      </div>
      {action ? <div>{action}</div> : null}
    </main>
  );
}

export function NotFoundState() {
  return (
    <StatePage
      eyebrow="404"
      title="We could not find that page"
      action={
        <Button asChild variant="outline">
          <Link href="/">Go to the home page</Link>
        </Button>
      }
    >
      <p>The link may be old, or the page may have moved. Check the address and try again.</p>
    </StatePage>
  );
}

export function ForbiddenState() {
  return (
    <StatePage eyebrow="403" title="You do not have access to this">
      <p>Your role at this hostel does not include this action. Ask a hostel admin if you need it.</p>
    </StatePage>
  );
}

/** Shown on a hostel's public site while the hostel's account is suspended. */
export function SuspendedNotice({ name, portalHref }: { name: string; portalHref: string }) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-20 md:px-10">
      <p className="eyebrow mb-3">Temporarily unavailable</p>
      <h1 className="text-4xl md:text-5xl">{name} is not taking bookings right now</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Online booking for this hostel is paused. If you already stay here, you can still sign in to see your
        booking, invoices and receipts.
      </p>
      <Button asChild variant="outline" className="mt-8">
        <Link href={portalHref}>Student sign in</Link>
      </Button>
    </section>
  );
}
