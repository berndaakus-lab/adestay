"use client";

import { FormMessage, ReasonDialog, SelectField, TextField, useActionForm } from "@/components/forms/form-bits";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  addHostelDomain,
  checkHostelDomain,
  makeDomainPrimary,
  removeHostelDomain,
  setDomainStatusManually,
  type DomainFormState,
} from "@/lib/server/actions/domain-actions";
import type { DomainDetails } from "@/lib/server/domains/vercel";
import { domainStatus, type DomainStatus } from "@/lib/status";

const initial: DomainFormState = { status: "idle" };

export interface DomainRow {
  id: string;
  hostname: string;
  kind: "platform_subdomain" | "custom";
  status: DomainStatus;
  is_primary: boolean;
  verification: Partial<DomainDetails> | null;
  last_checked_at: string | null;
}

function DnsInstructions({ domain }: { domain: DomainRow }) {
  const details = domain.verification;
  const records = details?.records ?? [];
  const target = details?.recommendedCname;
  const ips = details?.recommendedIpv4 ?? [];
  if (details?.note === "in_use_elsewhere") {
    return <p className="text-sm text-destructive">Vercel says another project already uses this domain. It must be released there first.</p>;
  }
  if (!records.length && !target && !ips.length) return null;
  const isApex = domain.hostname.split(".").length === 2;
  const rows = [
    ...(target && !isApex ? [{ type: "CNAME", name: domain.hostname, value: target }] : []),
    ...(isApex || !target ? ips.map((ip) => ({ type: "A", name: domain.hostname, value: ip })) : []),
    ...records.map((r) => ({ type: r.type, name: r.domain, value: r.value })),
  ];
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">DNS records for the hostel to add:</p>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={`${row.type}-${row.name}-${row.value}`} className="grid gap-1 rounded-sm bg-muted p-3 text-sm sm:grid-cols-[4rem_1fr_1fr] sm:gap-3">
            <span className="font-semibold">
              <span className="block font-sans text-xs font-normal text-muted-strong">Type</span>
              {row.type}
            </span>
            <span className="min-w-0 font-mono text-xs break-all">
              <span className="block font-sans text-xs text-muted-strong">Name</span>
              {row.name}
            </span>
            <span className="min-w-0 font-mono text-xs break-all">
              <span className="block font-sans text-xs text-muted-strong">Value</span>
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CheckButton({ domain }: { domain: DomainRow }) {
  const { state, pending, formProps } = useActionForm(checkHostelDomain, initial);
  return (
    <form {...formProps} className="flex flex-col gap-2">
      <input type="hidden" name="domainId" value={domain.id} />
      <div>
        <Button type="submit" variant="outline" disabled={pending} aria-label={`Check ${domain.hostname}`}>
          {pending ? "Checking…" : "Check now"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function ManualStatus({ domain }: { domain: DomainRow }) {
  const { state, pending, formProps } = useActionForm(setDomainStatusManually, initial);
  return (
    <form {...formProps} className="flex flex-col gap-2">
      <input type="hidden" name="domainId" value={domain.id} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-40">
          <SelectField
            name="status"
            label="Set status"
            defaultValue={domain.status}
            error={state.fieldErrors?.status}
            options={[
              { value: "pending", label: "Pending" },
              { value: "verified", label: "Verified" },
              { value: "failed", label: "Failed" },
            ]}
          />
        </div>
        <Button type="submit" variant="outline" disabled={pending} aria-label={`Save status of ${domain.hostname}`}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function PrimaryButton({ domain }: { domain: DomainRow }) {
  const { state, pending, formProps } = useActionForm(makeDomainPrimary, initial);
  return (
    <form {...formProps} className="flex flex-col gap-2">
      <input type="hidden" name="domainId" value={domain.id} />
      <div>
        <Button type="submit" variant="outline" disabled={pending} aria-label={`Make ${domain.hostname} the primary domain`}>
          {pending ? "Saving…" : "Make primary"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

function DomainItem({ domain, vercelConnected }: { domain: DomainRow; vercelConnected: boolean }) {
  const isCustom = domain.kind === "custom";
  return (
    <li className="flex flex-col gap-4 p-4 md:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold break-all">{domain.hostname}</span>
        <StatusBadge status={domainStatus[domain.status]} />
        {domain.is_primary ? <Badge variant="info">Primary</Badge> : null}
        {isCustom ? null : <Badge variant="neutral">Platform address</Badge>}
      </div>
      {domain.status !== "verified" && isCustom ? <DnsInstructions domain={domain} /> : null}
      {isCustom && domain.status !== "verified" && !vercelConnected ? (
        <p className="text-sm text-muted-foreground">Vercel is not connected. Add this domain in the Vercel project, then set its status here.</p>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        {isCustom && domain.status !== "verified" && vercelConnected ? <CheckButton domain={domain} /> : null}
        {isCustom && !vercelConnected && !domain.is_primary ? <ManualStatus domain={domain} /> : null}
        {domain.status === "verified" && !domain.is_primary ? <PrimaryButton domain={domain} /> : null}
        {domain.is_primary ? null : (
          <ReasonDialog
            action={removeHostelDomain}
            initial={initial}
            hidden={{ domainId: domain.id }}
            trigger="Remove"
            title={`Remove ${domain.hostname}?`}
            description="The hostel's site stops working on this address."
            confirm="Remove domain"
            destructive
          />
        )}
      </div>
    </li>
  );
}

function AddDomainForm({ tenantId }: { tenantId: string }) {
  const { state, pending, formProps } = useActionForm(addHostelDomain, initial, { resetOnSuccess: true });
  return (
    <form {...formProps} className="flex flex-col gap-4 sm:max-w-md" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <TextField
        name="hostname"
        label="Add a custom domain"
        placeholder="book.yourhostel.com.gh"
        inputMode="url"
        autoComplete="off"
        description="A domain the hostel owns, without https://."
        error={state.fieldErrors?.hostname}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add domain"}
        </Button>
      </div>
    </form>
  );
}

export function DomainPanel({ tenantId, domains, vercelConnected, archived }: { tenantId: string; domains: DomainRow[]; vercelConnected: boolean; archived: boolean }) {
  return (
    <div className="flex flex-col gap-6">
      {domains.length ? (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {domains.map((domain) => (
            <DomainItem key={domain.id} domain={domain} vercelConnected={vercelConnected} />
          ))}
        </ul>
      ) : (
        <EmptyState title="No domains yet" description="A platform address is added automatically once the root domain is set. You can add the hostel's own domain below." />
      )}
      {archived ? null : <AddDomainForm tenantId={tenantId} />}
    </div>
  );
}
