import { formatGhs } from "@/lib/money";

export type BookingEmailEvent = "submitted" | "approved" | "rejected" | "waitlisted" | "lapsed";

export interface BookingEmailDetails {
  recipient_email: string | null;
  student_name: string;
  hostel_name: string;
  hostel_email: string | null;
  hostel_phone: string | null;
  booking_reference: string;
  room_type_name: string;
  period_name: string;
  starts_on: string;
  ends_on: string;
  quoted_amount_minor: number | string;
  quoted_deposit_minor: number | string;
  request_status: string;
  decision_reason: string | null;
  hold_expires_at: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "24 Aug 2026". Stay dates are whole days. */
export function formatEmailDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "24 Aug 2026, 14:05 GMT". Africa/Accra is UTC+0 all year. */
export function formatEmailTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} GMT`;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

interface Content {
  subject: string;
  heading: string;
  paragraphs: string[];
}

function content(event: BookingEmailEvent, d: BookingEmailDetails, deposit: bigint): Content {
  const ref = d.booking_reference;
  switch (event) {
    case "submitted":
      return {
        subject: `Booking request received: ${ref}`,
        heading: "We have your booking request",
        paragraphs: [
          `${d.hostel_name} has received your request. This does not reserve a place yet: staff will review it and we will email you with the decision.`,
          "Keep your reference. You can use it with your email or phone to check your status on the hostel's website.",
        ],
      };
    case "approved": {
      const until = d.hold_expires_at ? formatEmailTime(d.hold_expires_at) : "the time the hostel gives you";
      return {
        subject: `Your place is being held: ${ref}`,
        heading: "Your request is approved",
        paragraphs: [
          `${d.hostel_name} is holding a place for you in this room type until ${until}. Your specific bed is assigned separately.`,
          deposit > BigInt(0)
            ? `Contact the hostel to pay your deposit of ${formatGhs(deposit)} before then. If your place is not confirmed in time, the hold ends and the place is released.`
            : "Contact the hostel to confirm your place before then. If it is not confirmed in time, the hold ends and the place is released.",
        ],
      };
    }
    case "rejected":
      return {
        subject: `Update on your booking request: ${ref}`,
        heading: "We could not accept your request",
        paragraphs: [
          `${d.hostel_name} could not accept this booking request.`,
          ...(d.decision_reason ? [`Reason given: ${d.decision_reason}`] : []),
          "If you have questions, please contact the hostel.",
        ],
      };
    case "waitlisted":
      return {
        subject: `You are on the waitlist: ${ref}`,
        heading: "You are on the waitlist",
        paragraphs: [
          `${d.hostel_name} has no place to offer you right now and has added your request to its waitlist. This does not reserve a place.`,
          "We will email you if your request is approved.",
        ],
      };
    case "lapsed":
      return {
        subject: `Your hold has ended: ${ref}`,
        heading: "Your hold has ended",
        paragraphs: [
          "Your place was not confirmed in time, so the hold has ended and the place has been released.",
          `If you still need a room, please contact ${d.hostel_name} as soon as possible.`,
        ],
      };
  }
}

export function renderBookingEmail(event: BookingEmailEvent, d: BookingEmailDetails) {
  const amount = BigInt(d.quoted_amount_minor);
  const deposit = BigInt(d.quoted_deposit_minor);
  const body = content(event, d, deposit);
  const facts: [string, string][] = [
    ["Reference", d.booking_reference],
    ["Room type", d.room_type_name],
    ["Period", `${d.period_name} (${formatEmailDate(d.starts_on)} to ${formatEmailDate(d.ends_on)})`],
    ["Price", formatGhs(amount)],
    ...(deposit > BigInt(0) ? ([["Deposit", formatGhs(deposit)]] as [string, string][]) : []),
  ];
  const contact = [d.hostel_phone, d.hostel_email].filter((v): v is string => Boolean(v));
  const closing = contact.length ? `Contact ${d.hostel_name}: ${contact.join(" or ")}` : d.hostel_name;
  const greeting = `Hello ${d.student_name},`;

  const text = [
    greeting,
    "",
    ...body.paragraphs.flatMap((p) => [p, ""]),
    ...facts.map(([label, value]) => `${label}: ${value}`),
    "",
    closing,
  ].join("\n");

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f7f5ef;color:#292d2a;font-family:Arial,sans-serif;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;padding:24px 16px">
<p style="margin:0 0 16px;font-weight:700;color:#234536">${escapeHtml(d.hostel_name)}</p>
<div style="background:#ffffff;border:1px solid #dedfd9;border-radius:4px;padding:24px">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#234536">${escapeHtml(body.heading)}</h1>
<p style="margin:0 0 16px">${escapeHtml(greeting)}</p>
${body.paragraphs.map((p) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`).join("\n")}
<table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #dedfd9">
${facts.map(([label, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#5e645d;border-bottom:1px solid #dedfd9;vertical-align:top">${escapeHtml(label)}</td><td style="padding:8px 0;border-bottom:1px solid #dedfd9">${escapeHtml(value)}</td></tr>`).join("\n")}
</table>
<p style="margin:16px 0 0">${escapeHtml(closing)}</p>
</div>
</div>
</body></html>`;

  return { subject: body.subject, text, html };
}
