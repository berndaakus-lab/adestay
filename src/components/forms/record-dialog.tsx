"use client";

import { useId, useState, type ReactNode } from "react";
import { FormMessage, useActionForm, type ActionFormState } from "@/components/forms/form-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

type Action<S> = (prev: S, formData: FormData) => Promise<S>;
type ButtonVariant = "default" | "outline" | "ghost" | "destructive";

/** The form lives inside the dialog content, so each opening starts clean with current values. */
function DialogForm<S extends ActionFormState>(props: {
  action: Action<S>;
  initial: S;
  hidden?: Record<string, string>;
  submit: string;
  destructive?: boolean;
  onDone: () => void;
  children?: (errors: Record<string, string>) => ReactNode;
}) {
  const { action, initial, hidden = {}, submit, destructive, onDone, children } = props;
  const { state, pending, formProps } = useActionForm(action, initial, { onSuccess: onDone });
  return (
    <form {...formProps} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && state.message ? <FormMessage state={state} /> : null}
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children?.(state.fieldErrors ?? {})}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending}>
          {pending ? "Saving…" : submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Add or edit a record in a dialog. */
export function RecordDialog<S extends ActionFormState>(props: {
  action: Action<S>;
  initial: S;
  hidden?: Record<string, string>;
  trigger: string;
  triggerLabel?: string;
  triggerVariant?: ButtonVariant;
  title: string;
  description?: string;
  submit: string;
  children: (errors: Record<string, string>) => ReactNode;
}) {
  const { trigger, triggerLabel, triggerVariant = "default", title, description, children, ...form } = props;
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant} aria-label={triggerLabel}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description ?? "Fields are required unless marked optional."}</DialogDescription>
        </DialogHeader>
        <DialogForm {...form} onDone={() => setOpen(false)}>
          {children}
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation for a delete or release. Problems such as "still in use" show inside the dialog. */
export function ConfirmAction<S extends ActionFormState>(props: {
  action: Action<S>;
  initial: S;
  hidden: Record<string, string>;
  trigger: string;
  triggerLabel?: string;
  title: string;
  description: string;
  confirm: string;
}) {
  const { action, initial, hidden, trigger, triggerLabel, title, description, confirm } = props;
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" aria-label={triggerLabel}>
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogForm action={action} initial={initial} hidden={hidden} submit={confirm} destructive onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function TextAreaField(props: { name: string; label: string; defaultValue?: string; maxLength: number; rows?: number; error?: string; description?: string }) {
  const { name, label, error, description, rows = 3, ...rest } = props;
  const id = `${useId()}-${name}`;
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

export function CheckboxField({ name, label, description, defaultChecked }: { name: string; label: string; description?: string; defaultChecked?: boolean }) {
  const id = `${useId()}-${name}`;
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
