"use client";

import { useState } from "react";
import { FormMessage, ReasonDialog, SelectField, TextField, useActionForm } from "@/components/forms/form-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PERMISSION_GROUPS } from "@/lib/permission-labels";
import { changeMemberRole, inviteStaff, resendStaffInvitation, revokeMember, type ProvisioningFormState } from "@/lib/server/actions/provisioning-actions";
import { createPermissionSet, deletePermissionSet, updatePermissionSet, type SettingsFormState } from "@/lib/server/actions/settings-actions";

const initial: ProvisioningFormState = { status: "idle" };
const setInitial: SettingsFormState = { status: "idle" };

export interface PermissionSetRow {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
}

export interface MemberRow {
  id: string;
  name: string;
  email: string | null;
  role: "hostel_admin" | "staff";
  status: "invited" | "active";
  permission_set_id: string | null;
  isYou: boolean;
}

function RoleFields({ sets, role, setId, errors }: { sets: PermissionSetRow[]; role: string; setId: string | null; errors?: Record<string, string> }) {
  const [current, setCurrent] = useState(role);
  return (
    <>
      <SelectField
        name="role"
        label="Role"
        defaultValue={role}
        error={errors?.role}
        onValueChange={setCurrent}
        options={[
          { value: "staff", label: "Staff" },
          { value: "hostel_admin", label: "Hostel admin (full access, needs two-step verification)" },
        ]}
      />
      {current === "staff" ? (
        <SelectField
          name="permissionSetId"
          label="Permission set"
          defaultValue={setId ?? sets[0]?.id}
          error={errors?.permissionSetId}
          options={sets.map((set) => ({ value: set.id, label: set.is_system ? set.name : `${set.name} (custom)` }))}
        />
      ) : null}
    </>
  );
}

export function InviteStaffForm({ tenantSlug, sets }: { tenantSlug: string; sets: PermissionSetRow[] }) {
  const [resets, setResets] = useState(0);
  const { state, pending, formProps } = useActionForm(inviteStaff.bind(null, tenantSlug), initial, {
    resetOnSuccess: true,
    onSuccess: () => setResets((count) => count + 1),
  });
  return (
    <form {...formProps} className="flex flex-col gap-4 sm:max-w-md" noValidate>
      <FormMessage state={state.fieldErrors ? { status: "idle" } : state} />
      <TextField name="email" label="Email address" type="email" inputMode="email" autoComplete="off" error={state.fieldErrors?.email} />
      <RoleFields key={resets} sets={sets} role="staff" setId={null} errors={state.fieldErrors} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send invitation"}
        </Button>
      </div>
    </form>
  );
}

function ChangeRoleDialog({ tenantSlug, member, sets }: { tenantSlug: string; member: MemberRow; sets: PermissionSetRow[] }) {
  const [open, setOpen] = useState(false);
  const { state, pending, formProps } = useActionForm(changeMemberRole.bind(null, tenantSlug), initial, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" aria-label={`Change role of ${member.name}`}>
          Change role
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>{member.name}&apos;s access changes immediately.</DialogDescription>
        </DialogHeader>
        <form {...formProps} className="flex flex-col gap-4" noValidate>
          {state.status === "error" ? <FormMessage state={state} /> : null}
          <input type="hidden" name="membershipId" value={member.id} />
          <RoleFields sets={sets} role={member.role} setId={member.permission_set_id} errors={state.fieldErrors} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save role"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResendButton({ tenantSlug, member }: { tenantSlug: string; member: MemberRow }) {
  const { state, pending, formProps } = useActionForm(resendStaffInvitation.bind(null, tenantSlug), initial);
  return (
    <form {...formProps} className="flex flex-col gap-2">
      <input type="hidden" name="membershipId" value={member.id} />
      <div>
        <Button type="submit" variant="outline" disabled={pending} aria-label={`Resend invitation to ${member.name}`}>
          {pending ? "Sending…" : "Resend"}
        </Button>
      </div>
      <FormMessage state={state} />
    </form>
  );
}

export function TeamList({ tenantSlug, members, sets }: { tenantSlug: string; members: MemberRow[]; sets: PermissionSetRow[] }) {
  const setName = (id: string | null) => sets.find((set) => set.id === id)?.name ?? "Custom";
  return (
    <ul className="divide-y divide-border rounded-sm border border-border">
      {members.map((member) => (
        <li key={member.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              <span className="break-all">{member.name}</span>
              {member.isYou ? <Badge variant="neutral">You</Badge> : null}
              {member.status === "invited" ? <Badge variant="warning">Invited</Badge> : null}
            </p>
            {member.email && member.email !== member.name ? <p className="text-sm break-all text-muted-foreground">{member.email}</p> : null}
            <p className="text-sm text-muted-foreground">{member.role === "hostel_admin" ? "Hostel admin" : setName(member.permission_set_id)}</p>
          </div>
          {member.isYou ? null : (
            <div className="flex flex-wrap items-start gap-2">
              {member.status === "invited" ? <ResendButton tenantSlug={tenantSlug} member={member} /> : null}
              <ChangeRoleDialog tenantSlug={tenantSlug} member={member} sets={sets} />
              <ReasonDialog
                action={revokeMember.bind(null, tenantSlug)}
                initial={initial}
                hidden={{ membershipId: member.id }}
                trigger={member.status === "invited" ? "Cancel invitation" : "Remove access"}
                title={member.status === "invited" ? "Cancel this invitation?" : `Remove ${member.name}'s access?`}
                description="This takes effect immediately and is recorded in the audit log."
                confirm={member.status === "invited" ? "Cancel invitation" : "Remove access"}
                destructive
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function PermissionChecks({ selected, onToggle, readOnly }: { selected: Set<string>; onToggle?: (key: string, on: boolean) => void; readOnly?: boolean }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {PERMISSION_GROUPS.map((group) => (
        <fieldset key={group.title} className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
          {group.items.map((item) => (
            <label key={item.key} className="flex min-h-11 items-center gap-3 text-sm">
              <input
                type="checkbox"
                name="permissions"
                value={item.key}
                checked={selected.has(item.key)}
                disabled={readOnly}
                onChange={(event) => onToggle?.(item.key, event.target.checked)}
                className="size-5 shrink-0 accent-primary"
              />
              {item.label}
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

function PermissionSetFields({ state, name, description, selected, setSelected }: {
  state: SettingsFormState;
  name?: string;
  description?: string | null;
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
}) {
  const toggle = (key: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(key);
    else next.delete(key);
    setSelected(next);
  };
  return (
    <>
      <TextField name="name" label="Name" defaultValue={name} maxLength={80} error={state.fieldErrors?.name} />
      <TextField name="description" label="Description" required={false} defaultValue={description ?? ""} maxLength={300} error={state.fieldErrors?.description} />
      <PermissionChecks selected={selected} onToggle={toggle} />
      {state.fieldErrors?.permissions ? (
        <p role="alert" className="text-sm text-destructive">
          {state.fieldErrors.permissions}
        </p>
      ) : null}
    </>
  );
}

export function CreatePermissionSetForm({ tenantSlug, sets }: { tenantSlug: string; sets: PermissionSetRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { state, pending, formProps } = useActionForm(createPermissionSet.bind(null, tenantSlug), setInitial, {
    resetOnSuccess: true,
    onSuccess: () => setSelected(new Set()),
  });
  return (
    <form {...formProps} className="flex flex-col gap-5" noValidate>
      <FormMessage state={state.fieldErrors ? { status: "idle" } : state} />
      <div className="sm:max-w-md">
        <SelectField
          name="template"
          label="Start from"
          defaultValue=""
          onValueChange={(value) => setSelected(new Set(sets.find((set) => set.id === value)?.permissions ?? []))}
          options={[{ value: "", label: "Nothing selected" }, ...sets.map((set) => ({ value: set.id, label: set.name }))]}
        />
      </div>
      <PermissionSetFields state={state} selected={selected} setSelected={setSelected} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create permission set"}
        </Button>
      </div>
    </form>
  );
}

function EditPermissionSet({ tenantSlug, set }: { tenantSlug: string; set: PermissionSetRow }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(new Set(set.permissions));
  const { state, pending, formProps } = useActionForm(updatePermissionSet.bind(null, tenantSlug), setInitial, { onSuccess: () => setOpen(false) });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" aria-label={`Edit ${set.name}`}>
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit {set.name}</DialogTitle>
          <DialogDescription>Staff using this set get the changes immediately.</DialogDescription>
        </DialogHeader>
        <form {...formProps} className="flex flex-col gap-5" noValidate>
          {state.status === "error" && !state.fieldErrors ? <FormMessage state={state} /> : null}
          <input type="hidden" name="id" value={set.id} />
          <PermissionSetFields state={state} name={set.name} description={set.description} selected={selected} setSelected={setSelected} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeletePermissionSet({ tenantSlug, set }: { tenantSlug: string; set: PermissionSetRow }) {
  const { state, pending, formProps } = useActionForm(deletePermissionSet.bind(null, tenantSlug), setInitial);
  return (
    <form {...formProps} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={set.id} />
      <div>
        <Button type="submit" variant="ghost" disabled={pending} aria-label={`Delete ${set.name}`}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
      {state.status === "error" ? <FormMessage state={state} /> : null}
    </form>
  );
}

export function PermissionSetList({ tenantSlug, sets }: { tenantSlug: string; sets: PermissionSetRow[] }) {
  return (
    <ul className="divide-y divide-border rounded-sm border border-border">
      {sets.map((set) => (
        <li key={set.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              {set.name}
              <Badge variant={set.is_system ? "neutral" : "info"}>{set.is_system ? "Built in" : "Custom"}</Badge>
            </p>
            {set.description ? <p className="text-sm text-muted-foreground">{set.description}</p> : null}
            <p className="text-sm text-muted-foreground">{set.permissions.length} permissions</p>
          </div>
          {set.is_system ? null : (
            <div className="flex flex-wrap items-start gap-2">
              <EditPermissionSet key={set.permissions.join()} tenantSlug={tenantSlug} set={set} />
              <DeletePermissionSet tenantSlug={tenantSlug} set={set} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
