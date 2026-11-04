"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  requestPasswordReset,
  requestStudentCode,
  startTotpEnrolment,
  staffSignIn,
  updatePassword,
  verifyStudentCode,
  verifyTotp,
  type EnrolResult,
  type FormState,
} from "@/lib/server/actions/auth-actions";

const initial: FormState = { status: "idle" };

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <Alert variant={state.status === "error" ? "destructive" : "default"} role={state.status === "error" ? "alert" : "status"}>
      <AlertDescription>{state.message}</AlertDescription>
    </Alert>
  );
}

function TextField(props: {
  id: string;
  label: string;
  error?: string;
  description?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "email" | "text";
  defaultValue?: string;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const { id, label, error, description, ...input } = props;
  const describedBy = [error ? `${id}-error` : null, description ? `${id}-desc` : null].filter(Boolean).join(" ") || undefined;
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={id} required aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...input} />
      {description ? <FieldDescription id={`${id}-desc`}>{description}</FieldDescription> : null}
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </Field>
  );
}

export function StaffSignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(staffSignIn, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next} />
      <TextField id="email" label="Email address" type="email" autoComplete="username" inputMode="email" defaultValue={state.email} error={state.fieldErrors?.email} />
      <TextField id="password" label="Password" type="password" autoComplete="current-password" error={state.fieldErrors?.password} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      <Link href="/forgot-password" className="text-center text-sm text-primary underline decoration-brass underline-offset-4">
        Forgot your password?
      </Link>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  if (state.status === "success") return <FormMessage state={state} />;
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField id="email" label="Email address" type="email" autoComplete="username" inputMode="email" error={state.fieldErrors?.email} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <TextField id="password" label="New password" type="password" autoComplete="new-password" description="At least 12 characters. A short sentence works well." error={state.fieldErrors?.password} />
      <TextField id="confirm" label="Confirm new password" type="password" autoComplete="new-password" error={state.fieldErrors?.confirm} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}

function TotpCodeForm({ factorId, next, submitLabel }: { factorId: string; next: string; submitLabel: string }) {
  const [state, action, pending] = useActionState(verifyTotp, initial);
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="factorId" value={factorId} />
      <input type="hidden" name="next" value={next} />
      <TextField id="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus error={state.fieldErrors?.code} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : submitLabel}
      </Button>
    </form>
  );
}

export function MfaVerifyForm({ factorId, next }: { factorId: string; next: string }) {
  return <TotpCodeForm factorId={factorId} next={next} submitLabel="Verify" />;
}

export function MfaSetup({ next }: { next: string }) {
  const [enrolment, setEnrolment] = useState<EnrolResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Enrol exactly once, even when React runs effects twice in development.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startTransition(async () => {
      const result = await startTotpEnrolment();
      if ("error" in result) setError(result.error);
      else setEnrolment(result);
    });
  }, []);

  if (error) return <FormMessage state={{ status: "error", message: error }} />;
  if (pending || !enrolment) return <p className="text-sm text-muted-foreground" role="status">Preparing your setup code…</p>;

  return (
    <div className="flex flex-col gap-6">
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>Open an authenticator app (Google Authenticator, Microsoft Authenticator or 1Password).</li>
        <li>Scan this QR code, or type the setup key.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      {/* QR code is an SVG data URL generated by Supabase Auth */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrolment.qrCode} alt="QR code for your authenticator app" className="mx-auto size-48 rounded-sm border border-border bg-white p-2" />
      <p className="text-center text-xs text-muted-foreground">
        Setup key: <code className="font-mono text-sm tracking-wider break-all text-foreground">{enrolment.secret}</code>
      </p>
      <TotpCodeForm factorId={enrolment.factorId} next={next} submitLabel="Turn on 2-step verification" />
    </div>
  );
}

export function StudentSignInForm({ next, site }: { next: string; site: string }) {
  const [requestState, requestAction, requesting] = useActionState(requestStudentCode, initial);
  const [verifyState, verifyAction, verifying] = useActionState(verifyStudentCode, initial);
  const [editingEmail, setEditingEmail] = useState(false);

  const codeSent = requestState.step === "code" && !editingEmail;
  const email = verifyState.email || requestState.email || "";

  if (!codeSent) {
    return (
      <form action={(fd) => { setEditingEmail(false); requestAction(fd); }} className="flex flex-col gap-5" noValidate>
        <FormMessage state={requestState} />
        <input type="hidden" name="site" value={site} />
        <TextField id="email" label="Email address" type="email" autoComplete="email" inputMode="email" defaultValue={email} description="We will email you a 6-digit code. No password needed." error={requestState.fieldErrors?.email} />
        <Button type="submit" disabled={requesting} className="w-full">
          {requesting ? "Sending code…" : "Email me a code"}
        </Button>
      </form>
    );
  }

  return (
    <form action={verifyAction} className="flex flex-col gap-5" noValidate>
      <FormMessage state={verifyState.status === "idle" ? requestState : verifyState} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="site" value={site} />
      <TextField id="code" label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} autoFocus error={verifyState.fieldErrors?.code} />
      <Button type="submit" disabled={verifying} className="w-full">
        {verifying ? "Checking…" : "Sign in"}
      </Button>
      <Button type="button" variant="link" className="self-center" onClick={() => setEditingEmail(true)}>
        Use a different email or resend the code
      </Button>
    </form>
  );
}
