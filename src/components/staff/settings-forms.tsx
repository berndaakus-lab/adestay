"use client";

import { useState, type ReactNode } from "react";
import { FormMessage, SelectField, TextField, useActionForm } from "@/components/forms/form-bits";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { contrastRatio, isReadableBrandColor } from "@/lib/brand-color";
import { prepareImageField } from "@/lib/prepare-image";
import { updateHostelProfile, updateOperationalSettings, type SettingsFormState } from "@/lib/server/actions/settings-actions";
import type { InventoryFormState } from "@/lib/server/actions/inventory-actions";
import { removeBrandingImage, uploadBrandingImage } from "@/lib/server/actions/upload-actions";

const initial: SettingsFormState = { status: "idle" };
const imageInitial: InventoryFormState = { status: "idle" };

function Group({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5 md:p-6">
      <legend className="px-2 font-heading text-xl">{title}</legend>
      {description ? <p className="-mt-2 text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </fieldset>
  );
}

function AreaField(props: { name: string; label: string; defaultValue: string; maxLength: number; rows?: number; error?: string; description?: string }) {
  const { name, label, error, description, rows = 4, ...rest } = props;
  const id = `field-${name}`;
  const describedBy = [error ? `${id}-error` : null, description ? `${id}-desc` : null].filter(Boolean).join(" ") || undefined;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </FieldLabel>
      <Textarea id={id} name={name} rows={rows} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {description ? <FieldDescription id={`${id}-desc`}>{description}</FieldDescription> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

function CheckField({ name, label, description, defaultChecked }: { name: string; label: string; description?: string; defaultChecked: boolean }) {
  const id = `field-${name}`;
  return (
    <div className="flex min-h-11 items-start gap-3">
      <input id={id} name={name} type="checkbox" defaultChecked={defaultChecked} aria-describedby={description ? `${id}-desc` : undefined} className="mt-0.5 size-5 shrink-0 accent-primary" />
      <div>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {description ? (
          <p id={`${id}-desc`} className="text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ColorField({ name, label, defaultValue, error }: { name: string; label: string; defaultValue: string; error?: string }) {
  const [value, setValue] = useState(defaultValue);
  const id = `field-${name}`;
  const hex = value.trim().toLowerCase();
  const valid = /^#[0-9a-f]{6}$/.test(hex);
  const readable = valid && isReadableBrandColor(hex);
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>
        {label} <span className="font-normal text-muted-foreground">(optional)</span>
      </FieldLabel>
      <div className="flex items-center gap-3">
        <input
          type="color"
          aria-label={`Pick ${label.toLowerCase()}`}
          value={valid ? hex : "#234536"}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer rounded-sm border border-input bg-card p-1"
        />
        <input
          id={id}
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="#234536"
          maxLength={7}
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-check${error ? ` ${id}-error` : ""}`}
          className="h-11 w-full rounded-sm border border-input bg-card px-3 font-mono text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
      </div>
      <p id={`${id}-check`} className={`text-sm ${valid && !readable ? "text-destructive" : "text-muted-foreground"}`} aria-live="polite">
        {!hex
          ? "Uses the AdeStay green."
          : !valid
            ? "Use a colour like #234536."
            : readable
              ? `Readable: ${contrastRatio(hex, "#ffffff").toFixed(1)}:1 with white text.`
              : "Too light to read. Choose a darker colour."}
      </p>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

export interface ProfileValues {
  display_name: string;
  tagline: string | null;
  about: string | null;
  primary_color: string | null;
  accent_color: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  contact_email: string | null;
  address: string | null;
  digital_address: string | null;
  landmark_directions: string | null;
  map_url: string | null;
  policies_md: string | null;
  terms_md: string | null;
  is_published: boolean;
}

export function ProfileForm({ tenantSlug, profile, canEdit }: { tenantSlug: string; profile: ProfileValues; canEdit: boolean }) {
  const { state, pending, formProps } = useActionForm(updateHostelProfile.bind(null, tenantSlug), initial);
  const e = state.fieldErrors ?? {};
  return (
    <form {...formProps} className="flex flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-6">
        <Group title="About the hostel">
          <TextField name="displayName" label="Hostel name" defaultValue={profile.display_name} maxLength={120} error={e.displayName} />
          <TextField name="tagline" label="Tagline" required={false} defaultValue={profile.tagline ?? ""} maxLength={160} error={e.tagline} />
          <AreaField name="about" label="About" defaultValue={profile.about ?? ""} maxLength={4000} error={e.about} />
        </Group>
        <Group title="Brand colours" description="Used on the public site. Colours must stay readable, so light colours are refused.">
          <div className="grid gap-5 md:grid-cols-2">
            <ColorField name="primaryColor" label="Main colour" defaultValue={profile.primary_color ?? ""} error={e.primaryColor} />
            <ColorField name="accentColor" label="Accent colour" defaultValue={profile.accent_color ?? ""} error={e.accentColor} />
          </div>
        </Group>
        <Group title="Contact and location">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField name="contactPhone" label="Phone" required={false} type="tel" defaultValue={profile.contact_phone ?? ""} error={e.contactPhone} placeholder="024 123 4567" />
            <TextField name="whatsappPhone" label="WhatsApp" required={false} type="tel" defaultValue={profile.whatsapp_phone ?? ""} error={e.whatsappPhone} placeholder="024 123 4567" />
            <TextField name="contactEmail" label="Email" required={false} type="email" inputMode="email" defaultValue={profile.contact_email ?? ""} error={e.contactEmail} />
            <TextField name="digitalAddress" label="Ghana Post GPS" required={false} defaultValue={profile.digital_address ?? ""} maxLength={12} error={e.digitalAddress} placeholder="GA-123-4567" />
          </div>
          <TextField name="address" label="Address" required={false} defaultValue={profile.address ?? ""} maxLength={300} error={e.address} />
          <AreaField name="landmarkDirections" label="Directions from a landmark" rows={2} defaultValue={profile.landmark_directions ?? ""} maxLength={500} error={e.landmarkDirections} />
          <TextField name="mapUrl" label="Map link" required={false} type="url" inputMode="url" defaultValue={profile.map_url ?? ""} maxLength={2000} error={e.mapUrl} placeholder="https://maps.app.goo.gl/…" />
        </Group>
        <Group title="House rules and terms">
          <AreaField name="policiesMd" label="House rules" rows={6} defaultValue={profile.policies_md ?? ""} maxLength={20000} error={e.policiesMd} />
          <AreaField name="termsMd" label="Booking terms" rows={6} defaultValue={profile.terms_md ?? ""} maxLength={20000} error={e.termsMd} />
        </Group>
        <Group title="Visibility">
          <CheckField name="isPublished" label="Show this hostel's public site" description="While off, visitors cannot see the profile." defaultChecked={profile.is_published} />
        </Group>
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Saving…" : "Save profile"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can view this profile. A hostel admin can change it.</p>
      )}
    </form>
  );
}

export function BrandingImageForm(props: { tenantSlug: string; kind: "logo" | "hero"; label: string; help: string; currentUrl: string | null; canEdit: boolean }) {
  const { tenantSlug, kind, label, help, currentUrl, canEdit } = props;
  const upload = useActionForm(uploadBrandingImage.bind(null, tenantSlug), imageInitial, { resetOnSuccess: true, prepare: prepareImageField });
  const remove = useActionForm(removeBrandingImage.bind(null, tenantSlug), imageInitial);
  const fileId = `branding-${kind}`;
  const error = upload.state.fieldErrors?.file;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base font-semibold">{label}</h3>
      {currentUrl ? (
        // A staff preview of a file in our own bucket; public pages use next/image in Phase 3.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={currentUrl} alt={`Current ${label.toLowerCase()}`} className={kind === "logo" ? "h-20 w-auto self-start rounded-sm border border-border bg-background object-contain p-2" : "aspect-video w-full max-w-md rounded-sm border border-border object-cover"} />
      ) : (
        <p className="text-sm text-muted-foreground">No image yet.</p>
      )}
      {canEdit ? (
        <>
          <FormMessage state={upload.state.fieldErrors ? { status: "idle" } : upload.state} />
          <form {...upload.formProps} className="flex flex-col gap-3" noValidate>
            <input type="hidden" name="kind" value={kind} />
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={fileId}>Choose a file</FieldLabel>
              <input
                id={fileId}
                name="file"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                aria-invalid={error ? true : undefined}
                aria-describedby={`${fileId}-help${error ? ` ${fileId}-error` : ""}`}
                className="min-h-11 w-full rounded-sm border border-input bg-card p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
              />
              <FieldDescription id={`${fileId}-help`}>{help}</FieldDescription>
              {error ? <FieldError id={`${fileId}-error`}>{error}</FieldError> : null}
            </Field>
            <div>
              <Button type="submit" variant="outline" disabled={upload.pending} aria-label={`Upload ${label.toLowerCase()}`}>
                {upload.pending ? "Uploading…" : "Upload"}
              </Button>
            </div>
          </form>
          {currentUrl ? (
            <form {...remove.formProps}>
              <input type="hidden" name="kind" value={kind} />
              <Button type="submit" variant="ghost" disabled={remove.pending}>
                {remove.pending ? "Removing…" : `Remove ${label.toLowerCase()}`}
              </Button>
            </form>
          ) : null}
          <FormMessage state={remove.state} />
        </>
      ) : null}
    </div>
  );
}

export interface OperationalValues {
  hold_duration_hours: number;
  hold_extension_max: number;
  deposit_policy: "none" | "fixed" | "percent" | "full";
  deposit_value: number;
  min_paid_percent_for_checkin: number;
  require_payment_before_allocation: boolean;
  student_id_required: boolean;
  gender_policy_enforced: boolean;
}

export function OperationalSettingsForm({ tenantSlug, settings, canEdit }: { tenantSlug: string; settings: OperationalValues; canEdit: boolean }) {
  const { state, pending, formProps } = useActionForm(updateOperationalSettings.bind(null, tenantSlug), initial);
  const [policy, setPolicy] = useState(settings.deposit_policy);
  const e = state.fieldErrors ?? {};
  const storedDeposit = settings.deposit_policy === "percent" ? String(settings.deposit_value) : "";
  return (
    <form {...formProps} className="flex flex-col gap-6" noValidate>
      <FormMessage state={state} />
      <fieldset disabled={!canEdit} className="flex flex-col gap-6">
        <Group title="Reservation holds" description="How long an approved student has to pay before the bed is released.">
          <div className="grid gap-5 md:grid-cols-2">
            <TextField name="holdDays" label="Hold period (days)" inputMode="numeric" defaultValue={String(Math.round(settings.hold_duration_hours / 24))} description="1 to 14 days." error={e.holdDays} />
            <TextField name="holdExtensionMax" label="Extensions allowed" inputMode="numeric" defaultValue={String(settings.hold_extension_max)} description="0 to 3 per reservation." error={e.holdExtensionMax} />
          </div>
        </Group>
        <Group title="Payment rules">
          <div className="grid gap-5 md:grid-cols-2">
            <SelectField
              name="depositPolicy"
              label="Deposit"
              defaultValue={settings.deposit_policy}
              error={e.depositPolicy}
              onValueChange={(value) => setPolicy(value as OperationalValues["deposit_policy"])}
              options={[
                { value: "none", label: "No deposit" },
                { value: "fixed", label: "Fixed amount per room price" },
                { value: "percent", label: "Percentage of the price" },
                { value: "full", label: "Full payment" },
              ]}
            />
            {policy === "percent" ? (
              <TextField
                key={policy}
                name="depositValue"
                label="Deposit (%)"
                inputMode="numeric"
                defaultValue={policy === settings.deposit_policy ? storedDeposit : ""}
                error={e.depositValue}
              />
            ) : null}
            {policy === "fixed" ? (
              <p className="self-center text-sm text-muted-strong">Set the deposit for each room type and period under Inventory, Prices.</p>
            ) : null}
            <TextField name="minPaidPercentForCheckin" label="Paid before check-in (%)" inputMode="numeric" defaultValue={String(settings.min_paid_percent_for_checkin)} description="0 to 100." error={e.minPaidPercentForCheckin} />
          </div>
          <CheckField name="requirePaymentBeforeAllocation" label="Require payment before assigning a bed" defaultChecked={settings.require_payment_before_allocation} />
        </Group>
        <Group title="Student details">
          <CheckField name="studentIdRequired" label="Ask for a student ID number" defaultChecked={settings.student_id_required} />
          <CheckField name="genderPolicyEnforced" label="Enforce male and female rooms" description="Only turn this on if the hostel separates rooms by gender. Gender is then collected from students." defaultChecked={settings.gender_policy_enforced} />
        </Group>
      </fieldset>
      {canEdit ? (
        <div>
          <Button type="submit" disabled={pending} className="w-full sm:w-auto">
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You can view these settings. A hostel admin can change them.</p>
      )}
    </form>
  );
}
