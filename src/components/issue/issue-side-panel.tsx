"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  deleteIssueAction,
  toggleIssueLabelAction,
  updateIssueAction,
} from "@/lib/actions/issues";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  IssuePriority,
  IssueStatus,
  IssueType,
  PRIORITY_LABELS,
  STATUS_LABELS,
  STORY_POINT_OPTIONS,
  TYPE_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityIcon, StatusIcon, TypeIcon } from "@/components/issue-badges";
import { UserAvatar } from "@/components/user-avatar";

const NONE = "__none__";

type Fields = {
  status: string;
  priority: string;
  type: string;
  assigneeId: string | null;
  sprintId: string | null;
  storyPoints: number | null;
  dueDate: string;
};

export function IssueSidePanel({
  projectKey,
  issueKey,
  inModal,
  members,
  sprints,
  labels,
  activeLabelIds,
  reporter,
  createdAt,
  updatedAt,
  ...fields
}: Fields & {
  projectKey: string;
  issueKey: string;
  inModal: boolean;
  members: { id: string; name: string; avatarColor: string }[];
  sprints: { id: string; name: string; status: string }[];
  labels: { id: string; name: string; color: string }[];
  activeLabelIds: string[];
  reporter: { name: string; avatarColor: string };
  createdAt: string;
  updatedAt: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  // Sofortiges Feedback in den Selects, bis der Server-Refresh da ist
  const [optimistic, setOptimistic] = useOptimistic(fields, (state, patch: Partial<Fields>) => ({
    ...state,
    ...patch,
  }));
  const [optimisticLabels, toggleOptimisticLabel] = useOptimistic(
    activeLabelIds,
    (state, labelId: string) =>
      state.includes(labelId) ? state.filter((id) => id !== labelId) : [...state, labelId]
  );

  function update(patch: Partial<Fields>) {
    startTransition(async () => {
      setOptimistic(patch);
      const { dueDate, ...rest } = patch;
      const result = await updateIssueAction(projectKey, issueKey, {
        ...rest,
        ...(dueDate !== undefined ? { dueDate: dueDate || null } : {}),
      });
      if (result?.error) toast.error(result.error);
    });
  }

  const assignee = members.find((member) => member.id === optimistic.assigneeId);

  return (
    <aside className="space-y-4 text-sm md:border-l md:pl-6">
      <Field label="Status">
        <Select value={optimistic.status} onValueChange={(value) => update({ status: value })}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                <StatusIcon status={value as IssueStatus} />
                {STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Zugewiesen an">
        <Select
          value={optimistic.assigneeId ?? NONE}
          onValueChange={(value) => update({ assigneeId: value === NONE ? null : value })}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue>
              {assignee ? (
                <span className="flex items-center gap-2">
                  <UserAvatar name={assignee.name} color={assignee.avatarColor} className="size-5 text-[9px]" />
                  {assignee.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Niemand</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Niemand</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Priorität">
          <Select value={optimistic.priority} onValueChange={(value) => update({ priority: value })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ISSUE_PRIORITIES.map((value) => (
                <SelectItem key={value} value={value}>
                  <PriorityIcon priority={value as IssuePriority} />
                  {PRIORITY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Typ">
          <Select value={optimistic.type} onValueChange={(value) => update({ type: value })}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ISSUE_TYPES.map((value) => (
                <SelectItem key={value} value={value}>
                  <TypeIcon type={value as IssueType} />
                  {TYPE_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Story Points">
          <Select
            value={optimistic.storyPoints == null ? NONE : String(optimistic.storyPoints)}
            onValueChange={(value) => update({ storyPoints: value === NONE ? null : Number(value) })}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>–</SelectItem>
              {STORY_POINT_OPTIONS.map((points) => (
                <SelectItem key={points} value={String(points)}>{points}</SelectItem>
              ))}
              {/* Alter Wert außerhalb der Fibonacci-Liste bleibt auswählbar */}
              {optimistic.storyPoints != null &&
                !(STORY_POINT_OPTIONS as readonly number[]).includes(optimistic.storyPoints) && (
                  <SelectItem value={String(optimistic.storyPoints)}>{optimistic.storyPoints}</SelectItem>
                )}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Fällig am">
          <Input
            type="date"
            className="h-7 px-2 text-xs"
            key={fields.dueDate}
            defaultValue={fields.dueDate}
            // Teil-Eingaben liefern "" – darum erst beim Verlassen leeren
            onChange={(e) => e.target.value && e.target.value !== fields.dueDate && update({ dueDate: e.target.value })}
            onBlur={(e) => !e.target.value && fields.dueDate && update({ dueDate: "" })}
          />
        </Field>
      </div>

      <Field label="Sprint">
        <Select
          value={optimistic.sprintId ?? NONE}
          onValueChange={(value) => update({ sprintId: value === NONE ? null : value })}
        >
          <SelectTrigger size="sm" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Backlog</SelectItem>
            {sprints.map((sprint) => (
              <SelectItem key={sprint.id} value={sprint.id} disabled={sprint.status === "COMPLETED"}>
                {sprint.name}
                {sprint.status === "ACTIVE" ? " (aktiv)" : sprint.status === "COMPLETED" ? " (abgeschlossen)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Labels">
        <div className="flex flex-wrap gap-1.5">
          {labels.length === 0 && (
            <span className="text-xs text-muted-foreground">Keine Labels im Projekt</span>
          )}
          {labels.map((label) => {
            const active = optimisticLabels.includes(label.id);
            return (
              <button
                key={label.id}
                onClick={() =>
                  startTransition(async () => {
                    toggleOptimisticLabel(label.id);
                    const result = await toggleIssueLabelAction(projectKey, issueKey, label.id);
                    if (result?.error) toast.error(result.error);
                  })
                }
                aria-pressed={active}
                className={cn(
                  "inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium transition-colors",
                  active
                    ? "border-foreground/30 bg-accent text-foreground"
                    : "border-dashed text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="size-1.5 rounded-full" style={{ backgroundColor: label.color }} />
                {label.name}
              </button>
            );
          })}
        </div>
      </Field>

      <div className="space-y-1.5 border-t pt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <UserAvatar name={reporter.name} color={reporter.avatarColor} className="size-5 text-[9px]" />
          <span>
            Erstellt von <span className="text-foreground">{reporter.name}</span>
          </span>
        </div>
        <div>Erstellt {createdAt}</div>
        <div>Aktualisiert {updatedAt}</div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-muted-foreground hover:text-destructive"
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Ticket ${issueKey} wirklich löschen? Das kann nicht rückgängig gemacht werden.`)) return;
          startTransition(async () => {
            const result = await deleteIssueAction(projectKey, issueKey);
            if (result?.error) {
              toast.error(result.error);
              return;
            }
            toast.success(`${issueKey} gelöscht`);
            if (inModal) router.back();
            else router.push(`/projects/${projectKey}/backlog`);
          });
        }}
      >
        <Trash2Icon />
        Ticket löschen
      </Button>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
