import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

/**
 * The visitor identity used for the lookup rate limit (SECURITY_THREAT_MODEL T6, §5). Only a keyed
 * hash reaches the database: a plain hash of an IPv4 address could be reversed by trying them all.
 */

/** One IPv4 address, or one IPv6 /64, because a single customer usually controls a whole /64. */
export function rateLimitAddress(raw: string): string | null {
  const address = raw.trim().toLowerCase().split("%")[0];
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return null;

  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped) return isIP(mapped[1]) === 4 ? mapped[1] : null;

  // A dotted tail takes the last two groups, which a /64 prefix never uses.
  const [head, tail] = address.replace(/:\d+\.\d+\.\d+\.\d+$/, ":0:0").split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}

/**
 * On Vercel, x-forwarded-for is set by the platform and a client cannot spoof it. Elsewhere there
 * is no trusted proxy, so the header is ignored and all local traffic shares one bucket.
 */
export function clientAddress(headers: Pick<Headers, "get">, onVercel = Boolean(process.env.VERCEL)): string | null {
  if (!onVercel) return "127.0.0.1";
  const first = headers.get("x-forwarded-for")?.split(",")[0];
  return first ? rateLimitAddress(first) : null;
}

export function lookupClientKey(address: string, secret = process.env.LOG_REDACTION_SALT): string | null {
  if (!secret || secret.length < 16) return null;
  return createHmac("sha256", secret).update(`booking-lookup:${address}`).digest("hex");
}
