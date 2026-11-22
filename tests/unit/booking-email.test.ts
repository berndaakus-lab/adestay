import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendBookingEmail } from "@/lib/server/email/booking-email";
import { type BookingEmailDetails, type BookingEmailEvent, formatEmailDate, formatEmailTime, renderBookingEmail } from "@/lib/server/email/booking-templates";
import { type OutboundEmail, getEmailTransport, headerSafe, sendEmail } from "@/lib/server/email/send";

vi.mock("server-only", () => ({}));

const details = (change: Partial<BookingEmailDetails> = {}): BookingEmailDetails => ({
  recipient_email: "ama@example.com",
  student_name: "Ama Mensah",
  hostel_name: "Alder House",
  hostel_email: "hello@alder.example.com",
  hostel_phone: "+233241111111",
  booking_reference: "ALD-7K3Q9P",
  room_type_name: "2 in a room",
  period_name: "2027/28 Year",
  starts_on: "2027-09-01",
  ends_on: "2028-07-31",
  quoted_amount_minor: 450000,
  quoted_deposit_minor: 100000,
  request_status: "approved",
  decision_reason: null,
  hold_expires_at: "2027-06-01T14:05:00+00:00",
  ...change,
});

const message = { to: "ama@example.com", fromName: "Alder House", replyTo: "hello@alder.example.com", subject: "Hello", text: "t", html: "<p>h</p>" };
const client = (data: unknown, error: { code?: string } | null = null) => ({ rpc: vi.fn(async () => ({ data, error })) });

beforeEach(() => {
  vi.stubEnv("EMAIL_FROM_DOMAIN", "adestay.example.com");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("booking email content", () => {
  it("formats dates and times as the design system does", () => {
    expect(formatEmailDate("2027-09-01")).toBe("1 Sep 2027");
    expect(formatEmailTime("2027-06-01T14:05:00+00:00")).toBe("1 Jun 2027, 14:05 GMT");
  });

  it.each<[BookingEmailEvent, RegExp, RegExp]>([
    ["submitted", /received: ALD-7K3Q9P/, /does not reserve a place/],
    ["approved", /being held: ALD-7K3Q9P/, /until 1 Jun 2027, 14:05 GMT/],
    ["rejected", /Update on your booking request/, /could not accept/],
    ["waitlisted", /on the waitlist/, /does not reserve a place/],
    ["lapsed", /hold has ended/, /place has been released/],
  ])("%s: says the right thing in text and HTML", (event, subject, body) => {
    const email = renderBookingEmail(event, details());
    expect(email.subject).toMatch(subject);
    expect(email.text).toMatch(body);
    expect(email.html).toMatch(body);
    for (const part of [email.text, email.html]) {
      expect(part).toContain("ALD-7K3Q9P");
      expect(part).toContain("GH₵ 4,500.00");
      expect(part).toContain("+233241111111");
    }
  });

  it("asks for the deposit only when there is one", () => {
    expect(renderBookingEmail("approved", details()).text).toContain("deposit of GH₵ 1,000.00");
    const none = renderBookingEmail("approved", details({ quoted_deposit_minor: 0 }));
    expect(none.text).not.toMatch(/deposit/i);
  });

  it("handles a large amount returned as text without losing precision", () => {
    expect(renderBookingEmail("submitted", details({ quoted_amount_minor: "100000000" })).text).toContain("GH₵ 1,000,000.00");
  });

  it("includes a rejection reason only in the rejection email", () => {
    const reason = "Incomplete details";
    expect(renderBookingEmail("rejected", details({ decision_reason: reason })).text).toContain(reason);
    expect(renderBookingEmail("approved", details({ decision_reason: reason })).text).not.toContain(reason);
  });

  it("escapes hostel and student text in HTML", () => {
    const { html } = renderBookingEmail("rejected", details({
      student_name: "<script>alert(1)</script>",
      hostel_name: `A&B "House"`,
      decision_reason: "<img src=x onerror=alert(1)>",
    }));
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A&amp;B &quot;House&quot;");
  });
});

describe("sendEmail", () => {
  it("has no provider until D-9 is decided", async () => {
    expect(getEmailTransport()).toBeNull();
    expect(await sendEmail(message)).toBe("not_configured");
  });

  it("needs a valid sending domain", async () => {
    const transport = vi.fn(async () => {});
    vi.stubEnv("EMAIL_FROM_DOMAIN", "bad domain");
    expect(await sendEmail(message, transport)).toBe("not_configured");
    expect(transport).not.toHaveBeenCalled();
  });

  it("sends from the platform domain under the hostel's name, replying to the hostel", async () => {
    const sent: OutboundEmail[] = [];
    expect(await sendEmail(message, async (e) => void sent.push(e))).toBe("sent");
    expect(sent[0].from).toBe('"Alder House" <bookings@adestay.example.com>');
    expect(sent[0].replyTo).toBe("hello@alder.example.com");
  });

  it("blocks header injection", async () => {
    const sent: OutboundEmail[] = [];
    await sendEmail({ ...message, fromName: 'Evil"\r\nBcc: x@example.com', subject: "Hi\r\nBcc: x@example.com" }, async (e) => void sent.push(e));
    expect(sent[0].from).not.toMatch(/[\r\n]/);
    expect(sent[0].from.match(/"/g)).toHaveLength(2);
    expect(sent[0].subject).toBe("Hi Bcc: x@example.com");
    expect(headerSafe("a b")).toBe("a b");
    const transport = vi.fn(async () => {});
    expect(await sendEmail({ ...message, to: "a@example.com\r\nBcc: x@example.com" }, transport)).toBe("failed");
    expect(transport).not.toHaveBeenCalled();
  });

  it("drops an invalid reply-to address", async () => {
    const sent: OutboundEmail[] = [];
    await sendEmail({ ...message, replyTo: "not an address" }, async (e) => void sent.push(e));
    expect(sent[0].replyTo).toBeUndefined();
  });

  it("reports a provider failure without throwing or logging its text", async () => {
    const result = await sendEmail(message, async () => {
      throw new Error("rejected ama@example.com");
    });
    expect(result).toBe("failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("ama@example.com");
  });
});

describe("sendBookingEmail", () => {
  const ID = "70000000-0000-4000-8000-000000000001";

  it("reports not_configured without reading student details", async () => {
    const db = client([details()]);
    expect(await sendBookingEmail(db, ID, "approved")).toBe("not_configured");
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("reads details with the caller's session and sends to the student", async () => {
    const db = client([details()]);
    const sent: OutboundEmail[] = [];
    expect(await sendBookingEmail(db, ID, "approved", { transport: async (e) => void sent.push(e) })).toBe("sent");
    expect(db.rpc).toHaveBeenCalledWith("booking_email_details", { p_request_id: ID });
    expect(sent[0].to).toBe("ama@example.com");
  });

  it("uses the job function only when asked", async () => {
    const db = client([details({ request_status: "lapsed" })]);
    await sendBookingEmail(db, ID, "lapsed", { asJob: true, transport: async () => {} });
    expect(db.rpc).toHaveBeenCalledWith("booking_email_details_for_job", { p_request_id: ID });
  });

  it("sends nothing when the caller may not read the details", async () => {
    const transport = vi.fn(async () => {});
    expect(await sendBookingEmail(client([]), ID, "approved", { transport })).toBe("failed");
    expect(transport).not.toHaveBeenCalled();
  });

  it("never sends news that no longer matches the booking", async () => {
    const transport = vi.fn(async () => {});
    expect(await sendBookingEmail(client([details({ request_status: "cancelled" })]), ID, "approved", { transport })).toBe("failed");
    expect(transport).not.toHaveBeenCalled();
  });

  it("does not throw when the database call fails", async () => {
    const failing = { rpc: vi.fn(async () => { throw new Error("network"); }) };
    expect(await sendBookingEmail(failing, ID, "approved", { transport: async () => {} })).toBe("failed");
    expect(await sendBookingEmail(client(null, { code: "42501" }), ID, "approved", { transport: async () => {} })).toBe("failed");
  });
});
