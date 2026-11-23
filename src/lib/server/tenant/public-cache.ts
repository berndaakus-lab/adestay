import "server-only";
import { updateTag } from "next/cache";

/**
 * Short-lived cache for published hostel content (SYSTEM_ARCHITECTURE §2, Phase 3 criterion 6).
 * Entries are keyed by tenant id and hold only what the anonymous role can read. Staff changes
 * clear them at once; anything else, such as a hold expiring, shows within about a minute.
 * The cache never decides a booking: prices, deposits and capacity are re-read in the database.
 */
export const PUBLIC_CACHE_LIFE = { stale: 30, revalidate: 60, expire: 300 };
export const publicSiteTag = (tenantId: string) => `public-site:${tenantId}`;

/** Browser tests reset their data between tests, so they turn the cache off. */
export const publicCacheEnabled = () => process.env.ADESTAY_PUBLIC_CACHE !== "off";

/** Call from a Server Action after anything visitors can see has changed. */
export function refreshPublicSite(tenantId: string) {
  updateTag(publicSiteTag(tenantId));
}
