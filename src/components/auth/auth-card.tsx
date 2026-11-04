import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

interface AuthCardProps {
  eyebrow: string;
  title: string;
  description?: string;
  /** Hostel name on tenant sites; the platform logo on the app host. */
  brandName?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Inside a hostel site the site header already shows the brand and provides <main>. */
  inSite?: boolean;
}

/** Centred card used by every sign-in, recovery and MFA screen. */
export function AuthCard({ eyebrow, title, description, brandName, children, footer, inSite = false }: AuthCardProps) {
  const Root = inSite ? "div" : "main";
  return (
    <Root className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {inSite ? null : (
          <div className="mb-8 flex justify-center">
            <Logo name={brandName} tagline={brandName ? "Student portal" : "Hostel management"} />
          </div>
        )}
        <section className="rounded-lg border border-border bg-card p-6 sm:p-8">
          <p className="eyebrow mb-3">{eyebrow}</p>
          <h1 className="text-3xl">{title}</h1>
          {description ? <p className="mt-3 text-sm text-muted-foreground">{description}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
        {footer ? <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </Root>
  );
}

export function FormSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-4 w-24 animate-pulse rounded-sm bg-muted" />
      <div className="h-11 animate-pulse rounded-sm bg-muted" />
      <div className="h-4 w-24 animate-pulse rounded-sm bg-muted" />
      <div className="h-11 animate-pulse rounded-sm bg-muted" />
      <div className="h-11 animate-pulse rounded-sm bg-muted" />
    </div>
  );
}
