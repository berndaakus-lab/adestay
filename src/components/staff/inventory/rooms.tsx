"use client";

import { useRouter } from "next/navigation";
import { SelectField, TextField } from "@/components/forms/form-bits";
import { ConfirmAction, RecordDialog, TextAreaField } from "@/components/forms/record-dialog";
import { Badge } from "@/components/ui/badge";
import { formatDay, GENDER_POLICIES, labelOf, parseDayRange, UNIT_STATUSES, unitTone } from "@/lib/inventory-display";
import {
  createBed,
  createBedBlock,
  createRoom,
  deleteBed,
  deleteRoom,
  releaseBedBlock,
  updateBed,
  updateRoom,
  type InventoryFormState,
} from "@/lib/server/actions/inventory-actions";

const initial: InventoryFormState = { status: "idle" };

export interface TypeOption {
  id: string;
  name: string;
  occupancy: number;
}

export interface RoomValues {
  id: string;
  room_type_id: string;
  label: string;
  block: string | null;
  floor: string | null;
  gender_policy_override: string | null;
  status: string;
  notes: string | null;
}

export interface BlockRow {
  id: string;
  blocked: string;
  reason: string;
}

export interface BedRow {
  id: string;
  label: string;
  status: string;
  blocks: BlockRow[];
}

function RoomFields({ room, types, errors }: { room?: RoomValues; types: TypeOption[]; errors: Record<string, string> }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField name="label" label="Room number" placeholder="C-214" defaultValue={room?.label} maxLength={20} error={errors.label} />
        <SelectField
          name="roomTypeId"
          label="Room type"
          defaultValue={room?.room_type_id ?? types[0]?.id}
          options={types.map((type) => ({ value: type.id, label: `${type.name} (${type.occupancy} ${type.occupancy === 1 ? "bed" : "beds"})` }))}
          error={errors.roomTypeId}
        />
        <TextField name="block" label="Block" required={false} defaultValue={room?.block ?? ""} maxLength={40} error={errors.block} />
        <TextField name="floor" label="Floor" required={false} defaultValue={room?.floor ?? ""} maxLength={20} error={errors.floor} />
        <SelectField name="status" label="Status" defaultValue={room?.status ?? "active"} options={UNIT_STATUSES} error={errors.status} />
        <SelectField
          name="genderPolicyOverride"
          label="Who can stay"
          defaultValue={room?.gender_policy_override ?? ""}
          options={[{ value: "", label: "Same as room type" }, ...GENDER_POLICIES]}
          error={errors.genderPolicyOverride}
        />
      </div>
      <TextAreaField name="notes" label="Staff notes" rows={2} defaultValue={room?.notes ?? ""} maxLength={1000} error={errors.notes} />
    </>
  );
}

export function AddRoomButton({ tenantSlug, types }: { tenantSlug: string; types: TypeOption[] }) {
  return (
    <RecordDialog action={createRoom.bind(null, tenantSlug)} initial={initial} trigger="Add room" title="Add a room" description="Add its beds on the next screen." submit="Add room">
      {(errors) => <RoomFields types={types} errors={errors} />}
    </RecordDialog>
  );
}

export function RoomActions({ tenantSlug, room, types }: { tenantSlug: string; room: RoomValues; types: TypeOption[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-wrap gap-2">
      <RecordDialog
        action={updateRoom.bind(null, tenantSlug)}
        initial={initial}
        hidden={{ id: room.id }}
        trigger="Edit room"
        triggerVariant="outline"
        title={`Edit room ${room.label}`}
        submit="Save room"
      >
        {(errors) => <RoomFields room={room} types={types} errors={errors} />}
      </RecordDialog>
      <ConfirmAction
        action={async (previous: InventoryFormState, formData: FormData) => {
          const result = await deleteRoom(tenantSlug, previous, formData);
          if (result.status === "success") router.replace(`/t/${tenantSlug}/inventory/rooms`);
          return result;
        }}
        initial={initial}
        hidden={{ id: room.id }}
        trigger="Delete room"
        title={`Delete room ${room.label}?`}
        description="Its beds are deleted too. A room whose beds have block history cannot be deleted; retire it instead."
        confirm="Delete room"
      />
    </div>
  );
}

function BedFields({ bed, errors }: { bed?: BedRow; errors: Record<string, string> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextField name="label" label="Bed label" placeholder="A" defaultValue={bed?.label} maxLength={10} error={errors.label} />
      <SelectField name="status" label="Status" defaultValue={bed?.status ?? "active"} options={UNIT_STATUSES} error={errors.status} />
    </div>
  );
}

export function BedsPanel({ tenantSlug, roomId, beds, occupancy, canManage }: { tenantSlug: string; roomId: string; beds: BedRow[]; occupancy: number; canManage: boolean }) {
  const inUse = beds.filter((bed) => bed.status !== "retired").length;
  const nextLabel = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)).find((letter) => !beds.some((bed) => bed.label === letter));
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {inUse} of {occupancy} {occupancy === 1 ? "bed" : "beds"} set up.
      </p>
      {canManage && inUse < occupancy ? (
        <div>
          <RecordDialog action={createBed.bind(null, tenantSlug)} initial={initial} hidden={{ roomId }} trigger="Add bed" title="Add a bed" submit="Add bed">
            {(errors) => <BedFields bed={nextLabel ? { id: "", label: nextLabel, status: "active", blocks: [] } : undefined} errors={errors} />}
          </RecordDialog>
        </div>
      ) : null}
      {beds.length ? (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {beds.map((bed) => (
            <li key={bed.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  Bed {bed.label}
                  <Badge variant={unitTone(bed.status)}>{labelOf(UNIT_STATUSES, bed.status)}</Badge>
                </p>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <RecordDialog
                      action={createBedBlock.bind(null, tenantSlug)}
                      initial={initial}
                      hidden={{ bedId: bed.id }}
                      trigger="Block dates"
                      triggerLabel={`Block dates for bed ${bed.label}`}
                      triggerVariant="outline"
                      title={`Block bed ${bed.label}`}
                      description="The bed cannot be sold for any period that overlaps these days."
                      submit="Block bed"
                    >
                      {(errors) => (
                        <>
                          <div className="grid gap-4 sm:grid-cols-2">
                            <TextField name="startsOn" label="First day" type="date" error={errors.startsOn} />
                            <TextField name="endsOn" label="Last day" type="date" error={errors.endsOn} />
                          </div>
                          <TextField name="reason" label="Reason" maxLength={500} error={errors.reason} />
                        </>
                      )}
                    </RecordDialog>
                    <RecordDialog
                      action={updateBed.bind(null, tenantSlug)}
                      initial={initial}
                      hidden={{ id: bed.id }}
                      trigger="Edit"
                      triggerLabel={`Edit bed ${bed.label}`}
                      triggerVariant="outline"
                      title={`Edit bed ${bed.label}`}
                      submit="Save bed"
                    >
                      {(errors) => <BedFields bed={bed} errors={errors} />}
                    </RecordDialog>
                    <ConfirmAction
                      action={deleteBed.bind(null, tenantSlug)}
                      initial={initial}
                      hidden={{ id: bed.id }}
                      trigger="Delete"
                      triggerLabel={`Delete bed ${bed.label}`}
                      title={`Delete bed ${bed.label}?`}
                      description="A bed with block history cannot be deleted; retire it instead."
                      confirm="Delete bed"
                    />
                  </div>
                ) : null}
              </div>
              {bed.blocks.length ? (
                <ul className="flex flex-col gap-2">
                  {bed.blocks.map((block) => {
                    const days = parseDayRange(block.blocked);
                    const when = days ? `${formatDay(days.start)} to ${formatDay(days.end)}` : block.blocked;
                    return (
                      <li key={block.id} className="flex flex-col gap-2 rounded-sm bg-warning-bg p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="min-w-0 break-words">
                          <span className="font-medium">Blocked {when}.</span> {block.reason}
                        </span>
                        {canManage ? (
                          <ConfirmAction
                            action={releaseBedBlock.bind(null, tenantSlug)}
                            initial={initial}
                            hidden={{ id: block.id }}
                            trigger="Release"
                            triggerLabel={`Release block on bed ${bed.label}, ${when}`}
                            title="Release this block?"
                            description="The bed can be sold for these days again. The block stays in the history."
                            confirm="Release block"
                          />
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No beds yet.</p>
      )}
    </div>
  );
}
