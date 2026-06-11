"use client";

import { useActionState, useTransition } from "react";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  addMemberAction,
  createLabelAction,
  deleteLabelAction,
  FormState,
  removeMemberAction,
} from "@/lib/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AddMemberForm({ projectKey }: { projectKey: string }) {
  const [state, formAction, pending] = useActionState(
    (prev: FormState, formData: FormData) => addMemberAction(projectKey, prev, formData),
    undefined
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <Input name="email" type="email" placeholder="E-Mail der Person…" required className="h-9" />
        <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-9">
          Hinzufügen
        </Button>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function RemoveMemberButton({
  projectKey,
  userId,
}: {
  projectKey: string;
  userId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-7 text-muted-foreground hover:text-destructive"
      disabled={isPending}
      title="Mitglied entfernen"
      onClick={() => startTransition(() => removeMemberAction(projectKey, userId))}
    >
      <XIcon className="size-4" />
    </Button>
  );
}

export function CreateLabelForm({ projectKey }: { projectKey: string }) {
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await createLabelAction(projectKey, prev, formData);
      if (result?.error) toast.error(result.error);
      return result;
    },
    undefined
  );

  return (
    <form action={formAction} className="flex items-center gap-2">
      <Input name="name" placeholder="Neues Label…" required maxLength={30} className="h-9 w-48" />
      <input
        name="color"
        type="color"
        defaultValue="#3b82f6"
        className="size-9 cursor-pointer rounded-md border p-1"
        title="Label-Farbe"
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="h-9">
        Label anlegen
      </Button>
      {state?.error && <span className="text-sm text-destructive">{state.error}</span>}
    </form>
  );
}

export function DeleteLabelButton({
  projectKey,
  labelId,
}: {
  projectKey: string;
  labelId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      className="text-muted-foreground hover:text-destructive disabled:opacity-50"
      disabled={isPending}
      title="Label löschen"
      onClick={() => startTransition(() => deleteLabelAction(projectKey, labelId))}
    >
      <XIcon className="size-3.5" />
    </button>
  );
}
