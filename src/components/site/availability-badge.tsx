import { cn } from "@/lib/utils";

export type Availability = "available" | "limited" | "full";

const AVAILABILITY: Record<Availability, { label: string; className: string }> = {
  available: { label: "Available", className: "bg-success-bg text-success" },
  limited: { label: "Limited", className: "bg-warning-bg text-warning" },
  full: { label: "Fully booked", className: "bg-danger-bg text-danger" },
};

/** Never an exact count (D-4). */
export function AvailabilityBadge({ availability }: { availability: Availability }) {
  const { label, className } = AVAILABILITY[availability];
  return <span className={cn("inline-flex shrink-0 rounded-sm px-2 py-1 text-xs font-semibold", className)}>{label}</span>;
}
