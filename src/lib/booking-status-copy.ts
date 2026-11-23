import { bookingRequestStatus, type BookingRequestStatus, type StatusStyle } from "@/lib/status";

/** What a student is told about each status on the public lookup page. Status only, no details. */
const MESSAGES: Record<BookingRequestStatus, string> = {
  submitted: "The hostel has your request and will review it. It does not reserve a place yet.",
  under_review: "The hostel is reviewing your request. It does not reserve a place yet.",
  waitlisted: "You are on the waitlist. This does not reserve a place, and the hostel will contact you if one becomes available.",
  approved: "Your request is approved and a place is on hold for a limited time. Contact the hostel to pay your deposit and confirm it.",
  rejected: "The hostel could not accept this request. Contact the hostel if you have questions.",
  withdrawn: "This request was withdrawn.",
  cancelled: "This booking was cancelled. Contact the hostel if you have questions.",
  lapsed: "Your hold ended because the place was not confirmed in time. Contact the hostel if you still need a room.",
  expired: "This request has expired. Contact the hostel if you still need a room.",
};

const EXTRA: Record<string, { style: StatusStyle; message: string }> = {
  confirmed: { style: { label: "Confirmed", tone: "success" }, message: "Your place is confirmed. The hostel will tell you about your bed and check-in." },
  checked_in: { style: { label: "Checked in", tone: "success" }, message: "You have checked in. Welcome." },
};

export function lookupStatusCopy(status: string): { style: StatusStyle; message: string } {
  if (Object.hasOwn(EXTRA, status)) return EXTRA[status];
  if (Object.hasOwn(bookingRequestStatus, status)) {
    const key = status as BookingRequestStatus;
    return { style: bookingRequestStatus[key], message: MESSAGES[key] };
  }
  return { style: { label: "Contact the hostel", tone: "neutral" }, message: "Contact the hostel for an update on this booking." };
}
