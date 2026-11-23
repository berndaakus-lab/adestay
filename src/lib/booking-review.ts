import type { BookingRequestStatus } from "@/lib/status";

/** The staff queue's tabs. Every request status belongs to exactly one. */
export const REVIEW_TABS = [
  { key: "review", label: "To review", statuses: ["submitted", "under_review"] },
  { key: "waitlist", label: "Waitlist", statuses: ["waitlisted"] },
  { key: "approved", label: "Approved", statuses: ["approved"] },
  { key: "closed", label: "Closed", statuses: ["rejected", "withdrawn", "expired", "cancelled", "lapsed"] },
] as const satisfies readonly { key: string; label: string; statuses: readonly BookingRequestStatus[] }[];

export type ReviewTabKey = (typeof REVIEW_TABS)[number]["key"];
export type BookingDecision = "start" | "approve" | "waitlist" | "reject" | "confirm" | "extend" | "cancel";

export const reviewTab = (key: string | undefined) => REVIEW_TABS.find((tab) => tab.key === key) ?? REVIEW_TABS[0];

/**
 * What the screen offers, from the state diagrams in BOOKING_AND_PAYMENT_FLOWS §2. This only decides
 * which buttons appear: the server action and the database repeat every rule.
 */
export function availableDecisions(
  status: string,
  reservationStatus: string | null,
  can: { review: boolean; cancel: boolean },
  periodEnded = false,
): BookingDecision[] {
  const review: BookingDecision[] = [];
  if (status === "submitted") review.push("start", "approve", "waitlist");
  if (status === "under_review") review.push("approve", "waitlist", "reject");
  if (status === "waitlisted") review.push("approve", "reject");
  if (status === "approved" && reservationStatus === "held") review.push("confirm", "extend");
  const cancel: BookingDecision[] = status === "approved" && (reservationStatus === "held" || reservationStatus === "confirmed") ? ["cancel"] : [];
  return [...(can.review ? review.filter((d) => !(periodEnded && d === "approve")) : []), ...(can.cancel ? cancel : [])];
}

/** "2 days 3 hours left", "45 minutes left" or "Overdue". */
export function holdTimeLeft(expiresAt: string, now: number): string {
  const minutes = Math.floor((Date.parse(expiresAt) - now) / 60_000);
  if (minutes < 0 || Date.parse(expiresAt) <= now) return "Overdue";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (days > 0) return `${plural(days, "day")} ${plural(hours, "hour")} left`;
  if (hours > 0) return `${plural(hours, "hour")} ${plural(minutes % 60, "minute")} left`;
  return minutes === 0 ? "Less than a minute left" : `${plural(minutes, "minute")} left`;
}

/** A safe search term for references, or null. */
export function referenceSearch(input: string | undefined): string | null {
  const term = input?.trim().toUpperCase() ?? "";
  return /^[A-Z0-9-]{1,20}$/.test(term) ? term : null;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);
