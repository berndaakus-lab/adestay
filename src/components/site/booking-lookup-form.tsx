"use client";

import { useEffect, useRef } from "react";
import { FormMessage, TextField, useActionForm } from "@/components/forms/form-bits";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { lookupStatusCopy } from "@/lib/booking-status-copy";
import { lookupBookingStatus, type BookingLookupState } from "@/lib/server/actions/booking-lookup-actions";

const idle: BookingLookupState = { status: "idle" };

export function BookingLookupForm({ site }: { site: string }) {
  const { state, pending, formProps } = useActionForm(lookupBookingStatus, idle);
  const result = useRef<HTMLHeadingElement>(null);
  const errors = state.fieldErrors ?? {};
  const found = state.status === "found" && state.bookingStatus ? lookupStatusCopy(state.bookingStatus) : null;

  // Move keyboard and screen reader users to the answer, or to the first problem.
  useEffect(() => {
    if (state.status === "found") result.current?.focus();
    else if (state.fieldErrors) formProps.ref.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [state, formProps.ref]);

  return (
    <div className="flex flex-col gap-6">
      <form {...formProps} className="flex flex-col gap-5" noValidate aria-label="Check booking status">
        {state.status === "error" ? <FormMessage state={state} /> : null}
        <input type="hidden" name="site" value={site} />
        <TextField
          name="reference"
          label="Booking reference"
          autoComplete="off"
          maxLength={20}
          description="For example ALD-7K3Q9P."
          error={errors.reference}
        />
        <TextField
          name="contact"
          label="Email or phone you booked with"
          autoComplete="email"
          maxLength={254}
          error={errors.contact}
        />
        <Button type="submit" size="lg" disabled={pending} className="w-full">
          {pending ? "Checking…" : "Check status"}
        </Button>
      </form>

      {found ? (
        <section role="status" className="rounded-lg border border-border bg-card p-5">
          <h2 ref={result} tabIndex={-1} className="text-2xl outline-none">
            Your booking status
          </h2>
          <StatusBadge status={found.style} className="mt-3" />
          <p className="mt-3">{found.message}</p>
        </section>
      ) : null}
    </div>
  );
}
