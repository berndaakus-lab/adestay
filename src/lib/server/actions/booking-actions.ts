"use server";

import { randomUUID } from "node:crypto";
import { getSessionUser } from "@/lib/server/auth";
import { sendBookingEmail } from "@/lib/server/email/booking-email";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { getSiteTenant } from "@/lib/server/tenant/site";
import { fieldErrors } from "@/lib/validation/auth";
import { bookingRequestSchema } from "@/lib/validation/booking";

/**
 * A student submits a booking request (Phase 3, task 10). The hostel comes from the site being
 * served, never from the form. The RPC runs with the student's session and makes every decision.
 */
export interface BookingFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  reference?: string;
  /** false: the booking is saved but the confirmation email did not go out. */
  emailSent?: boolean;
  /** The student must verify their email with a code first. */
  needsSignIn?: boolean;
}

const UNAVAILABLE: BookingFormState = { status: "error", message: "This hostel is not taking booking requests right now." };

/** Only these known RPC messages reach the form, each with our own wording. */
const INVALID_CHOICES: Record<string, { field?: string; message: string }> = {
  "enter your student ID number": { field: "studentId", message: "Enter your student ID number" },
  "choose a gender": { field: "gender", message: "Choose an option" },
  "this room type is not available for you": { field: "roomTypeId", message: "This room type is not available for you. Choose another." },
  "this room type is not available": { field: "roomTypeId", message: "This room type is no longer available. Choose another." },
  "this room type has no price for this period": { field: "roomTypeId", message: "This room type is not available for that period." },
  "this period is not open for booking": { field: "periodId", message: "This period is not open for booking." },
};

function failure(error: { code?: string; message?: string }): BookingFormState {
  switch (error.code) {
    case "AS429":
      return { status: "error", message: "Too many booking requests. Please try again in an hour." };
    case "23505":
      return { status: "error", message: "You already have a booking request for this period. Use your reference to check its status." };
    case "22023": {
      const known = INVALID_CHOICES[error.message ?? ""];
      if (known?.field) return { status: "error", message: "Check the highlighted fields.", fieldErrors: { [known.field]: known.message } };
      return { status: "error", message: "Check your details and try again." };
    }
    case "42501":
      // One answer for an unavailable hostel, an unverified email and a blocked student.
      return { status: "error", message: "We could not accept this request. Please contact the hostel." };
    default: {
      const reference = randomUUID().slice(0, 8);
      console.error("booking submission failed", { reference, code: error.code });
      return { status: "error", message: `Could not send your request. Try again, or quote reference ${reference}.` };
    }
  }
}

export async function submitBookingRequest(_prev: BookingFormState, formData: FormData): Promise<BookingFormState> {
  const site = await getSiteTenant(String(formData.get("site") ?? ""));
  if (!site || site.tenant.status !== "active") return UNAVAILABLE;

  if (!(await getSessionUser())) {
    return { status: "error", needsSignIn: true, message: "Verify your email to send your request." };
  }

  const parsed = bookingRequestSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("submit_booking_request", {
    p_tenant_id: site.tenant.id,
    p_booking_period_id: v.periodId,
    p_room_type_id: v.roomTypeId,
    p_idempotency_key: v.idempotencyKey,
    p_full_name: v.fullName,
    p_phone_e164: v.phone,
    p_institution: v.institution,
    p_programme: v.programme,
    p_level: v.level,
    p_student_id_number: v.studentId,
    p_gender: v.gender,
    p_student_note: v.note,
  });
  if (error) return failure(error);

  const row = (Array.isArray(data) ? data[0] : null) as { request_id: string; booking_reference: string; created: boolean } | null;
  if (!row) return failure({});

  // A retry of the same submission returns the same reference and does not email again.
  if (!row.created) return { status: "success", reference: row.booking_reference };
  const delivery = await sendBookingEmail(db, row.request_id, "submitted");
  return { status: "success", reference: row.booking_reference, emailSent: delivery === "sent" };
}
