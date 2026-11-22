"use client";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { FormMessage, SelectField, TextField, useActionForm } from "@/components/forms/form-bits";
import { CheckboxField, ConfirmAction, RecordDialog, TextAreaField } from "@/components/forms/record-dialog";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GENDER_POLICIES, labelOf } from "@/lib/inventory-display";
import { prepareImageField } from "@/lib/prepare-image";
import { createRoomType, deleteRoomType, updateRoomType, type InventoryFormState } from "@/lib/server/actions/inventory-actions";
import { deleteRoomTypePhoto, updateRoomTypePhoto, uploadRoomTypePhoto } from "@/lib/server/actions/upload-actions";

const initial: InventoryFormState = { status: "idle" };

export interface PhotoRow {
  id: string;
  url: string;
  alt_text: string;
  sort_order: number;
}

export interface RoomTypeRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  occupancy: number;
  gender_policy: string;
  amenities: string[];
  is_published: boolean;
  sort_order: number;
  photos: PhotoRow[];
  roomCount: number;
}

function Fields({ type, errors }: { type?: RoomTypeRow; errors: Record<string, string> }) {
  return (
    <>
      <TextField name="name" label="Name" placeholder="4 in a room" defaultValue={type?.name} maxLength={80} error={errors.name} />
      <TextField name="slug" label="Web address name" required={false} defaultValue={type?.slug} maxLength={60} description="Made from the name if left empty." error={errors.slug} />
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField name="occupancy" label="Beds per room" inputMode="numeric" defaultValue={type ? String(type.occupancy) : ""} error={errors.occupancy} />
        <SelectField name="genderPolicy" label="Who can book" defaultValue={type?.gender_policy ?? "any"} options={GENDER_POLICIES} error={errors.genderPolicy} />
        <TextField name="sortOrder" label="Display order" inputMode="numeric" defaultValue={String(type?.sort_order ?? 0)} error={errors.sortOrder} />
      </div>
      <TextAreaField name="description" label="Description" defaultValue={type?.description ?? ""} maxLength={4000} error={errors.description} />
      <TextAreaField name="amenities" label="Amenities" rows={2} defaultValue={type?.amenities.join(", ") ?? ""} maxLength={2000} description="Separate with commas, e.g. Wi-Fi, desk, fan." error={errors.amenities} />
      <CheckboxField name="isPublished" label="Show on the public site" defaultChecked={type?.is_published} />
    </>
  );
}

function UploadPhoto({ tenantSlug, type }: { tenantSlug: string; type: RoomTypeRow }) {
  const { state, pending, formProps } = useActionForm(uploadRoomTypePhoto.bind(null, tenantSlug), initial, { resetOnSuccess: true, prepare: prepareImageField });
  const fileId = `photo-file-${type.id}`;
  const error = state.fieldErrors?.file;
  return (
    <form {...formProps} className="flex flex-col gap-3 sm:max-w-md" noValidate>
      {state.message ? <FormMessage state={state} /> : null}
      <input type="hidden" name="roomTypeId" value={type.id} />
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={fileId}>Add a photo</FieldLabel>
        <input
          id={fileId}
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={error ? true : undefined}
          aria-describedby={`${fileId}-help${error ? ` ${fileId}-error` : ""}`}
          className="min-h-11 w-full rounded-sm border border-input bg-card p-2 text-sm file:mr-3 file:rounded-sm file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium"
        />
        <FieldDescription id={`${fileId}-help`}>JPEG, PNG or WebP.</FieldDescription>
        {error ? <FieldError id={`${fileId}-error`}>{error}</FieldError> : null}
      </Field>
      <TextField name="altText" label="Describe the photo" description="Read aloud to people using screen readers." maxLength={200} error={state.fieldErrors?.altText} />
      <div>
        <Button type="submit" variant="outline" disabled={pending} aria-label={`Upload photo for ${type.name}`}>
          {pending ? "Uploading…" : "Upload photo"}
        </Button>
      </div>
    </form>
  );
}

function Photos({ tenantSlug, type, canManage }: { tenantSlug: string; type: RoomTypeRow; canManage: boolean }) {
  return (
    <details className="rounded-sm border border-border">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">
        Photos ({type.photos.length})<span className="sr-only"> for {type.name}</span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-3">
        {type.photos.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {type.photos.map((photo) => (
              <li key={photo.id} className="flex flex-col gap-2">
                {/* A staff preview of a file in our own bucket; public pages use next/image in Phase 3. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt={photo.alt_text} loading="lazy" className="aspect-video w-full rounded-sm border border-border object-cover" />
                <p className="text-xs break-words text-muted-foreground">{photo.alt_text}</p>
                {canManage ? (
                  <div className="flex flex-wrap gap-2">
                    <RecordDialog
                      action={updateRoomTypePhoto.bind(null, tenantSlug)}
                      initial={initial}
                      hidden={{ id: photo.id }}
                      trigger="Edit"
                      triggerLabel={`Edit photo: ${photo.alt_text}`}
                      triggerVariant="outline"
                      title="Edit photo"
                      submit="Save photo"
                    >
                      {(errors) => (
                        <>
                          <TextField name="altText" label="Describe the photo" defaultValue={photo.alt_text} maxLength={200} error={errors.altText} />
                          <TextField name="sortOrder" label="Display order" inputMode="numeric" defaultValue={String(photo.sort_order)} error={errors.sortOrder} />
                        </>
                      )}
                    </RecordDialog>
                    <ConfirmAction
                      action={deleteRoomTypePhoto.bind(null, tenantSlug)}
                      initial={initial}
                      hidden={{ id: photo.id }}
                      trigger="Delete"
                      triggerLabel={`Delete photo: ${photo.alt_text}`}
                      title="Delete this photo?"
                      description="It is removed from the public site."
                      confirm="Delete photo"
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No photos yet.</p>
        )}
        {canManage ? <UploadPhoto tenantSlug={tenantSlug} type={type} /> : null}
      </div>
    </details>
  );
}

export function RoomTypesPanel({ tenantSlug, types, canManage }: { tenantSlug: string; types: RoomTypeRow[]; canManage: boolean }) {
  const add = canManage ? (
    <RecordDialog action={createRoomType.bind(null, tenantSlug)} initial={initial} trigger="Add room type" title="Add a room type" submit="Add room type">
      {(errors) => <Fields errors={errors} />}
    </RecordDialog>
  ) : null;

  if (!types.length) {
    return <EmptyState title="No room types yet" description="A room type is what students book, such as “4 in a room”." action={add} />;
  }
  return (
    <div className="flex flex-col gap-4">
      {add ? <div>{add}</div> : null}
      <ul className="flex flex-col gap-3">
        {types.map((type) => (
          <li key={type.id} className="flex flex-col gap-3 rounded-sm border border-border p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                  <span className="break-words">{type.name}</span>
                  <Badge variant={type.is_published ? "success" : "neutral"}>{type.is_published ? "Published" : "Hidden"}</Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  {type.occupancy} {type.occupancy === 1 ? "bed" : "beds"} per room · {type.roomCount} {type.roomCount === 1 ? "room" : "rooms"} · {labelOf(GENDER_POLICIES, type.gender_policy)}
                </p>
                {type.amenities.length ? <p className="text-sm break-words text-muted-foreground">{type.amenities.join(", ")}</p> : null}
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <RecordDialog
                    action={updateRoomType.bind(null, tenantSlug)}
                    initial={initial}
                    hidden={{ id: type.id }}
                    trigger="Edit"
                    triggerLabel={`Edit ${type.name}`}
                    triggerVariant="outline"
                    title={`Edit ${type.name}`}
                    submit="Save room type"
                  >
                    {(errors) => <Fields type={type} errors={errors} />}
                  </RecordDialog>
                  <ConfirmAction
                    action={deleteRoomType.bind(null, tenantSlug)}
                    initial={initial}
                    hidden={{ id: type.id }}
                    trigger="Delete"
                    triggerLabel={`Delete ${type.name}`}
                    title={`Delete ${type.name}?`}
                    description="Its prices and photos are deleted too. A room type that still has rooms cannot be deleted."
                    confirm="Delete room type"
                  />
                </div>
              ) : null}
            </div>
            <Photos tenantSlug={tenantSlug} type={type} canManage={canManage} />
          </li>
        ))}
      </ul>
    </div>
  );
}
