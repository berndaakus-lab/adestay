"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

export function InteractiveDemos() {
  return (
    <div className="flex flex-wrap gap-3">
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Decline request…</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline booking request?</DialogTitle>
            <DialogDescription>
              The student is notified by email. This cannot be undone, so give a clear reason.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="decline-reason">Reason (required)</FieldLabel>
            <Textarea id="decline-reason" placeholder="e.g. No beds of this type remain for the semester." />
            <FieldDescription>Shown to the student.</FieldDescription>
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">Keep request</Button>
            </DialogClose>
            <DialogClose asChild>
              <Button variant="destructive" onClick={() => toast.success("Request declined. The student has been notified.")}>
                Decline request
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Button variant="secondary" onClick={() => toast.success("Bed C-214 · A assigned to Ama Mensah")}>
        Show success toast
      </Button>
      <Button variant="secondary" onClick={() => toast.error("That bed was just assigned to someone else. Refresh and pick another.")}>
        Show error toast
      </Button>
    </div>
  );
}
