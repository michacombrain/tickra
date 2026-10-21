"use client";

import { useActionState, useTransition } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  addMemberAction,
  createLabelAction,
  deleteLabelAction,
  deleteProjectAction,
  FormState,
  leaveProjectAction,
  removeMemberAction,
  setMemberRoleAction,
  updateProjectAction,
} from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Führt eine Action aus und zeigt Fehler als Toast. */
function useAction() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<FormState | void>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
      else if (success) toast.success(success);
    });
  }
  return [isPending, run] as const;
}

export function ProjectDetailsForm({
  projectKey,
  name,
  description,
}: {
  projectKey: string;
  name: string;
  description: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await updateProjectAction(projectKey, prev, formData);
      if (result?.success) toast.success("Projekt gespeichert");
      return result;
    },
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="project-name">Name</Label>
        <Input id="project-name" name="name" defaultValue={name} required minLength={3} maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-description">Beschreibung</Label>
        <Textarea id="project-description" name="description" defaultValue={description ?? ""} rows={3} maxLength={500} />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Wird gespeichert…" : "Speichern"}
      </Button>
    </form>
  );
}

export function AddMemberForm({ projectKey }: { projectKey: string }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await addMemberAction(projectKey, prev, formData);
      if (result?.success) toast.success("Mitglied hinzugefügt");
      return result;
    },
    undefined
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <Input name="email" type="email" placeholder="E-Mail der Person…" required className="h-8" />
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8">
          Hinzufügen
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <p className="text-xs text-muted-foreground">Die Person braucht bereits ein Tickra-Konto.</p>
    </form>
  );
}

export function MemberRoleSelect({
  projectKey,
  userId,
  role,
}: {
  projectKey: string;
  userId: string;
  role: string;
}) {
  const [isPending, run] = useAction();
  return (
    <Select
      value={role}
      disabled={isPending}
      onValueChange={(value) => run(() => setMemberRoleAction(projectKey, userId, value))}
    >
      <SelectTrigger size="sm" className="w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ADMIN">Admin</SelectItem>
        <SelectItem value="MEMBER">Mitglied</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function RemoveMemberButton({
  projectKey,
  userId,
  name,
}: {
  projectKey: string;
  userId: string;
  name: string;
}) {
  const [isPending, run] = useAction();

  return (
    <Button
      size="icon-sm"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive"
      disabled={isPending}
      title="Mitglied entfernen"
      aria-label={`${name} entfernen`}
      onClick={() => {
        if (!confirm(`${name} aus dem Projekt entfernen? Zugewiesene Tickets werden freigegeben.`)) return;
        run(() => removeMemberAction(projectKey, userId), `${name} entfernt`);
      }}
    >
      <XIcon />
    </Button>
  );
}

export function CreateLabelForm({ projectKey }: { projectKey: string }) {
  const [state, formAction, pending] = useActionState(
    (prev: FormState, formData: FormData) => createLabelAction(projectKey, prev, formData),
    undefined
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          name="color"
          type="color"
          defaultValue="#737373"
          className="size-8 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
          title="Label-Farbe"
          aria-label="Label-Farbe"
        />
        <Input name="name" placeholder="Neues Label…" required maxLength={30} className="h-8 max-w-48" />
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-8">
          Anlegen
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function DeleteLabelButton({
  projectKey,
  labelId,
  name,
}: {
  projectKey: string;
  labelId: string;
  name: string;
}) {
  const [isPending, run] = useAction();

  return (
    <button
      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
      disabled={isPending}
      title="Label löschen"
      aria-label={`Label ${name} löschen`}
      onClick={() => {
        if (!confirm(`Label "${name}" löschen? Es wird von allen Tickets entfernt.`)) return;
        run(() => deleteLabelAction(projectKey, labelId));
      }}
    >
      <XIcon className="size-3.5" />
    </button>
  );
}

export function LeaveProjectButton({ projectKey }: { projectKey: string }) {
  const [isPending, run] = useAction();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Projekt wirklich verlassen?")) return;
        run(() => leaveProjectAction(projectKey));
      }}
    >
      Projekt verlassen
    </Button>
  );
}

export function DeleteProjectButton({ projectKey, name }: { projectKey: string; name: string }) {
  const [isPending, run] = useAction();
  return (
    <Button
      size="sm"
      variant="destructive"
      disabled={isPending}
      onClick={() => {
        const typed = prompt(
          `Das löscht "${name}" mit allen Tickets, Sprints und Kommentaren endgültig.\n\nZum Bestätigen den Projekt-Key "${projectKey}" eingeben:`
        );
        if (typed?.trim().toUpperCase() !== projectKey) return;
        run(() => deleteProjectAction(projectKey));
      }}
    >
      Projekt löschen
    </Button>
  );
}
