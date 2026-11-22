import "server-only";
import { type BookingEmailDetails, type BookingEmailEvent, renderBookingEmail } from "@/lib/server/email/booking-templates";
import { type EmailDelivery, type EmailTransport, getEmailTransport, sendEmail } from "@/lib/server/email/send";

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }>;
}

/** The status a request must have for each email, so a stale call cannot send the wrong news. */
const EXPECTED_STATUS: Record<BookingEmailEvent, string> = {
  submitted: "submitted",
  approved: "approved",
  rejected: "rejected",
  waitlisted: "waitlisted",
  lapsed: "lapsed",
};

/**
 * Emails a student about their booking, after the database change has committed. Never throws:
 * a failed email must not look like a failed booking. The result lets the caller warn staff.
 *
 * Pass the caller's own session client, so RLS-level rules decide who may read the details.
 * Only the expiry job sets `asJob`, with its allow-listed service-role client.
 */
export async function sendBookingEmail(
  db: RpcClient,
  requestId: string,
  event: BookingEmailEvent,
  options: { asJob?: boolean; transport?: EmailTransport | null } = {},
): Promise<EmailDelivery> {
  const transport = options.transport === undefined ? getEmailTransport() : options.transport;
  if (!transport) return "not_configured";
  try {
    const fn = options.asJob ? "booking_email_details_for_job" : "booking_email_details";
    const { data, error } = await db.rpc(fn, { p_request_id: requestId });
    if (error) {
      console.error("booking email details failed", { code: error.code });
      return "failed";
    }
    const details = (Array.isArray(data) ? data[0] : null) as BookingEmailDetails | null;
    if (!details?.recipient_email || details.request_status !== EXPECTED_STATUS[event]) return "failed";

    const rendered = renderBookingEmail(event, details);
    return await sendEmail(
      { to: details.recipient_email, fromName: details.hostel_name, replyTo: details.hostel_email, ...rendered },
      transport,
    );
  } catch {
    console.error("booking email failed");
    return "failed";
  }
}
