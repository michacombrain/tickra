"use client";

import { useActionState, useState } from "react";
import { PlusIcon } from "lucide-react";
import { createProjectAction } from "@/lib/actions/projects";
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
import { Textarea } from "@/components/ui/textarea";

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProjectAction, undefined);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <PlusIcon />
          Projekt anlegen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neues Projekt</DialogTitle>
          <DialogDescription>
            Der Key wird als Präfix für Ticket-Nummern verwendet (z.B. WEB-42).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input id="project-name" name="name" placeholder="Website Relaunch" required minLength={3} maxLength={80} autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-key">Key</Label>
            <Input
              id="project-key"
              name="key"
              placeholder="WEB"
              required
              maxLength={10}
              pattern="[A-Za-z][A-Za-z0-9]{1,9}"
              title="2–10 Buchstaben/Ziffern, beginnt mit Buchstabe"
              className="font-mono uppercase"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">Beschreibung (optional)</Label>
            <Textarea id="project-description" name="description" rows={3} maxLength={500} />
          </div>
          {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Wird angelegt…" : "Projekt anlegen"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
