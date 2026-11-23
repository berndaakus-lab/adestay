"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { dbErrorMessage, type DbError } from "@/lib/db-errors";
import type { Permission } from "@/lib/permissions";
import { sendBookingEmail } from "@/lib/server/email/booking-email";
import type { BookingEmailEvent } from "@/lib/server/email/booking-templates";
import { authorizeStaffAction } from "@/lib/server/staff-action";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { bookingIdSchema, bookingReasonSchema, extendHoldSchema } from "@/lib/validation/booking";

/**
 * Staff booking decisions (Phase 3, task 12). Bind the slug in the page:
 * `approveBooking.bind(null, tenantSlug)` for useActionState.
 *
 * Every action repeats the session + MFA, membership and permission checks. The RPC runs with the
 * staff member's session and is the final authority. Because the RPC accepts any hostel the caller
 * works for, each action first confirms the record belongs to the hostel in this URL.
 */
export interface BookingReviewState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** The decision is saved, but the student was not told. Show this prominently. */
  warning?: string;
}

const NO_PERMISSION: BookingReviewState = { status: "error", message: "You do not have permission to do that." };
const NOT_FOUND: BookingReviewState = { status: "error", message: "That booking no longer exists. Refresh the page." };
const NOT_EMAILED = "The student was not emailed. Contact them directly.";
const NO_EMAIL_FOR_THIS = "No email is sent for this action. Tell the student directly.";

function failure(error: DbError, changedMessage = "This booking has changed. Refresh the page and try again."): BookingReviewState {
  if (error.code === "AS409") {
    return { status: "error", message: "No bed is left for this room type and period. You can waitlist this request instead." };
  }
  if (error.code === "55000") return { status: "error", message: changedMessage };
  const message = dbErrorMessage(error, { invalid: "Check the details and try again. An extension cannot be longer than the hostel's hold period." });
  if (message) return { status: "error", message };
  const reference = randomUUID().slice(0, 8);
  // Code only: database messages can contain submitted values (T15).
  console.error("booking review action failed", { reference, code: error.code });
  return { status: "error", message: `Could not save. Try again, or quote reference ${reference}.` };
}

interface Decision<S extends z.ZodType> {
  permission: Permission;
  table: "booking_requests" | "reservations";
  schema: S;
  rpc: string;
  args: (input: z.output<S>) => Record<string, unknown>;
  success: string;
  /** The email for this decision. Without one, staff are told to inform the student. */
  email?: BookingEmailEvent;
  /** Opening a request for review is internal, so the student needs no message. */
  silent?: boolean;
  /** Replaces the general "has changed" message for this decision. */
  changedMessage?: string;
}

async function decide<S extends z.ZodType<{ id: string }>>(tenantSlug: string, formData: FormData, decision: Decision<S>): Promise<BookingReviewState> {
  const access = await authorizeStaffAction(tenantSlug, decision.permission);
  if (!access) return NO_PERMISSION;

  const parsed = decision.schema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data as z.output<S> & { id: string };

  const db = await createSupabaseServerClient();
  const { data: owned, error: readError } = await db
    .from(decision.table)
    .select("id")
    .eq("tenant_id", access.tenantId)
    .eq("id", input.id)
    .maybeSingle();
  if (readError) return failure(readError);
  if (!owned) return NOT_FOUND;

  const { error } = await db.rpc(decision.rpc, decision.args(input));
  if (error) return failure(error, decision.changedMessage);
  revalidatePath(`/t/${tenantSlug}`, "layout");

  if (decision.silent) return { status: "success", message: decision.success };
  if (!decision.email) return { status: "success", message: decision.success, warning: NO_EMAIL_FOR_THIS };
  const delivery = await sendBookingEmail(db, input.id, decision.email);
  return delivery === "sent"
    ? { status: "success", message: `${decision.success} The student has been emailed.` }
    : { status: "success", message: decision.success, warning: NOT_EMAILED };
}

export async function startBookingReview(tenantSlug: string, _prev: BookingReviewState, formData: FormData) {
  return decide(tenantSlug, formData, {
    permission: "bookings.review",
    table: "booking_requests",
    schema: bookingIdSchema,
    rpc: "start_booking_review",
    args: (v) => ({ p_request_id: v.id }),
    success: "Request is under review.",
    silent: true,
  });
}

export async function approveBooking(tenantSlug: string, _prev: BookingReviewState, formData: FormData) {
  return decide(tenantSlug, formData, {
    permission: "bookings.review",
    table: "booking_requests",
    schema: bookingIdSchema,
    rpc: "approve_booking_request",
    args: (v) => ({ p_request_id: v.id }),
    success: "Request approved and a place is on hold.",
    email: "approved",
  });
}

export async function rejectBooking(tenantSlug: string, _prev: BookingReviewState, formData: FormData) {
  return decide(tenantSlug, formData, {
    permission: "bookings.review",
    table: "booking_requests",
    schema: bookingReasonSchema,
    rpc: "reject_booking_request",
    args: (v) => ({ p_request_id: v.id, p_reason: v.reason }),
    success: "Request rejected.",
    email: "rejected",
  });
}

export async function waitlistBooking(tenantSlug: string, _prev: BookingReviewState, formData: FormData) {
  return decide(tenantSlug, formData, {
    permission: "bookings.review",
    table: "booking_requests",
    schema: bookingIdSchema,
    rpc: "waitlist_booking_request",
    args: (v) => ({ p_request_id: v.id }),
    success: "Request added to the waitlist.",
    email: "waitlisted",
  });
}

export async function cancelBooking(tenantSlug: string, _prev: BookingReviewState, formData: FormData) {
  return decide(tenantSlug, formData, {
    permission: "bookings.cancel",
    table: "booking_requests",
    schema: bookingReasonSchema,
    rpc: "cancel_booking_request",
    args: (v) => ({ p_request_id: v.id, p_reason: v.reason }),
    success: "Booking cancelled and the place released.",
  });
}

export async function extendBookingHold(tenantSlug: string, _prev: BookingReviewState, formData: FormData) {
  return decide(tenantSlug, formData, {
    permission: "bookings.review",
    table: "reservations",
    schema: extendHoldSchema,
    rpc: "extend_hold",
    args: (v) => ({ p_reservation_id: v.id, p_hours: v.hours, p_reason: v.reason }),
    success: "Hold extended.",
    changedMessage: "This hold has used all its extensions, or it has changed. Refresh the page to check.",
  });
}

export async function confirmBookingHold(tenantSlug: string, _prev: BookingReviewState, formData: FormData) {
  return decide(tenantSlug, formData, {
    permission: "bookings.review",
    table: "reservations",
    schema: bookingReasonSchema,
    rpc: "confirm_reservation",
    args: (v) => ({ p_reservation_id: v.id, p_reason: v.reason }),
    success: "Reservation confirmed.",
  });
}
