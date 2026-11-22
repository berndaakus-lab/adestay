"use client";

import { FormMessage, TextField, useActionForm } from "@/components/forms/form-bits";
import { ConfirmAction } from "@/components/forms/record-dialog";
import { Button } from "@/components/ui/button";
import { formatGhs } from "@/lib/money";
import { deleteRoomTypePrice, setRoomTypePrice, type InventoryFormState } from "@/lib/server/actions/inventory-actions";

const initial: InventoryFormState = { status: "idle" };

export interface PriceRow {
  roomTypeId: string;
  roomTypeName: string;
  priceId: string | null;
  amountMinor: number | null;
  depositMinor: number | null;
}

const cedis = (minor: number | null) => (minor === null ? "" : (minor / 100).toFixed(2));

function PriceForm({ tenantSlug, periodId, row }: { tenantSlug: string; periodId: string; row: PriceRow }) {
  const { state, pending, formProps } = useActionForm(setRoomTypePrice.bind(null, tenantSlug), initial);
  return (
    <li className="flex flex-col gap-3 p-4">
      <h3 className="text-sm font-semibold break-words">{row.roomTypeName}</h3>
      {state.message ? <FormMessage state={state} /> : null}
      <form {...formProps} className="grid items-start gap-3 sm:grid-cols-[1fr_1fr_auto]" noValidate>
        <input type="hidden" name="roomTypeId" value={row.roomTypeId} />
        <input type="hidden" name="bookingPeriodId" value={periodId} />
        <TextField name="amount" label={`Price for ${row.roomTypeName} (GH₵)`} inputMode="text" defaultValue={cedis(row.amountMinor)} placeholder="4,500.00" error={state.fieldErrors?.amount} />
        <TextField name="deposit" label={`Deposit for ${row.roomTypeName} (GH₵)`} inputMode="text" defaultValue={row.depositMinor === null ? "0.00" : cedis(row.depositMinor)} error={state.fieldErrors?.deposit} />
        <div className="flex flex-wrap gap-2 sm:mt-6">
          <Button type="submit" variant="outline" disabled={pending} aria-label={`Save price for ${row.roomTypeName}`}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
      {row.priceId ? (
        <div>
          <ConfirmAction
            action={deleteRoomTypePrice.bind(null, tenantSlug)}
            initial={initial}
            hidden={{ id: row.priceId }}
            trigger="Remove price"
            triggerLabel={`Remove price for ${row.roomTypeName}`}
            title={`Remove the price for ${row.roomTypeName}?`}
            description="This room type cannot be booked for this period until it has a price."
            confirm="Remove price"
          />
        </div>
      ) : null}
    </li>
  );
}

export function PricesPanel({ tenantSlug, periodId, rows, canManage }: { tenantSlug: string; periodId: string; rows: PriceRow[]; canManage: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-sm border border-border">
      {rows.map((row) =>
        canManage ? (
          <PriceForm key={`${periodId}-${row.roomTypeId}-${row.priceId ?? "new"}`} tenantSlug={tenantSlug} periodId={periodId} row={row} />
        ) : (
          <li key={row.roomTypeId} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold break-words">{row.roomTypeName}</span>
            <span className="text-sm tabular-nums">
              {row.amountMinor === null ? "No price yet" : `${formatGhs(row.amountMinor)} · deposit ${formatGhs(row.depositMinor ?? 0)}`}
            </span>
          </li>
        ),
      )}
    </ul>
  );
}
