"use client";

import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { createSprintAction, FormState, updateSprintAction } from "@/lib/actions/sprints";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SprintForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults?: { name: string; goal: string | null };
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="sprint-name">Name</Label>
        <Input id="sprint-name" name="name" defaultValue={defaults?.name} placeholder="Sprint 3" required maxLength={50} autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="sprint-goal">Sprint-Ziel (optional)</Label>
        <Input id="sprint-goal" name="goal" defaultValue={defaults?.goal ?? ""} maxLength={200} placeholder="Was soll erreicht werden?" />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Wird gespeichert…" : submitLabel}
      </Button>
    </form>
  );
}

export function CreateSprintDialog({
  projectKey,
  suggestedName,
}: {
  projectKey: string;
  suggestedName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PlusIcon />
          Sprint anlegen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Sprint</DialogTitle>
          <DialogDescription>Plane einen neuen Sprint für dieses Projekt.</DialogDescription>
        </DialogHeader>
        <SprintForm
          defaults={{ name: suggestedName, goal: null }}
          submitLabel="Sprint anlegen"
          action={async (prev, formData) => {
            const result = await createSprintAction(projectKey, prev, formData);
            if (!result?.error) setOpen(false);
            return result;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditSprintDialog({
  projectKey,
  sprint,
  open,
  onOpenChange,
}: {
  projectKey: string;
  sprint: { id: string; name: string; goal: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sprint bearbeiten</DialogTitle>
          <DialogDescription>Name und Ziel des Sprints ändern.</DialogDescription>
        </DialogHeader>
        <SprintForm
          defaults={sprint}
          submitLabel="Speichern"
          action={async (prev, formData) => {
            const result = await updateSprintAction(projectKey, sprint.id, prev, formData);
            if (!result?.error) onOpenChange(false);
            return result;
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
