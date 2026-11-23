import "server-only";
import { sendBookingEmail } from "@/lib/server/email/booking-email";
import type { EmailDelivery } from "@/lib/server/email/send";
import { getServiceRoleClient } from "@/lib/server/supabase/admin";

const BATCH_SIZE = 100;
const MAX_BATCHES = 10;
const EMAILS_AT_ONCE = 5;
/** No new batch starts after this, so the emails for a finished batch have time to go out. */
const TIME_BUDGET_MS = 40_000;

export interface HoldExpiryResult {
  expired: number;
  emailsSent: number;
  emailsNotSent: number;
  /** More holds may be due: the next scheduled run continues. */
  hasMore: boolean;
  rateLimitsPurged: number | null;
  failed: boolean;
}

async function emailStudents(db: ReturnType<typeof getServiceRoleClient>, requestIds: string[]): Promise<EmailDelivery[]> {
  const deliveries: EmailDelivery[] = [];
  for (let i = 0; i < requestIds.length; i += EMAILS_AT_ONCE) {
    const chunk = requestIds.slice(i, i + EMAILS_AT_ONCE);
    deliveries.push(...(await Promise.all(chunk.map((id) => sendBookingEmail(db, id, "lapsed", { asJob: true })))));
  }
  return deliveries;
}

/**
 * Ends overdue holds in batches and tells each student (SYSTEM_ARCHITECTURE §6). Safe to run
 * repeatedly or in parallel, because the database decides which holds expire. An email that fails
 * is not retried until the Phase 6 outbox; the booking's status is correct either way.
 */
export async function runHoldExpiry(now: () => number = Date.now): Promise<HoldExpiryResult> {
  const db = getServiceRoleClient();
  const startedAt = now();
  const result: HoldExpiryResult = { expired: 0, emailsSent: 0, emailsNotSent: 0, hasMore: false, rateLimitsPurged: null, failed: false };

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const { data, error } = await db.rpc("expire_reservations", { p_limit: BATCH_SIZE });
    if (error) {
      console.error("hold expiry failed", { code: error.code });
      result.failed = true;
      break;
    }
    const row = (Array.isArray(data) ? data[0] : null) as
      | { expired_reservations: number; has_more: boolean; lapsed_request_ids: string[] | null }
      | null;
    if (!row) {
      console.error("hold expiry returned no result");
      result.failed = true;
      break;
    }

    result.expired += row.expired_reservations;
    const deliveries = await emailStudents(db, row.lapsed_request_ids ?? []);
    result.emailsSent += deliveries.filter((d) => d === "sent").length;
    result.emailsNotSent += deliveries.filter((d) => d !== "sent").length;
    result.hasMore = row.has_more;

    // Nothing expired means the due rows are locked by staff right now: leave them for the next run.
    if (!row.has_more || row.expired_reservations === 0 || now() - startedAt >= TIME_BUDGET_MS) break;
  }

  const { data: purged, error: purgeError } = await db.rpc("purge_expired_rate_limits");
  if (purgeError) console.error("rate limit cleanup failed", { code: purgeError.code });
  else result.rateLimitsPurged = Number(purged);

  return result;
}
