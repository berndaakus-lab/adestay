import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookingRequestSchema } from "@/lib/validation/booking";

const TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PERIOD = "10000000-0000-4000-8000-000000000001";
const ROOM = "20000000-0000-4000-8000-000000000001";
const KEY = "80000000-0000-4000-8000-000000000001";
const REQUEST = "70000000-0000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  site: null as null | { tenant: { id: string; slug: string; status: string }; mode: string; basePath: string },
  user: { id: "student" } as null | { id: string },
  rpc: vi.fn(),
  email: vi.fn(),
  siteSlugs: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/tenant/site", () => ({
  getSiteTenant: async (slug: string) => {
    h.siteSlugs.push(slug);
    return h.site;
  },
}));
vi.mock("@/lib/server/auth", () => ({ getSessionUser: async () => h.user }));
vi.mock("@/lib/server/supabase/server", () => ({ createSupabaseServerClient: async () => ({ rpc: h.rpc }) }));
vi.mock("@/lib/server/email/booking-email", () => ({ sendBookingEmail: h.email }));

import { submitBookingRequest } from "@/lib/server/actions/booking-actions";

const valid = {
  site: "hostel-a",
  periodId: PERIOD,
  roomTypeId: ROOM,
  idempotencyKey: KEY,
  fullName: "  Ama Mensah ",
  phone: "024 123 4567",
  institution: "University of Ghana",
  programme: "",
  level: "200",
  studentId: "",
  gender: "",
  note: " Near the library please ",
};
const form = (change: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ ...valid, ...change })) data.set(key, value);
  return data;
};
const submit = (change?: Record<string, string>) => submitBookingRequest({ status: "idle" }, form(change));
const created = { data: [{ request_id: REQUEST, booking_reference: "HA-7K3Q9P", request_status: "submitted", created: true }], error: null };

beforeEach(() => {
  h.site = { tenant: { id: TENANT, slug: "hostel-a", status: "active" }, mode: "host", basePath: "" };
  h.user = { id: "student" };
  h.siteSlugs.length = 0;
  h.rpc.mockReset().mockResolvedValue(created);
  h.email.mockReset().mockResolvedValue("sent");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("booking form validation", () => {
  const parse = (change: Record<string, string> = {}) => bookingRequestSchema.safeParse({ ...valid, ...change });

  it("normalises a Ghana phone number and empty optional fields", () => {
    const result = parse();
    expect(result.success && result.data.phone).toBe("+233241234567");
    expect(result.success && result.data.programme).toBeNull();
    expect(result.success && result.data.gender).toBeNull();
    expect(result.success && result.data.fullName).toBe("Ama Mensah");
  });

  it.each<Record<string, string>>([
    { periodId: "nope" },
    { roomTypeId: "nope" },
    { idempotencyKey: "nope" },
    { fullName: " A " },
    { fullName: "Ama\r\nBcc: x@example.com" },
    { phone: "12345" },
    { institution: "x".repeat(121) },
    { level: "x".repeat(41) },
    { studentId: "x".repeat(41) },
    { gender: "other" },
    { note: "x".repeat(1001) },
  ])("refuses %j", (change) => expect(parse(change).success).toBe(false));
});

describe("submitBookingRequest", () => {
  it("submits with the student's session and the site's hostel", async () => {
    const state = await submit({ tenant_id: OTHER, p_tenant_id: OTHER });
    expect(state).toEqual({ status: "success", reference: "HA-7K3Q9P", emailSent: true });
    expect(h.siteSlugs).toEqual(["hostel-a"]);
    expect(h.rpc).toHaveBeenCalledWith("submit_booking_request", {
      p_tenant_id: TENANT,
      p_booking_period_id: PERIOD,
      p_room_type_id: ROOM,
      p_idempotency_key: KEY,
      p_full_name: "Ama Mensah",
      p_phone_e164: "+233241234567",
      p_institution: "University of Ghana",
      p_programme: null,
      p_level: "200",
      p_student_id_number: null,
      p_gender: null,
      p_student_note: "Near the library please",
    });
    expect(h.email).toHaveBeenCalledWith(expect.anything(), REQUEST, "submitted");
  });

  it("refuses when this is not a hostel site", async () => {
    h.site = null;
    expect((await submit()).status).toBe("error");
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("refuses at a suspended hostel", async () => {
    h.site!.tenant.status = "suspended";
    expect((await submit()).message).toMatch(/not taking booking requests/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("asks a visitor to verify their email first", async () => {
    h.user = null;
    expect(await submit()).toMatchObject({ status: "error", needsSignIn: true });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("returns field errors without calling the database", async () => {
    const state = await submit({ phone: "12345" });
    expect(state.fieldErrors?.phone).toMatch(/valid phone/);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not email again for a retry of the same submission", async () => {
    h.rpc.mockResolvedValue({ data: [{ ...created.data[0], created: false }], error: null });
    expect(await submit()).toEqual({ status: "success", reference: "HA-7K3Q9P" });
    expect(h.email).not.toHaveBeenCalled();
  });

  it.each(["not_configured", "failed"])("keeps the booking when the email result is %s", async (delivery) => {
    h.email.mockResolvedValue(delivery);
    expect(await submit()).toEqual({ status: "success", reference: "HA-7K3Q9P", emailSent: false });
  });

  it.each([
    ["AS429", "too many requests", /Too many/],
    ["23505", "you already have a booking request for this period", /already have/],
    ["42501", "verify your email first", /could not accept/],
    ["22023", "something new", /Check your details/],
  ])("maps %s to a safe message", async (code, message, expected) => {
    h.rpc.mockResolvedValue({ data: null, error: { code, message } });
    const state = await submit();
    expect(state.status).toBe("error");
    expect(state.message).toMatch(expected);
    expect(h.email).not.toHaveBeenCalled();
  });

  it("uses one answer for blocked, unverified and unavailable", async () => {
    const answers = new Set<string | undefined>();
    for (const message of ["verify your email first", "not allowed"]) {
      h.rpc.mockResolvedValue({ data: null, error: { code: "42501", message } });
      answers.add((await submit()).message);
    }
    expect(answers.size).toBe(1);
  });

  it.each([
    ["enter your student ID number", "studentId"],
    ["choose a gender", "gender"],
    ["this room type is not available for you", "roomTypeId"],
    ["this room type is not available", "roomTypeId"],
    ["this room type has no price for this period", "roomTypeId"],
    ["this period is not open for booking", "periodId"],
  ])("puts '%s' on the %s field", async (message, field) => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "22023", message } });
    expect((await submit()).fieldErrors).toHaveProperty(field);
  });

  it("never shows raw database text", async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "relation public.secret_table failed" } });
    const state = await submit();
    expect(state.message).toMatch(/quote reference/);
    expect(JSON.stringify(state)).not.toContain("secret_table");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("secret_table");
  });
});
