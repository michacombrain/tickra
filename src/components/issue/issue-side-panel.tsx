"use client";

import { useTransition } from "react";
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
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserAvatar } from "@/components/user-avatar";

const UNASSIGNED = "__none__";

export function IssueSidePanel({
  projectKey,
  issueKey,
  status,
  priority,
  type,
  assigneeId,
  members,
  labels,
  activeLabelIds,
  reporter,
  createdAt,
}: {
  projectKey: string;
  issueKey: string;
  status: string;
  priority: string;
  type: string;
  assigneeId: string | null;
  members: { id: string; name: string; avatarColor: string }[];
  labels: { id: string; name: string; color: string }[];
  activeLabelIds: string[];
  reporter: { name: string; avatarColor: string };
  createdAt: string;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function update(fields: Record<string, unknown>) {
    startTransition(async () => {
      const result = await updateIssueAction(projectKey, issueKey, fields);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <aside className="space-y-4 text-sm">
      <Field label="Status">
        <Select value={status} onValueChange={(value) => update({ status: value })}>
          <SelectTrigger size="sm" className="w-full" disabled={isPending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>{STATUS_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Priorität">
        <Select value={priority} onValueChange={(value) => update({ priority: value })}>
          <SelectTrigger size="sm" className="w-full" disabled={isPending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_PRIORITIES.map((value) => (
              <SelectItem key={value} value={value}>{PRIORITY_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Typ">
        <Select value={type} onValueChange={(value) => update({ type: value })}>
          <SelectTrigger size="sm" className="w-full" disabled={isPending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ISSUE_TYPES.map((value) => (
              <SelectItem key={value} value={value}>{TYPE_LABELS[value]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Zugewiesen an">
        <Select
          value={assigneeId ?? UNASSIGNED}
          onValueChange={(value) => update({ assigneeId: value === UNASSIGNED ? null : value })}
        >
          <SelectTrigger size="sm" className="w-full" disabled={isPending}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Niemand</SelectItem>
            {members.map((member) => (
              <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
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
            const active = activeLabelIds.includes(label.id);
            return (
              <button
                key={label.id}
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await toggleIssueLabelAction(projectKey, issueKey, label.id);
                  })
                }
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium transition-opacity",
                  active ? "text-white" : "opacity-40 hover:opacity-70"
                )}
                style={{ backgroundColor: label.color, color: active ? "white" : undefined }}
              >
                {label.name}
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Erstellt von">
        <div className="flex items-center gap-2">
          <UserAvatar name={reporter.name} color={reporter.avatarColor} className="size-6 text-[10px]" />
          <span>{reporter.name}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{createdAt}</div>
      </Field>

      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-start text-destructive hover:text-destructive"
        disabled={isPending}
        onClick={() => {
          if (!confirm(`Ticket ${issueKey} wirklich löschen?`)) return;
          startTransition(async () => {
            await deleteIssueAction(projectKey, issueKey);
            toast.success(`Ticket ${issueKey} gelöscht`);
            router.push(`/projects/${projectKey}/board`);
          });
        }}
      >
        <Trash2Icon className="size-4" />
        Ticket löschen
      </Button>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}
