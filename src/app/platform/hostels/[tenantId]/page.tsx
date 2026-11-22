import { Check, Circle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { z } from "zod";
import { DomainPanel, type DomainRow } from "@/components/platform/domain-panel";
import { InviteFirstAdminForm, ResendInviteButton, TenantStatusControl } from "@/components/platform/tenant-forms";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { firstParam } from "@/lib/search-params";
import { isVercelDomainsConfigured } from "@/lib/server/domains/vercel";
import { isTenantPreviewEnabled } from "@/lib/server/env";
import { createSupabaseServerClient } from "@/lib/server/supabase/server";
import { tenantStatus, type TenantStatus } from "@/lib/status";

export const metadata: Metadata = { title: "Hostel details" };

interface AdminInvitation {
  membership_id: string;
  email: string | null;
  status: "invited" | "active";
}

const formatDate = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Accra" });

function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 md:p-6">
      <div>
        <h2 className="text-2xl">{title}</h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Step({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      {done ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <span>
        <span className="sr-only">{done ? "Done: " : "To do: "}</span>
        {children}
      </span>
    </li>
  );
}

async function HostelDetail({ params, searchParams }: PageProps<"/platform/hostels/[tenantId]">) {
  const { tenantId } = await params;
  if (!z.uuid().safeParse(tenantId).success) notFound();
  const created = firstParam((await searchParams).created);

  const db = await createSupabaseServerClient();
  const [tenantResult, domainsResult, invitationsResult] = await Promise.all([
    db.from("tenants").select("id, name, legal_name, slug, reference_prefix, status, suspended_at, suspension_reason, created_at").eq("id", tenantId).maybeSingle(),
    db
      .from("tenant_domains")
      .select("id, hostname, kind, status, is_primary, verification, last_checked_at")
      .eq("tenant_id", tenantId)
      .neq("status", "removed")
      .order("is_primary", { ascending: false })
      .order("hostname"),
    db.rpc("platform_hostel_admin_invitations", { p_tenant_id: tenantId }),
  ]);
  if (tenantResult.error) throw new Error(`Could not load hostel (${tenantResult.error.code})`);
  if (!tenantResult.data) notFound();
  if (domainsResult.error) throw new Error(`Could not load domains (${domainsResult.error.code})`);
  if (invitationsResult.error) throw new Error(`Could not load invitations (${invitationsResult.error.code})`);

  const tenant = tenantResult.data;
  const status = tenant.status as TenantStatus;
  const domains = (domainsResult.data ?? []) as DomainRow[];
  const admins = (invitationsResult.data ?? []) as AdminInvitation[];
  const hasActiveAdmin = admins.some((admin) => admin.status === "active");
  const liveDomain = domains.find((domain) => domain.status === "verified" && domain.is_primary) ?? domains.find((domain) => domain.status === "verified");
  const showPreview = !liveDomain && isTenantPreviewEnabled();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <Link href="/platform" className="text-sm text-primary underline decoration-brass underline-offset-4">
          Back to hostels
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-3">Hostel</p>
            <h1 className="text-4xl break-words">{tenant.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={tenantStatus[status]} />
              <span className="font-mono text-xs text-muted-foreground">{tenant.slug}</span>
              <span className="text-xs text-muted-foreground">Reference prefix {tenant.reference_prefix}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2">
            <TenantStatusControl tenantId={tenant.id} tenantName={tenant.name} status={status} />
          </div>
        </div>
      </div>

      {created === "1" ? (
        <Alert role="status">
          <AlertDescription>Hostel created and admin invited. They will get an email, or see this hostel the next time they sign in.</AlertDescription>
        </Alert>
      ) : null}
      {created === "email-failed" ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Hostel created, but the invitation email could not be sent. Use Resend below.</AlertDescription>
        </Alert>
      ) : null}
      {status === "suspended" ? (
        <Alert variant="destructive">
          <AlertDescription>
            Suspended{tenant.suspended_at ? ` on ${formatDate(tenant.suspended_at)}` : ""}. Reason: {tenant.suspension_reason}
          </AlertDescription>
        </Alert>
      ) : null}

      {status === "onboarding" ? (
        <Panel title="Next steps">
          <ol className="flex flex-col gap-3">
            <Step done>Hostel created</Step>
            <Step done={admins.length > 0}>First admin invited</Step>
            <Step done={domains.some((domain) => domain.status === "verified")}>Web address ready{domains.length ? "" : " (added once the root domain is set)"}</Step>
            <Step done={false}>Activate the hostel, so its admin can set up rooms and prices</Step>
          </ol>
        </Panel>
      ) : null}

      <Panel title="Hostel admin" description="Only hostel admins are shown here. Staff and student records need a break-glass grant.">
        {admins.length ? (
          <ul className="divide-y divide-border rounded-sm border border-border">
            {admins.map((admin) => (
              <li key={admin.membership_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="text-sm font-medium break-all">{admin.email ?? "Admin account"}</span>
                  <Badge variant={admin.status === "active" ? "success" : "warning"}>{admin.status === "active" ? "Accepted" : "Invited"}</Badge>
                </div>
                {admin.status === "invited" && admin.email ? <ResendInviteButton tenantId={tenant.id} email={admin.email} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No admin yet. Invite one to continue.</p>
        )}
        {!hasActiveAdmin && status !== "archived" ? <InviteFirstAdminForm tenantId={tenant.id} hasInvitation={admins.length > 0} /> : null}
      </Panel>

      <Panel title="Web addresses" description="A custom domain goes live once its DNS records are correct.">
        <DomainPanel tenantId={tenant.id} domains={domains} vercelConnected={isVercelDomainsConfigured()} archived={status === "archived"} />
        {liveDomain && status === "active" ? (
          <a href={`https://${liveDomain.hostname}`} target="_blank" rel="noreferrer" className="text-sm text-primary underline decoration-brass underline-offset-4">
            Open the hostel site (opens in a new tab)
          </a>
        ) : null}
        {showPreview ? (
          <Link href={`/sites/${tenant.slug}`} className="text-sm text-primary underline decoration-brass underline-offset-4">
            Open the staging preview
          </Link>
        ) : null}
      </Panel>
    </div>
  );
}

export default function HostelDetailPage(props: PageProps<"/platform/hostels/[tenantId]">) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6" aria-busy="true">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      }
    >
      <HostelDetail {...props} />
    </Suspense>
  );
}
