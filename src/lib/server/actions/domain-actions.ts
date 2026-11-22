"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { dbErrorMessage, type DbError, type DbErrorMessages } from "@/lib/db-errors";
import { isVercelDomainsConfigured, removeDomainFromVercel, syncDomain, type DomainSync } from "@/lib/server/domains/vercel";
import { authorizePlatformAction } from "@/lib/server/staff-action";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { fieldErrors } from "@/lib/validation/auth";
import { addDomainSchema, domainIdSchema, manualDomainStatusSchema, removeDomainSchema } from "@/lib/validation/domains";

/**
 * Custom domains for platform admins (Phase 2, task 10). Database changes use the admin's session
 * and the audited RPCs. With no Vercel token, status is set by hand (decision 2026-11-14).
 */
export interface DomainFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  domainStatus?: "pending" | "verified" | "failed";
}

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const NO_PERMISSION: DomainFormState = { status: "error", message: "You do not have permission to do that." };
const NOT_FOUND: DomainFormState = { status: "error", message: "That domain no longer exists. Refresh the page." };
const entries = (formData: FormData) => Object.fromEntries(formData.entries());

function failure(error: DbError, messages: DbErrorMessages = {}): DomainFormState {
  const message = dbErrorMessage(error, messages);
  if (message) return { status: "error", message };
  const reference = randomUUID().slice(0, 8);
  console.error("domain action failed", { reference, code: error.code });
  return { status: "error", message: `Could not save. Try again, or quote reference ${reference}.` };
}

function syncMessage(sync: Exclude<DomainSync, { status: "unavailable" }>): string {
  if (sync.status === "verified") return "Domain verified. The hostel site is live on it.";
  if (sync.status === "failed") {
    return sync.details.note === "in_use_elsewhere"
      ? "Vercel says this domain is already used by another project."
      : "Vercel refused this domain. Check the name.";
  }
  return "Waiting for DNS. Ask the hostel to add the records shown, then check again.";
}

/** Stores the result through the platform RPC, which enforces the primary-domain rule. */
async function applySync(db: Client, domainId: string, sync: DomainSync): Promise<DomainFormState> {
  if (sync.status === "unavailable") {
    return { status: "error", message: "Vercel could not be reached, so nothing changed. Try again shortly.", id: domainId };
  }
  const { error } = await db.rpc("set_domain_status", { p_domain_id: domainId, p_status: sync.status, p_verification: sync.details });
  if (error) return failure(error, { invalid: "This domain could not be updated." });
  return { status: "success", message: syncMessage(sync), id: domainId, domainStatus: sync.status };
}

async function readDomain(db: Client, domainId: string) {
  const { data, error } = await db.from("tenant_domains").select("id, hostname, kind, status").eq("id", domainId).maybeSingle();
  return { domain: data as { id: string; hostname: string; kind: string; status: string } | null, error };
}

export async function addHostelDomain(_prev: DomainFormState, formData: FormData): Promise<DomainFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = addDomainSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc("add_custom_domain", {
    p_tenant_id: parsed.data.tenantId,
    p_hostname: parsed.data.hostname,
    p_platform_root_domain: process.env.NEXT_PUBLIC_PLATFORM_ROOT_DOMAIN || null,
  });
  if (error) {
    return failure(error, {
      duplicate: "This domain is already in use.",
      invalid: "Enter a domain the hostel owns. It cannot be under the platform domain.",
    });
  }
  const id = data as string;
  revalidatePath("/platform", "layout");
  if (!isVercelDomainsConfigured()) {
    return { status: "success", id, domainStatus: "pending", message: "Domain saved. Vercel is not connected, so add it in Vercel and set its status here." };
  }
  const sync = await syncDomain(parsed.data.hostname);
  // The domain row exists even if Vercel was unreachable, and the job or "Check" will retry it.
  if (sync.status === "unavailable") {
    return { status: "success", id, domainStatus: "pending", message: "Domain saved. Vercel could not be reached yet, so check it again shortly." };
  }
  const applied = await applySync(db, id, sync);
  revalidatePath("/platform", "layout");
  return applied;
}

export async function checkHostelDomain(_prev: DomainFormState, formData: FormData): Promise<DomainFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = domainIdSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (!isVercelDomainsConfigured()) return { status: "error", message: "Vercel is not connected. Set the status by hand." };

  const db = await createSupabaseServerClient();
  const { domain, error } = await readDomain(db, parsed.data.domainId);
  if (error) return failure(error);
  if (!domain || domain.status === "removed") return NOT_FOUND;
  if (domain.kind !== "custom") return { status: "error", message: "Platform subdomains do not need checking." };
  if (domain.status === "verified") return { status: "success", message: "This domain is already verified.", id: domain.id, domainStatus: "verified" };

  const applied = await applySync(db, domain.id, await syncDomain(domain.hostname));
  if (applied.status === "success") revalidatePath("/platform", "layout");
  return applied;
}

/** The fallback only: once Vercel is connected, its answer is the source of truth. */
export async function setDomainStatusManually(_prev: DomainFormState, formData: FormData): Promise<DomainFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = manualDomainStatusSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };
  if (isVercelDomainsConfigured()) return { status: "error", message: "Vercel is connected, so use Check instead." };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("set_domain_status", { p_domain_id: parsed.data.domainId, p_status: parsed.data.status, p_verification: null });
  if (error) return failure(error, { invalid: "Make another verified domain primary first." });
  revalidatePath("/platform", "layout");
  return { status: "success", message: "Domain status saved.", id: parsed.data.domainId, domainStatus: parsed.data.status };
}

export async function makeDomainPrimary(_prev: DomainFormState, formData: FormData): Promise<DomainFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = domainIdSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { error } = await db.rpc("set_primary_domain", { p_domain_id: parsed.data.domainId });
  if (error) return failure(error, { invalid: "Only a verified domain can be primary." });
  revalidatePath("/platform", "layout");
  return { status: "success", message: "Primary domain updated.", id: parsed.data.domainId };
}

export async function removeHostelDomain(_prev: DomainFormState, formData: FormData): Promise<DomainFormState> {
  if (!(await authorizePlatformAction())) return NO_PERMISSION;
  const parsed = removeDomainSchema.safeParse(entries(formData));
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrors(parsed.error) };

  const db = await createSupabaseServerClient();
  const { domain, error: readError } = await readDomain(db, parsed.data.domainId);
  if (readError) return failure(readError);
  if (!domain || domain.status === "removed") return NOT_FOUND;

  // The RPC goes first: it refuses a primary domain, which must keep serving on Vercel.
  const { error } = await db.rpc("remove_domain", { p_domain_id: domain.id, p_reason: parsed.data.reason });
  if (error) return failure(error, { invalid: "Make another verified domain primary first." });
  revalidatePath("/platform", "layout");

  // The wildcard covers platform subdomains; only custom domains are attached individually.
  if (domain.kind !== "custom") return { status: "success", message: "Domain removed.", id: domain.id };
  const manual = "Domain removed here. Also remove it from the Vercel project, so it cannot be taken over.";
  if (!isVercelDomainsConfigured()) return { status: "success", message: manual, id: domain.id };
  const detached = await removeDomainFromVercel(domain.hostname);
  return { status: "success", message: detached ? "Domain removed." : manual, id: domain.id };
}
