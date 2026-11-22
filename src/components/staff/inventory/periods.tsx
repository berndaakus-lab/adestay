"use client";

import { ConfirmAction, RecordDialog } from "@/components/forms/record-dialog";
import { SelectField, TextField } from "@/components/forms/form-bits";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { formatDay, labelOf, PERIOD_KINDS, PERIOD_STATUSES } from "@/lib/inventory-display";
import { createBookingPeriod, deleteBookingPeriod, updateBookingPeriod, type InventoryFormState } from "@/lib/server/actions/inventory-actions";

const initial: InventoryFormState = { status: "idle" };

export interface PeriodRow {
  id: string;
  name: string;
  kind: string;
  starts_on: string;
  ends_on: string;
  booking_opens_at: string | null;
  booking_closes_at: string | null;
  status: string;
}

const toLocal = (iso: string | null) => (iso ? iso.slice(0, 16) : "");
const tone = (status: string) => (status === "open" ? "success" : status === "draft" ? "info" : "neutral") as "success" | "info" | "neutral";

function Fields({ period, errors }: { period?: PeriodRow; errors: Record<string, string> }) {
  return (
    <>
      <TextField name="name" label="Name" placeholder="2026/27 Academic Year" defaultValue={period?.name} maxLength={120} error={errors.name} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField name="kind" label="Type" defaultValue={period?.kind ?? "academic_year"} options={PERIOD_KINDS} error={errors.kind} />
        <SelectField name="status" label="Status" defaultValue={period?.status ?? "draft"} options={PERIOD_STATUSES} error={errors.status} />
        <TextField name="startsOn" label="First day" type="date" defaultValue={period?.starts_on} error={errors.startsOn} />
        <TextField name="endsOn" label="Last day" type="date" defaultValue={period?.ends_on} error={errors.endsOn} />
        <TextField name="bookingOpensAt" label="Bookings open" type="datetime-local" required={false} defaultValue={toLocal(period?.booking_opens_at ?? null)} error={errors.bookingOpensAt} />
        <TextField name="bookingClosesAt" label="Bookings close" type="datetime-local" required={false} defaultValue={toLocal(period?.booking_closes_at ?? null)} error={errors.bookingClosesAt} />
      </div>
    </>
  );
}

export function PeriodsPanel({ tenantSlug, periods, canManage }: { tenantSlug: string; periods: PeriodRow[]; canManage: boolean }) {
  const add = canManage ? (
    <RecordDialog action={createBookingPeriod.bind(null, tenantSlug)} initial={initial} trigger="Add period" title="Add a booking period" submit="Add period">
      {(errors) => <Fields errors={errors} />}
    </RecordDialog>
  ) : null;

  if (!periods.length) {
    return <EmptyState title="No booking periods yet" description="A period is the stay students book, such as an academic year or semester." action={add} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {add ? <div>{add}</div> : null}
      <ul className="divide-y divide-border rounded-sm border border-border">
        {periods.map((period) => (
          <li key={period.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="break-words">{period.name}</span>
                <Badge variant={tone(period.status)}>{labelOf(PERIOD_STATUSES, period.status)}</Badge>
              </p>
              <p className="text-sm text-muted-foreground">
                {labelOf(PERIOD_KINDS, period.kind)} · {formatDay(period.starts_on)} to {formatDay(period.ends_on)}
              </p>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <RecordDialog
                  action={updateBookingPeriod.bind(null, tenantSlug)}
                  initial={initial}
                  hidden={{ id: period.id }}
                  trigger="Edit"
                  triggerLabel={`Edit ${period.name}`}
                  triggerVariant="outline"
                  title={`Edit ${period.name}`}
                  submit="Save period"
                >
                  {(errors) => <Fields period={period} errors={errors} />}
                </RecordDialog>
                <ConfirmAction
                  action={deleteBookingPeriod.bind(null, tenantSlug)}
                  initial={initial}
                  hidden={{ id: period.id }}
                  trigger="Delete"
                  triggerLabel={`Delete ${period.name}`}
                  title={`Delete ${period.name}?`}
                  description="Its prices are deleted too. To keep the history, set the status to Archived instead."
                  confirm="Delete period"
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
