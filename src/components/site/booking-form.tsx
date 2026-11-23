"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { FormMessage, SelectField, TextField, useActionForm } from "@/components/forms/form-bits";
import { MoneyAmount } from "@/components/money-amount";
import { AvailabilityBadge } from "@/components/site/availability-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { submitBookingRequest, type BookingFormState } from "@/lib/server/actions/booking-actions";

export interface BookingOption {
  periodId: string;
  periodName: string;
  dates: string;
  roomTypeId: string;
  roomName: string;
  amountMinor: number;
  depositMinor: number;
  availability: "available" | "limited" | "full";
}

const idle: BookingFormState = { status: "idle" };

function Confirmation({ state, hostelName, roomsHref, statusHref }: { state: BookingFormState; hostelName: string; roomsHref: string; statusHref?: string }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <div className="flex flex-col gap-5" role="status">
      <h2 ref={heading} tabIndex={-1} className="text-3xl outline-none">
        We have your request
      </h2>
      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Your booking reference</p>
        <p className="mt-1 font-mono text-2xl font-semibold tracking-wider break-all">{state.reference}</p>
      </div>
      {state.emailSent === false ? (
        <Alert>
          <AlertDescription>We could not email a confirmation. Please write down or screenshot your reference.</AlertDescription>
        </Alert>
      ) : null}
      {state.emailSent ? <p>We have emailed this reference to you.</p> : null}
      <div>
        <h3 className="text-xl">What happens next</h3>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>This request does not reserve a place yet.</li>
          <li>{hostelName} reviews it and tells you the decision.</li>
          <li>If approved, a place is held for you for a limited time while you pay the deposit.</li>
        </ol>
      </div>
      <div className="flex flex-wrap gap-3">
        {statusHref ? (
          <Button asChild>
            <Link href={statusHref}>Check booking status</Link>
          </Button>
        ) : null}
        <Button asChild variant="outline">
          <Link href={roomsHref}>Back to rooms</Link>
        </Button>
      </div>
    </div>
  );
}

export function BookingForm(props: {
  site: string;
  hostelName: string;
  options: BookingOption[];
  defaultPeriodId: string;
  defaultRoomTypeId: string;
  idempotencyKey: string;
  studentIdRequired: boolean;
  genderRequired: boolean;
  roomsHref: string;
  policiesHref: string;
  statusHref?: string;
}) {
  const { site, hostelName, options, studentIdRequired, genderRequired, roomsHref, policiesHref, statusHref } = props;
  // One key for the life of this form, so a double click or retry returns the same reference.
  const [idempotencyKey] = useState(props.idempotencyKey);
  const [periodId, setPeriodId] = useState(props.defaultPeriodId);
  const [roomTypeId, setRoomTypeId] = useState(props.defaultRoomTypeId);
  const noteId = useId();
  const { state, pending, formProps } = useActionForm(submitBookingRequest, idle);
  const errors = state.fieldErrors ?? {};

  // After a failed submit, move keyboard and screen reader users to the first problem.
  useEffect(() => {
    if (state.status === "error" && state.fieldErrors) {
      formProps.ref.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
    }
  }, [state, formProps.ref]);

  if (state.status === "success" && state.reference) {
    return <Confirmation state={state} hostelName={hostelName} roomsHref={roomsHref} statusHref={statusHref} />;
  }

  const periods = [...new Map(options.map((o) => [o.periodId, o])).values()];
  const inPeriod = options.filter((o) => o.periodId === periodId);
  const selected = inPeriod.find((o) => o.roomTypeId === roomTypeId) ?? inPeriod[0];

  return (
    <form {...formProps} className="flex flex-col gap-6" noValidate aria-label="Booking request">
      <FormMessage state={state} />
      <input type="hidden" name="site" value={site} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-heading text-2xl">Your room</legend>
        <SelectField
          name="periodId"
          label="Booking period"
          defaultValue={periodId}
          error={errors.periodId}
          options={periods.map((p) => ({ value: p.periodId, label: p.periodName }))}
          onValueChange={(value) => {
            setPeriodId(value);
            const stillOffered = options.some((o) => o.periodId === value && o.roomTypeId === roomTypeId);
            if (!stillOffered) setRoomTypeId(options.find((o) => o.periodId === value)?.roomTypeId ?? "");
          }}
        />
        <SelectField
          key={periodId}
          name="roomTypeId"
          label="Room type"
          defaultValue={selected?.roomTypeId}
          error={errors.roomTypeId}
          options={inPeriod.map((o) => ({ value: o.roomTypeId, label: o.roomName }))}
          onValueChange={setRoomTypeId}
        />
        {selected ? (
          <div className="rounded-lg border border-border bg-card p-4" aria-live="polite">
            <div className="flex items-start justify-between gap-3">
              <p className="font-semibold">{selected.roomName}</p>
              <AvailabilityBadge availability={selected.availability} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{selected.dates}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-muted-foreground">Price</dt>
                <dd><MoneyAmount pesewas={selected.amountMinor} className="font-semibold" /></dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Deposit</dt>
                <dd>{selected.depositMinor > 0 ? <MoneyAmount pesewas={selected.depositMinor} className="font-semibold" /> : "None"}</dd>
              </div>
            </dl>
            {selected.availability === "full" ? (
              <p className="mt-3 text-sm">This room type is fully booked. You can still send a request, and the hostel may add you to its waitlist.</p>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-3 font-heading text-2xl">Your details</legend>
        <TextField name="fullName" label="Full name" autoComplete="name" maxLength={120} error={errors.fullName} />
        <TextField name="phone" label="Phone number" type="tel" autoComplete="tel" description="For example 024 123 4567." error={errors.phone} />
        <TextField name="institution" label="School or university" autoComplete="organization" maxLength={120} required={false} error={errors.institution} />
        <TextField name="programme" label="Programme" maxLength={120} required={false} error={errors.programme} />
        <TextField name="level" label="Level or year" maxLength={40} required={false} error={errors.level} />
        {studentIdRequired ? <TextField name="studentId" label="Student ID number" maxLength={40} error={errors.studentId} /> : null}
        {genderRequired ? (
          <SelectField
            name="gender"
            label="Gender"
            defaultValue=""
            error={errors.gender}
            options={[
              { value: "", label: "Choose an option" },
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
              { value: "undisclosed", label: "Prefer not to say" },
            ]}
          />
        ) : null}
        <Field data-invalid={errors.note ? true : undefined}>
          <FieldLabel htmlFor={noteId}>
            Note to the hostel <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Textarea id={noteId} name="note" rows={3} maxLength={1000} aria-invalid={errors.note ? true : undefined} aria-describedby={errors.note ? `${noteId}-error` : undefined} />
          {errors.note ? <FieldError id={`${noteId}-error`}>{errors.note}</FieldError> : null}
        </Field>
      </fieldset>

      <p className="text-sm text-muted-foreground">
        By sending this request you share these details with {hostelName} and accept its{" "}
        <Link href={policiesHref} className="text-primary underline decoration-brass underline-offset-4">
          policies and booking terms
        </Link>
        .
      </p>
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Sending your request…" : "Send booking request"}
      </Button>
    </form>
  );
}
