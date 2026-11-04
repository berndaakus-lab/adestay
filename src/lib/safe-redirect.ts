/**
 * Validates a post-sign-in "next" path so a crafted link cannot send users to another site
 * (open-redirect protection, SECURITY_THREAT_MODEL T3/T9). Only same-site absolute paths pass.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string" || next.length > 512) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return fallback;
  }
  // Must be a path on this site: "/x", never "//evil.com", "/\evil.com", "https://..." or control chars.
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return fallback;
  return next;
}
