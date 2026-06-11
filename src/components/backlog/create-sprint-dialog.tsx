"use client";

import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { createSprintAction, FormState } from "@/lib/actions/sprints";
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

export function CreateSprintDialog({ projectKey }: { projectKey: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await createSprintAction(projectKey, prev, formData);
      if (!result?.error) setOpen(false);
      return result;
    },
    undefined
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon className="size-4" />
          Sprint anlegen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuer Sprint</DialogTitle>
          <DialogDescription>Plane einen neuen Sprint für dieses Projekt.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sprint-name">Name</Label>
            <Input id="sprint-name" name="name" placeholder="Sprint 3" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sprint-goal">Sprint-Ziel (optional)</Label>
            <Input id="sprint-goal" name="goal" placeholder="Was soll erreicht werden?" />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Wird angelegt…" : "Sprint anlegen"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
