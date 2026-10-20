"use client";

import { createContext, useCallback, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createIssueAction } from "@/lib/actions/issues";
import {
  ISSUE_PRIORITIES,
  ISSUE_TYPES,
  PRIORITY_LABELS,
  STORY_POINT_OPTIONS,
  TYPE_LABELS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const NONE = "__none__";

type Member = { id: string; name: string };
type SprintOption = { id: string; name: string; status: string };
type Defaults = { sprintId?: string | null };

const CreateIssueContext = createContext<(defaults?: Defaults) => void>(() => {});

/** Öffnet den "Ticket erstellen"-Dialog von überall im Projekt. */
export function useCreateIssue() {
  return useContext(CreateIssueContext);
}

export function CreateIssueProvider({
  projectKey,
  members,
  sprints,
  children,
}: {
  projectKey: string;
  members: Member[];
  sprints: SprintOption[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState<Defaults>({});
  // Erhöht sich bei jedem Öffnen → Formular startet frisch
  const [formKey, setFormKey] = useState(0);

  const openDialog = useCallback((next: Defaults = {}) => {
    setDefaults(next);
    setFormKey((k) => k + 1);
    setOpen(true);
  }, []);

  // Tastenkürzel "c" wie in Jira
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (target.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
      e.preventDefault();
      openDialog();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [openDialog]);

  const activeSprint = sprints.find((sprint) => sprint.status === "ACTIVE");
  const initialSprintId =
    defaults.sprintId !== undefined ? defaults.sprintId : activeSprint?.id ?? null;

  return (
    <CreateIssueContext.Provider value={openDialog}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ticket erstellen</DialogTitle>
            <DialogDescription>
              Tipp: Drücke <kbd className="rounded border px-1 font-mono text-[11px]">C</kbd> auf jeder
              Projektseite.
            </DialogDescription>
          </DialogHeader>
          <CreateIssueForm
            key={formKey}
            projectKey={projectKey}
            members={members}
            sprints={sprints}
            initialSprintId={initialSprintId}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </CreateIssueContext.Provider>
  );
}

function CreateIssueForm({
  projectKey,
  members,
  sprints,
  initialSprintId,
  onDone,
}: {
  projectKey: string;
  members: Member[];
  sprints: SprintOption[];
  initialSprintId: string | null;
  onDone: () => void;
}) {
  const [type, setType] = useState("TASK");
  const [priority, setPriority] = useState("MEDIUM");
  const [assigneeId, setAssigneeId] = useState(NONE);
  const [sprintId, setSprintId] = useState(initialSprintId ?? NONE);
  const [storyPoints, setStoryPoints] = useState(NONE);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function submit(formData: FormData) {
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return;
    const description = String(formData.get("description") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "");

    startTransition(async () => {
      const result = await createIssueAction(projectKey, {
        title,
        type: type as (typeof ISSUE_TYPES)[number],
        priority: priority as (typeof ISSUE_PRIORITIES)[number],
        description: description || null,
        assigneeId: assigneeId === NONE ? null : assigneeId,
        sprintId: sprintId === NONE ? null : sprintId,
        storyPoints: storyPoints === NONE ? null : Number(storyPoints),
        dueDate: dueDate || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      onDone();
      toast.success(`${result.key} erstellt`, {
        action: {
          label: "Öffnen",
          onClick: () => router.push(`/projects/${projectKey}/issues/${result.key}`),
        },
      });
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="issue-title">Titel</Label>
        <Input id="issue-title" name="title" required maxLength={200} autoFocus placeholder="Was ist zu tun?" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="issue-description">Beschreibung</Label>
        <Textarea id="issue-description" name="description" rows={4} placeholder="Optional" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldSelect label="Typ" value={type} onChange={setType}>
          {ISSUE_TYPES.map((value) => (
            <SelectItem key={value} value={value}>{TYPE_LABELS[value]}</SelectItem>
          ))}
        </FieldSelect>
        <FieldSelect label="Priorität" value={priority} onChange={setPriority}>
          {ISSUE_PRIORITIES.map((value) => (
            <SelectItem key={value} value={value}>{PRIORITY_LABELS[value]}</SelectItem>
          ))}
        </FieldSelect>
        <FieldSelect label="Zugewiesen an" value={assigneeId} onChange={setAssigneeId}>
          <SelectItem value={NONE}>Niemand</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
          ))}
        </FieldSelect>
        <FieldSelect label="Sprint" value={sprintId} onChange={setSprintId}>
          <SelectItem value={NONE}>Backlog</SelectItem>
          {sprints.map((sprint) => (
            <SelectItem key={sprint.id} value={sprint.id}>
              {sprint.name}
              {sprint.status === "ACTIVE" ? " (aktiv)" : ""}
            </SelectItem>
          ))}
        </FieldSelect>
        <FieldSelect label="Story Points" value={storyPoints} onChange={setStoryPoints}>
          <SelectItem value={NONE}>Keine</SelectItem>
          {STORY_POINT_OPTIONS.map((points) => (
            <SelectItem key={points} value={String(points)}>{points}</SelectItem>
          ))}
        </FieldSelect>
        <div className="space-y-2">
          <Label htmlFor="issue-due">Fällig am</Label>
          <Input id="issue-due" name="dueDate" type="date" className="h-8" />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Abbrechen
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Wird erstellt…" : "Erstellen"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}
