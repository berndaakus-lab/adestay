import { describe, expect, it } from "vitest";
import { mfaRequirement, type MfaInput } from "@/lib/mfa-policy";
import { safeNextPath } from "@/lib/safe-redirect";
import { emailOnlySchema, newPasswordSchema, otpCodeSchema, staffSignInSchema } from "@/lib/validation/auth";

describe("safeNextPath (open-redirect protection)", () => {
  it.each(["/", "/account", "/t/alder-house/bookings?status=pending", "/portal#invoices"])("allows %s", (p) => {
    expect(safeNextPath(p)).toBe(p);
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "%2F%2Fevil.example",
    "javascript:alert(1)",
    "evil.example",
    "/ok\u0000",
    "",
    null,
    undefined,
    "/" + "a".repeat(600),
  ])("rejects %s", (p) => {
    expect(safeNextPath(p as string, "/fallback")).toBe("/fallback");
  });
});

describe("mfaRequirement", () => {
  const base: MfaInput = { isHostelAdminAnywhere: false, isPlatformAdminAccount: false, currentLevel: "aal1", hasVerifiedTotpFactor: false };

  it("requires hostel admins to enrol, then to verify", () => {
    expect(mfaRequirement({ ...base, isHostelAdminAnywhere: true })).toBe("setup");
    expect(mfaRequirement({ ...base, isHostelAdminAnywhere: true, hasVerifiedTotpFactor: true })).toBe("verify");
    expect(mfaRequirement({ ...base, isHostelAdminAnywhere: true, hasVerifiedTotpFactor: true, currentLevel: "aal2" })).toBe("ok");
  });

  it("requires platform admin accounts to use MFA", () => {
    expect(mfaRequirement({ ...base, isPlatformAdminAccount: true })).toBe("setup");
  });

  it("lets other staff continue without MFA, unless they enrolled a factor", () => {
    expect(mfaRequirement(base)).toBe("ok");
    expect(mfaRequirement({ ...base, hasVerifiedTotpFactor: true })).toBe("verify");
  });
});

describe("auth validation", () => {
  it("normalises email case and whitespace", () => {
    expect(emailOnlySchema.parse({ email: "  Ama@Example.COM " }).email).toBe("ama@example.com");
  });

  it("rejects malformed emails", () => {
    expect(emailOnlySchema.safeParse({ email: "ama@" }).success).toBe(false);
  });

  it("requires a password to sign in", () => {
    expect(staffSignInSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });

  it("enforces a 12-character minimum and matching confirmation for new passwords", () => {
    expect(newPasswordSchema.safeParse({ password: "short", confirm: "short" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "a-long-passphrase", confirm: "different-one" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "a-long-passphrase", confirm: "a-long-passphrase" }).success).toBe(true);
  });

  it("accepts only 6-digit email codes", () => {
    expect(otpCodeSchema.safeParse({ email: "a@b.co", code: " 123456 " }).success).toBe(true);
    expect(otpCodeSchema.safeParse({ email: "a@b.co", code: "12345a" }).success).toBe(false);
  });
});
