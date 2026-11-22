import "server-only";

/**
 * Provider-neutral email sending (decision D-9 is still open). Until a provider is chosen,
 * getEmailTransport returns null and every send reports "not_configured", so callers can warn
 * staff. Adding the provider means implementing EmailTransport in one place, here.
 */
export interface EmailMessage {
  to: string;
  fromName: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
}

export interface OutboundEmail extends Omit<EmailMessage, "fromName" | "replyTo"> {
  from: string;
  replyTo?: string;
}

export type EmailTransport = (email: OutboundEmail) => Promise<void>;
export type EmailDelivery = "sent" | "not_configured" | "failed";

export function getEmailTransport(): EmailTransport | null {
  return null;
}

const SIMPLE_ADDRESS = /^[^@\s"<>,;:\\]+@[^@\s"<>,;:\\]+\.[^@\s"<>,;:\\]+$/;
const FROM_DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/** Header values are single-line: control characters would allow header injection. */
export const headerSafe = (value: string) => value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();

export async function sendEmail(message: EmailMessage, transport: EmailTransport | null = getEmailTransport()): Promise<EmailDelivery> {
  const domain = process.env.EMAIL_FROM_DOMAIN?.trim() ?? "";
  if (!transport || !FROM_DOMAIN.test(domain)) return "not_configured";
  if (!SIMPLE_ADDRESS.test(message.to)) return "failed";

  const name = headerSafe(message.fromName).replace(/["\\]/g, "").slice(0, 80);
  const replyTo = message.replyTo && SIMPLE_ADDRESS.test(message.replyTo) ? message.replyTo : undefined;
  try {
    await transport({
      to: message.to,
      from: `"${name}" <bookings@${domain}>`,
      replyTo,
      subject: headerSafe(message.subject),
      text: message.text,
      html: message.html,
    });
    return "sent";
  } catch {
    // Nothing from the provider is logged: its errors can contain the address (T15).
    console.error("email send failed");
    return "failed";
  }
}
