import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const MIN_SECRET_LENGTH = 16;
const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`. Compared in constant time. With no secret, or
 * one too short to be safe, every call is refused.
 */
export function isCronAuthorized(authorization: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < MIN_SECRET_LENGTH || !authorization) return false;
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
