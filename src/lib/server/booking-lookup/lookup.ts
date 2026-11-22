import "server-only";
import { lookupClientKey } from "@/lib/server/booking-lookup/client-key";
import { getServiceRoleClient } from "@/lib/server/supabase/admin";

export type LookupResult =
  | { outcome: "found"; bookingStatus: string }
  | { outcome: "not_found" | "rate_limited" | "unavailable" };

/**
 * Allow-listed service-role module (a visitor has no session). It can call only the narrow
 * public.lookup_booking RPC, which needs the reference plus contact, returns status only and
 * enforces the rate limit. The tenant must come from the site being served.
 *
 * Fails closed: without a working rate limit no lookup is performed.
 */
export async function lookupBooking(tenantId: string, reference: string, contact: string, address: string): Promise<LookupResult> {
  const clientKey = lookupClientKey(address);
  if (!clientKey) {
    console.error("booking lookup is not configured");
    return { outcome: "unavailable" };
  }
  try {
    const { data, error } = await getServiceRoleClient().rpc("lookup_booking", {
      p_tenant_id: tenantId,
      p_reference: reference,
      p_contact: contact,
      p_client_key: clientKey,
    });
    if (error) {
      console.error("booking lookup failed", { code: error.code });
      return { outcome: "unavailable" };
    }
    const row = (Array.isArray(data) ? data[0] : null) as { outcome: string; booking_status: string | null } | null;
    if (row?.outcome === "found" && row.booking_status) return { outcome: "found", bookingStatus: row.booking_status };
    if (row?.outcome === "not_found" || row?.outcome === "rate_limited") return { outcome: row.outcome };
    return { outcome: "unavailable" };
  } catch {
    console.error("booking lookup failed");
    return { outcome: "unavailable" };
  }
}
