import "server-only";
import { isVercelDomainsConfigured, syncDomain } from "@/lib/server/domains/vercel";
import { getServiceRoleClient } from "@/lib/server/supabase/admin";

/**
 * Polls pending and failed custom domains (docs/SYSTEM_ARCHITECTURE.md §6). Safe to re-run. Oldest
 * check first, so a large backlog is worked through over several runs.
 */
const BATCH_SIZE = 20;
const TIME_BUDGET_MS = 50_000;

export interface DomainJobResult {
  skipped?: "vercel_not_configured";
  checked: number;
  verified: number;
  unavailable: number;
}

export async function runDomainVerification(now: () => number = Date.now): Promise<DomainJobResult> {
  if (!isVercelDomainsConfigured()) return { skipped: "vercel_not_configured", checked: 0, verified: 0, unavailable: 0 };

  const db = getServiceRoleClient();
  const { data, error } = await db
    .from("tenant_domains")
    .select("id, hostname, tenants!inner(status)")
    .eq("kind", "custom")
    .in("status", ["pending", "failed"])
    .neq("tenants.status", "archived")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);
  if (error) throw new Error(`Could not load domains (${error.code})`);

  const started = now();
  const result: DomainJobResult = { checked: 0, verified: 0, unavailable: 0 };
  for (const domain of (data ?? []) as unknown as { id: string; hostname: string }[]) {
    if (now() - started > TIME_BUDGET_MS) break;
    const sync = await syncDomain(domain.hostname);
    if (sync.status === "unavailable") {
      result.unavailable += 1;
      continue;
    }
    const { data: changed, error: recordError } = await db.rpc("record_domain_check", {
      p_domain_id: domain.id,
      p_status: sync.status,
      p_verification: sync.details,
    });
    if (recordError) throw new Error(`Could not record a domain check (${recordError.code})`);
    if (changed === true) {
      result.checked += 1;
      if (sync.status === "verified") result.verified += 1;
    }
  }
  return result;
}
