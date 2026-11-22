"use server";

import { headers } from "next/headers";
import { clientAddress } from "@/lib/server/booking-lookup/client-key";
import { lookupBooking } from "@/lib/server/booking-lookup/lookup";
import { getSiteTenant } from "@/lib/server/tenant/site";
import { fieldErrors } from "@/lib/validation/auth";
import { bookingLookupSchema } from "@/lib/validation/booking";

/** Public booking lookup (Phase 3, task 11). Returns the booking's status and nothing else. */
export interface BookingLookupState {
  status: "idle" | "found" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  bookingStatus?: string;
}

const UNAVAILABLE: BookingLookupState = { status: "error", message: "Booking lookup is unavailable right now. Please try again shortly." };
const NOT_FOUND: BookingLookupState = {
  status: "error",
  message: "We could not find a booking with those details. Check your reference and the email or phone you booked with.",
};
const RATE_LIMITED: BookingLookupState = { status: "error", message: "Too many attempts. Please wait 15 minutes and try again." };

export async function lookupBookingStatus(_prev: BookingLookupState, formData: FormData): Promise<BookingLookupState> {
  const site = await getSiteTenant(String(formData.get("site") ?? ""));
  if (!site) return UNAVAILABLE;

  const parsed = bookingLookupSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { status: "error", message: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const address = clientAddress(await headers());
  if (!address) return UNAVAILABLE;

  const result = await lookupBooking(site.tenant.id, parsed.data.reference, parsed.data.contact, address);
  switch (result.outcome) {
    case "found":
      return { status: "found", bookingStatus: result.bookingStatus };
    case "not_found":
      return NOT_FOUND;
    case "rate_limited":
      return RATE_LIMITED;
    default:
      return UNAVAILABLE;
  }
}
