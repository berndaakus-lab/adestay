/**
 * When must a staff session use TOTP MFA (aal2)? (docs/adr/0002-authn-authz.md)
 * Hostel admins and platform admins: always. Other staff: optional in v1.
 */
export type AssuranceLevel = "aal1" | "aal2";

export interface MfaInput {
  isHostelAdminAnywhere: boolean;
  isPlatformAdminAccount: boolean;
  currentLevel: AssuranceLevel | null;
  hasVerifiedTotpFactor: boolean;
}

/** "ok": continue; "setup": enrol an authenticator first; "verify": enter a code to reach aal2. */
export function mfaRequirement(input: MfaInput): "ok" | "setup" | "verify" {
  const required = input.isHostelAdminAnywhere || input.isPlatformAdminAccount;
  if (input.currentLevel === "aal2") return "ok";
  // Anyone who has enrolled a factor must use it, even if not required to have one.
  if (input.hasVerifiedTotpFactor) return "verify";
  return required ? "setup" : "ok";
}
