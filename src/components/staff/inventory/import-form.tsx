"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { commitInventoryImport, previewInventoryImport, type ImportFormState } from "@/lib/server/actions/import-actions";

const initial: ImportFormState = { status: "idle" };
const TEMPLATE = "room_type,room,block,floor,beds\r\n4 in a room,C-214,C,2,4\r\n2 in a room,C-215,C,2,Left;Right\r\n";
const FIELD_NAMES: Record<string, string> = { room_type: "Room type", room: "Room", block: "Block", floor: "Floor", beds: "Beds", row: "Row", header: "Header", file: "File" };

function Problems({ state }: { state: ImportFormState }) {
  if (!state.errors?.length) return null;
  const hidden = (state.errorCount ?? state.errors.length) - state.errors.length;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Rows to fix</h3>
      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-sm border border-border" tabIndex={0} aria-label="Rows to fix">
        {state.errors.map((issue, index) => (
          <li key={`${issue.line}-${issue.field}-${index}`} className="flex flex-col gap-0.5 p-3 text-sm sm:flex-row sm:gap-3">
            <span className="shrink-0 font-semibold tabular-nums">{issue.line > 0 ? `Line ${issue.line}` : "File"}</span>
            <span className="shrink-0 text-muted-foreground">{FIELD_NAMES[issue.field] ?? issue.field}</span>
            <span className="min-w-0 break-words">{issue.message}</span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? <p className="text-sm text-muted-foreground">And {hidden} more. Fix these and preview again.</p> : null}
    </div>
  );
}

function Summary({ state }: { state: ImportFormState }) {
  if (!state.byType?.length) return null;
  return (
    <ul className="divide-y divide-border rounded-sm border border-border">
      {state.byType.map((row) => (
        <li key={row.room_type} className="flex flex-wrap justify-between gap-2 p-3 text-sm">
          <span className="font-medium break-words">{row.room_type}</span>
          <span className="tabular-nums text-muted-foreground">
            {row.rooms} {row.rooms === 1 ? "room" : "rooms"}, {row.beds} {row.beds === 1 ? "bed" : "beds"}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function InventoryImportForm({ tenantSlug }: { tenantSlug: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [run, setRun] = useState(0);
  const [latest, setLatest] = useState<ImportFormState>(initial);
  const track = (fn: typeof previewInventoryImport) => async (previous: ImportFormState, formData: FormData) => {
    const result = await fn(tenantSlug, previous, formData);
    setLatest(result);
    if (result.status === "imported") {
      formRef.current?.reset();
      setRun((count) => count + 1);
    }
    return result;
  };
  const [, preview, previewing] = useActionState(track(previewInventoryImport), initial);
  const [, commit, committing] = useActionState(track(commitInventoryImport), initial);
  const busy = previewing || committing;
  const send = (action: (formData: FormData) => void) => {
    if (!formRef.current) return;
    const formData = new FormData(formRef.current);
    startTransition(() => action(formData));
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-sm">
        <p>One row per room. The room types must already exist.</p>
        <ul className="list-disc pl-5 text-muted-foreground">
          <li>
            <span className="font-mono text-xs">beds</span> is a number (4 makes beds A to D) or labels like Left;Right.
          </li>
          <li>
            <span className="font-mono text-xs">block</span> and <span className="font-mono text-xs">floor</span> can be empty.
          </li>
          <li>In Excel or Sheets, save as CSV UTF-8. Up to 500 rooms.</li>
        </ul>
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`} download="adestay-rooms-template.csv" className="inline-flex min-h-11 items-center self-start text-primary underline decoration-brass underline-offset-4">
          Download the template
        </a>
      </div>

      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();
          send(preview);
        }}
        className="flex flex-col gap-4 sm:max-w-md"
        noValidate
      >
        <Field>
          <FieldLabel htmlFor="import-file">CSV file</FieldLabel>
          <input
            key={run}
            id="import-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            aria-describedby="import-file-help"
            onChange={() => setLatest(initial)}
            className="min-h-11 w-full rounded-sm border border-input bg-card p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          <FieldDescription id="import-file-help">Nothing is saved until you confirm the preview.</FieldDescription>
        </Field>
        <div>
          <Button type="submit" variant={latest.status === "preview" ? "outline" : "default"} disabled={busy}>
            {previewing ? "Checking…" : "Preview import"}
          </Button>
        </div>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {latest.message ? (
          <Alert variant={latest.status === "error" ? "destructive" : "default"}>
            <AlertDescription>{latest.message}</AlertDescription>
          </Alert>
        ) : null}
        <Problems state={latest} />
        <Summary state={latest} />
      </div>
      {latest.status === "preview" ? (
        <div>
          <Button type="button" disabled={busy} onClick={() => send(commit)}>
            {committing ? "Importing…" : `Import ${latest.rooms} rooms and ${latest.beds} beds`}
          </Button>
        </div>
      ) : null}
      {latest.status === "imported" ? (
        <Link href={`/t/${tenantSlug}/inventory/rooms`} className="text-sm text-primary underline decoration-brass underline-offset-4">
          View rooms
        </Link>
      ) : null}
    </div>
  );
}
