/**
 * Labels and colour tones for every workflow state in docs/BOOKING_AND_PAYMENT_FLOWS.md §2.
 * UI code must use these maps instead of choosing colours per screen.
 */
export type Tone = "neutral" | "info" | "warning" | "success" | "danger";

export interface StatusStyle {
  label: string;
  tone: Tone;
}

export type BookingRequestStatus =
  | "submitted"
  | "under_review"
  | "waitlisted"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "cancelled"
  | "lapsed"
  | "expired";

export type ReservationStatus = "held" | "confirmed" | "fulfilled" | "expired" | "cancelled" | "released";

export type BedAllocationStatus = "assigned" | "occupied" | "vacated" | "cancelled";

export type InvoiceStatus = "draft" | "issued" | "partially_paid" | "paid" | "void";

export type PaymentStatus = "initiated" | "pending" | "succeeded" | "failed" | "abandoned" | "reversed";

export const bookingRequestStatus = {
  submitted: { label: "Submitted", tone: "info" },
  under_review: { label: "Under review", tone: "warning" },
  waitlisted: { label: "Waitlisted", tone: "neutral" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Declined", tone: "danger" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  lapsed: { label: "Lapsed", tone: "danger" },
  expired: { label: "Expired", tone: "neutral" },
} as const satisfies Record<BookingRequestStatus, StatusStyle>;

export const reservationStatus = {
  held: { label: "Place held", tone: "warning" },
  confirmed: { label: "Confirmed", tone: "success" },
  fulfilled: { label: "Checked in", tone: "success" },
  expired: { label: "Hold expired", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  released: { label: "Released", tone: "neutral" },
} as const satisfies Record<ReservationStatus, StatusStyle>;

export const bedAllocationStatus = {
  assigned: { label: "Bed assigned", tone: "info" },
  occupied: { label: "Occupied", tone: "success" },
  vacated: { label: "Vacated", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
} as const satisfies Record<BedAllocationStatus, StatusStyle>;

export const invoiceStatus = {
  draft: { label: "Draft", tone: "neutral" },
  issued: { label: "Due", tone: "warning" },
  partially_paid: { label: "Part paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  void: { label: "Void", tone: "neutral" },
} as const satisfies Record<InvoiceStatus, StatusStyle>;

export const paymentStatus = {
  initiated: { label: "Started", tone: "neutral" },
  pending: { label: "Awaiting confirmation", tone: "warning" },
  succeeded: { label: "Paid", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  abandoned: { label: "Not completed", tone: "neutral" },
  reversed: { label: "Reversed", tone: "danger" },
} as const satisfies Record<PaymentStatus, StatusStyle>;

export type TenantStatus = "onboarding" | "active" | "suspended" | "archived";

export const tenantStatus = {
  onboarding: { label: "Onboarding", tone: "info" },
  active: { label: "Active", tone: "success" },
  suspended: { label: "Suspended", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
} as const satisfies Record<TenantStatus, StatusStyle>;
