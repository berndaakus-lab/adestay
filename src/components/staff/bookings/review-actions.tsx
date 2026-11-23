"use client";

import { useId, useState } from "react";
import { FormMessage, TextField, useActionForm } from "@/components/forms/form-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { BookingDecision } from "@/lib/booking-review";
import type { BookingReviewState } from "@/lib/server/actions/booking-review-actions";

type ReviewAction = (prev: BookingReviewState, formData: FormData) => Promise<BookingReviewState>;
const idle: BookingReviewState = { status: "idle" };

interface DecisionCopy {
  trigger: string;
  title: string;
  description: string;
  confirm: string;
  variant: "default" | "outline" | "destructive";
  reason?: { label: string; hint: string };
  hours?: boolean;
  /** Holds use the reservation id; everything else uses the request id. */
  onReservation?: boolean;
}

const COPY: Record<Exclude<BookingDecision, "start">, DecisionCopy> = {
  approve: {
    trigger: "Approve",
    title: "Approve this request?",
    description: "This holds a place for the student for the hostel's hold period. Their specific bed is assigned later.",
    confirm: "Approve request",
    variant: "default",
  },
  waitlist: {
    trigger: "Waitlist",
    title: "Add to the waitlist?",
    description: "The request stays open but does not hold a place. You can approve it later if a bed frees up.",
    confirm: "Add to waitlist",
    variant: "outline",
  },
  reject: {
    trigger: "Reject",
    title: "Reject this request?",
    description: "This cannot be undone. The student would need to send a new request.",
    confirm: "Reject request",
    variant: "destructive",
    reason: { label: "Reason", hint: "The student will see this reason, so write it for them." },
  },
  confirm: {
    trigger: "Confirm place",
    title: "Confirm this place?",
    description: "Use this when the deposit has been received. A confirmed place no longer expires.",
    confirm: "Confirm place",
    variant: "default",
    reason: { label: "Reason", hint: "For example how and when the deposit was paid. Staff records only." },
    onReservation: true,
  },
  extend: {
    trigger: "Extend hold",
    title: "Extend this hold?",
    description: "Holds can be extended a limited number of times, up to the hostel's hold period each time.",
    confirm: "Extend hold",
    variant: "outline",
    reason: { label: "Reason", hint: "Staff records only." },
    hours: true,
    onReservation: true,
  },
  cancel: {
    trigger: "Cancel booking",
    title: "Cancel this booking?",
    description: "This releases the place and cannot be undone.",
    confirm: "Cancel booking",
    variant: "destructive",
    reason: { label: "Reason", hint: "Staff records only. No email is sent, so tell the student yourself." },
  },
};

function DecisionForm({ action, id, copy, onDone }: { action: ReviewAction; id: string; copy: DecisionCopy; onDone: (state: BookingReviewState) => void }) {
  const { state, pending, formProps } = useActionForm(action, idle, { onSuccess: onDone });
  const reasonId = `${useId()}-reason`;
  const errors = state.fieldErrors ?? {};
  return (
    <form {...formProps} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <FormMessage state={state} /> : null}
      <input type="hidden" name="id" value={id} />
      {copy.hours ? <TextField name="hours" label="Extra hours" inputMode="numeric" defaultValue="24" maxLength={3} error={errors.hours} /> : null}
      {copy.reason ? (
        <Field data-invalid={errors.reason ? true : undefined}>
          <FieldLabel htmlFor={reasonId}>{copy.reason.label}</FieldLabel>
          <Textarea
            id={reasonId}
            name="reason"
            required
            rows={3}
            maxLength={500}
            aria-invalid={errors.reason ? true : undefined}
            aria-describedby={`${reasonId}-hint${errors.reason ? ` ${reasonId}-error` : ""}`}
          />
          <FieldDescription id={`${reasonId}-hint`}>{copy.reason.hint}</FieldDescription>
          {errors.reason ? <FieldError id={`${reasonId}-error`}>{errors.reason}</FieldError> : null}
        </Field>
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Go back
          </Button>
        </DialogClose>
        <Button type="submit" variant={copy.variant === "destructive" ? "destructive" : "default"} disabled={pending}>
          {pending ? "Saving…" : copy.confirm}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DecisionDialog({ action, id, copy, onDone }: { action: ReviewAction; id: string; copy: DecisionCopy; onDone: (state: BookingReviewState) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={copy.variant}>
          {copy.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DecisionForm
          action={action}
          id={id}
          copy={copy}
          onDone={(state) => {
            setOpen(false);
            onDone(state);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function StartReview({ action, id, onDone }: { action: ReviewAction; id: string; onDone: (state: BookingReviewState) => void }) {
  const { state, pending, formProps } = useActionForm(action, idle, { onSuccess: onDone });
  return (
    <form {...formProps}>
      {state.status === "error" ? <FormMessage state={state} /> : null}
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Saving…" : "Start review"}
      </Button>
    </form>
  );
}

export function ReviewActions({ requestId, reservationId, decisions, actions }: {
  requestId: string;
  reservationId: string | null;
  decisions: BookingDecision[];
  actions: Partial<Record<BookingDecision, ReviewAction>>;
}) {
  const [result, setResult] = useState<BookingReviewState | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {result?.message ? <FormMessage state={result} /> : null}
      {result?.warning ? (
        <Alert role="alert" className="border-warning bg-warning-bg text-warning">
          <AlertDescription className="font-semibold text-warning">{result.warning}</AlertDescription>
        </Alert>
      ) : null}
      {decisions.length ? (
        <div className="flex flex-wrap gap-2">
          {decisions.map((decision) => {
            const action = actions[decision];
            if (!action) return null;
            if (decision === "start") return <StartReview key={decision} action={action} id={requestId} onDone={setResult} />;
            const copy = COPY[decision];
            const id = copy.onReservation ? reservationId : requestId;
            return id ? <DecisionDialog key={decision} action={action} id={id} copy={copy} onDone={setResult} /> : null;
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No actions are available for this booking.</p>
      )}
    </div>
  );
}
