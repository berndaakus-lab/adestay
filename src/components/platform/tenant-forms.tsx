"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormMessage, ReasonDialog, TextField, useActionForm } from "@/components/forms/form-bits";
import { Button } from "@/components/ui/button";
import { createTenant, inviteFirstAdmin, resendFirstAdminInvite, setTenantStatus, type ProvisioningFormState } from "@/lib/server/actions/provisioning-actions";
import { slugify } from "@/lib/validation/inventory";

const initial: ProvisioningFormState = { status: "idle" };

function Section({ step, title, children }: { step: number; title: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 md:p-6">
      <legend className="px-2 text-sm font-semibold">
        <span className="text-muted-foreground">Step {step} of 3: </span>
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

export function CreateTenantForm({ rootDomain }: { rootDomain: string | null }) {
  const router = useRouter();
  const { state, pending, formProps } = useActionForm(createTenant, initial);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const shownSlug = slugEdited ? slug : slugify(name).slice(0, 40);

  useEffect(() => {
    if (state.status === "success" && state.id) {
      router.push(`/platform/hostels/${state.id}?created=${state.emailSent ? "1" : "email-failed"}`);
    }
  }, [state, router]);

  const errors = state.fieldErrors ?? {};
  const slugHelp = rootDomain
    ? `The site will be at ${shownSlug || "your-hostel"}.${rootDomain}`
    : "Used for the hostel's web address once the platform domain is set.";

  return (
    <form {...formProps} className="flex flex-col gap-6" noValidate>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <Section step={1} title="The hostel">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hostel-name" className="text-sm font-medium">
            Hostel name
          </label>
          <input
            id="hostel-name"
            name="name"
            required
            maxLength={120}
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "hostel-name-error" : undefined}
            className="h-11 w-full rounded-sm border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {errors.name ? (
            <p id="hostel-name-error" className="text-sm text-destructive">
              {errors.name}
            </p>
          ) : null}
        </div>
        <TextField name="legalName" label="Registered business name" required={false} maxLength={200} error={errors.legalName} />
      </Section>

      <Section step={2} title="Web address and references">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="hostel-slug" className="text-sm font-medium">
            Web address name
          </label>
          <input
            id="hostel-slug"
            name="slug"
            required
            maxLength={40}
            value={shownSlug}
            onChange={(event) => {
              setSlugEdited(true);
              setSlug(event.target.value);
            }}
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={errors.slug ? true : undefined}
            aria-describedby={errors.slug ? "hostel-slug-help hostel-slug-error" : "hostel-slug-help"}
            className="h-11 w-full rounded-sm border border-input bg-card px-3 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <p id="hostel-slug-help" className="text-sm text-muted-foreground">
            {slugHelp}
          </p>
          {errors.slug ? (
            <p id="hostel-slug-error" className="text-sm text-destructive">
              {errors.slug}
            </p>
          ) : null}
        </div>
        <TextField
          name="referencePrefix"
          label="Booking reference prefix"
          description="2-4 letters at the start of booking references, e.g. ALD-7K3Q9P. It cannot be changed later."
          maxLength={4}
          error={errors.referencePrefix}
        />
      </Section>

      <Section step={3} title="First hostel admin">
        <TextField
          name="adminEmail"
          label="Admin's email address"
          type="email"
          inputMode="email"
          autoComplete="off"
          description="They get an invitation, choose a password and set up two-step verification."
          error={errors.adminEmail}
        />
      </Section>

      <div>
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Creating hostel…" : "Create hostel and invite admin"}
        </Button>
      </div>
    </form>
  );
}

export function TenantStatusControl({ tenantId, tenantName, status }: { tenantId: string; tenantName: string; status: string }) {
  if (status === "onboarding") {
    return (
      <ReasonDialog
        key={status}
        action={setTenantStatus}
        initial={initial}
        hidden={{ tenantId, status: "active" }}
        trigger="Activate hostel"
        title={`Activate ${tenantName}?`}
        description="Its staff can start working, and its public site can go live once the profile is published."
        confirm="Activate"
      />
    );
  }
  if (status === "active") {
    return (
      <ReasonDialog
        key={status}
        action={setTenantStatus}
        initial={initial}
        hidden={{ tenantId, status: "suspended" }}
        trigger="Suspend hostel"
        title={`Suspend ${tenantName}?`}
        description="Staff lose access at once and the public site shows “temporarily unavailable”. Students keep read-only access. The hostel's admin can see this reason in their audit log."
        confirm="Suspend hostel"
        destructive
      />
    );
  }
  if (status === "suspended") {
    return (
      <ReasonDialog
        key={status}
        action={setTenantStatus}
        initial={initial}
        hidden={{ tenantId, status: "active" }}
        trigger="Restore hostel"
        title={`Restore ${tenantName}?`}
        description="Staff regain access and the public site comes back."
        confirm="Restore"
      />
    );
  }
  return null;
}

export function InviteFirstAdminForm({ tenantId, hasInvitation }: { tenantId: string; hasInvitation: boolean }) {
  const { state, pending, formProps } = useActionForm(inviteFirstAdmin, initial, { resetOnSuccess: true });
  return (
    <form {...formProps} className="flex flex-col gap-4 sm:max-w-md" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <TextField
        name="email"
        label={hasInvitation ? "Invite a different admin" : "Admin's email address"}
        description={hasInvitation ? "Use this if the address above is wrong or the person has left." : undefined}
        type="email"
        inputMode="email"
        autoComplete="off"
        error={state.fieldErrors?.email}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Invite admin"}
        </Button>
      </div>
    </form>
  );
}

export function ResendInviteButton({ tenantId, email }: { tenantId: string; email: string }) {
  const { state, pending, formProps } = useActionForm(resendFirstAdminInvite, initial);
  return (
    <form {...formProps} className="flex flex-col gap-2">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="email" value={email} />
      <div>
        <Button type="submit" variant="outline" disabled={pending} aria-label={`Resend invitation to ${email}`}>
          {pending ? "Sending…" : "Resend"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
