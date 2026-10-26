import { cn } from "@/lib/utils";

interface LogoProps {
  /** Brand name. Tenant sites pass the hostel's name; the platform uses the default. */
  name?: string;
  tagline?: string;
  /** Light version for dark backgrounds (footer, admin sidebar). */
  inverse?: boolean;
  className?: string;
}

/** Text wordmark with the house-shaped monogram from the Figma design. */
export function Logo({ name = "AdeStay", tagline = "Hostel living", inverse = false, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", inverse ? "text-white" : "text-forest", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "grid h-10 w-9 place-items-center font-heading text-xl [clip-path:polygon(50%_0,100%_20%,100%_100%,0_100%,0_20%)]",
          inverse ? "bg-brass text-forest-deep" : "bg-forest text-ivory",
        )}
      >
        {name.charAt(0).toUpperCase()}
      </span>
      <span className="flex flex-col leading-none">
        <span className="font-heading text-lg tracking-wide">{name}</span>
        {tagline ? (
          <span className={cn("mt-1 text-[0.625rem] uppercase tracking-[0.16em]", inverse ? "text-[#c9d1cc]" : "text-muted-foreground")}>
            {tagline}
          </span>
        ) : null}
      </span>
    </span>
  );
}
