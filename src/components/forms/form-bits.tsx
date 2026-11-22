"use client";

import { startTransition, useActionState, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** Shared pieces for staff and platform forms (docs/UI_UX_DESIGN_SYSTEM.md §4). */
export interface ActionFormState {
  status: string;
  message?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * useActionState for staff forms. React resets a form after its action runs, which would wipe what
 * the person typed whenever validation fails, so submission goes through onSubmit instead. The
 * `action` stays on the form so it still works before hydration.
 */
export function useActionForm<S extends ActionFormState>(
  action: (prev: S, formData: FormData) => Promise<S>,
  initial: S,
  options: {
    resetOnSuccess?: boolean;
    onSuccess?: (state: S) => void;
    /** Runs in the browser before sending; may change the form data. Returns a field error for `file`. */
    prepare?: (formData: FormData) => Promise<string | null>;
  } = {},
) {
  const ref = useRef<HTMLFormElement>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionFormState, FormData>(async (previous, formData) => {
    const next = await action(previous as S, formData);
    if (next.status === "success") {
      if (options.resetOnSuccess) ref.current?.reset();
      options.onSuccess?.(next);
    }
    return next;
  }, initial);
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPrepareError(null);
    if (options.prepare) {
      setPreparing(true);
      const error = await options.prepare(formData);
      setPreparing(false);
      if (error) {
        setPrepareError(error);
        return;
      }
    }
    startTransition(() => formAction(formData));
  };
  const shown = prepareError ? ({ status: "error", fieldErrors: { file: prepareError } } as ActionFormState) : state;
  return { state: shown as S, pending: pending || preparing, formProps: { ref, action: formAction, onSubmit } };
}

export function FormMessage({ state }: { state: ActionFormState }) {
  if (!state.message) return null;
  const isError = state.status === "error";
  return (
    <Alert variant={isError ? "destructive" : "default"} role={isError ? "alert" : "status"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

export function TextField(props: {
  name: string;
  label: string;
  error?: string;
  description?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "email" | "text" | "url";
  defaultValue?: string;
  maxLength?: number;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { name, label, error, description, required = true, className, ...input } = props;
  const id = `${useId()}-${name}`;
  const describedBy = [error ? `${id}-error` : null, description ? `${id}-desc` : null].filter(Boolean).join(" ") || undefined;
  return (
    <Field data-invalid={error ? true : undefined} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {required ? null : <span className="font-normal text-muted-foreground"> (optional)</span>}
      </FieldLabel>
      <Input id={id} name={name} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {description ? <FieldDescription id={`${id}-desc`}>{description}</FieldDescription> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

/** A native select: reliable on phones and with screen readers, and it posts with the form. */
export function SelectField(props: {
  name: string;
  label: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  error?: string;
  onValueChange?: (value: string) => void;
}) {
  const { name, label, options, defaultValue, error, onValueChange } = props;
  const id = `${useId()}-${name}`;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        onChange={onValueChange ? (event) => onValueChange(event.target.value) : undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="h-11 w-full rounded-sm border border-input bg-card px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

/** Confirmation with a required reason, for changes that affect a live hostel (§4). */
export function ReasonDialog<S extends ActionFormState>(props: {
  action: (prev: S, formData: FormData) => Promise<S>;
  initial: S;
  hidden: Record<string, string>;
  trigger: string;
  title: string;
  description: ReactNode;
  confirm: string;
  destructive?: boolean;
}) {
  const { action, initial, hidden, trigger, title, description, confirm, destructive } = props;
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(action, initial, { resetOnSuccess: true, onSuccess: () => setOpen(false) });
  const reasonId = `${useId()}-reason`;

  const error = state.fieldErrors?.reason;
  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant={destructive ? "destructive" : "default"}>
            {trigger}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <form {...formProps} className="flex flex-col gap-4" noValidate>
            {state.status === "error" ? <FormMessage state={state} /> : null}
            {Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
              <Textarea
                id={reasonId}
                name="reason"
                required
                maxLength={500}
                rows={3}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${reasonId}-error` : undefined}
              />
              {error ? <FieldError id={`${reasonId}-error`}>{error}</FieldError> : null}
            </Field>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
                {pending ? "Saving…" : confirm}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {state.status === "success" ? <FormMessage state={state} /> : null}
    </>
  );
}
