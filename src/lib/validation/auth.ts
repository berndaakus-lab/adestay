import { z } from "zod";

/** Shared by forms (client hints) and server actions (authoritative). */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email address is too long")
  .pipe(z.email({ message: "Enter a valid email address, e.g. ama@example.com" }));

/** Matches the minimum length configured in Supabase Auth (docs/SECURITY_THREAT_MODEL.md T4). */
export const PASSWORD_MIN_LENGTH = 12;

export const staffSignInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128, "Password is too long"),
});

export const emailOnlySchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(128, "Password is too long"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const otpCodeSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from the email"),
});

export const totpCodeSchema = z.object({
  factorId: z.string().min(1).max(64),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app"),
});

/** First message per field, for showing next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}
