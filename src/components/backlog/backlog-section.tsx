"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { createIssueAction, updateIssueAction } from "@/lib/actions/issues";
import {
  completeSprintAction,
  deleteSprintAction,
  startSprintAction,
} from "@/lib/actions/sprints";
import {
  IssuePriority,
  IssueStatus,
  IssueType,
  ISSUE_TYPES,
  TYPE_LABELS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriorityIcon, StatusBadge, TypeIcon } from "@/components/issue-badges";
import { UserAvatar } from "@/components/user-avatar";

type IssueItem = {
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  assignee: { name: string; avatarColor: string } | null;
};

type SprintInfo = { id: string; name: string; goal: string | null; status: string };

export function BacklogSection({
  projectKey,
  sprint,
  issues,
  sprintTargets,
}: {
  projectKey: string;
  sprint: SprintInfo | null;
  issues: IssueItem[];
  sprintTargets: { id: string; name: string }[];
}) {
  const [isPending, startTransition] = useTransition();

  function runSprintAction(action: () => Promise<{ error?: string } | undefined | void>) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <section className="rounded-lg border">
      <header className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">{sprint ? sprint.name : "Backlog"}</h2>
          {sprint?.status === "ACTIVE" && (
            <Badge className="bg-blue-600 text-white hover:bg-blue-600">Aktiv</Badge>
          )}
          {sprint?.goal && (
            <span className="hidden text-sm text-muted-foreground sm:inline">– {sprint.goal}</span>
          )}
          <span className="text-sm text-muted-foreground">({issues.length})</span>
        </div>
        {sprint && (
          <div className="flex items-center gap-2">
            {sprint.status === "PLANNED" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => runSprintAction(() => startSprintAction(projectKey, sprint.id))}
              >
                Sprint starten
              </Button>
            )}
            {sprint.status === "ACTIVE" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => runSprintAction(() => completeSprintAction(projectKey, sprint.id))}
              >
                Sprint abschließen
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-8">
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => runSprintAction(() => deleteSprintAction(projectKey, sprint.id))}
                >
                  Sprint löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <ul className="divide-y">
        {issues.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            {sprint ? "Keine Tickets in diesem Sprint." : "Das Backlog ist leer."}
          </li>
        )}
        {issues.map((issue) => (
          <li key={issue.key} className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40">
            <TypeIcon type={issue.type as IssueType} />
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{issue.key}</span>
            <Link
              href={`/projects/${projectKey}/issues/${issue.key}`}
              className="min-w-0 flex-1 truncate text-sm hover:underline"
            >
              {issue.title}
            </Link>
            <StatusBadge status={issue.status as IssueStatus} />
            <PriorityIcon priority={issue.priority as IssuePriority} />
            {issue.assignee ? (
              <UserAvatar name={issue.assignee.name} color={issue.assignee.avatarColor} />
            ) : (
              <span className="size-7 shrink-0 rounded-full border border-dashed" title="Nicht zugewiesen" />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="size-7 shrink-0">
                  <MoreHorizontalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Verschieben nach</DropdownMenuLabel>
                {sprintTargets
                  .filter((target) => target.id !== sprint?.id)
                  .map((target) => (
                    <DropdownMenuItem
                      key={target.id}
                      onSelect={() =>
                        runSprintAction(() =>
                          updateIssueAction(projectKey, issue.key, { sprintId: target.id })
                        )
                      }
                    >
                      {target.name}
                    </DropdownMenuItem>
                  ))}
                {sprint && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        runSprintAction(() =>
                          updateIssueAction(projectKey, issue.key, { sprintId: null })
                        )
                      }
                    >
                      Backlog
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        ))}
        <li className="px-4 py-2">
          <InlineIssueCreate projectKey={projectKey} sprintId={sprint?.id ?? null} />
        </li>
      </ul>
    </section>
  );
}

function InlineIssueCreate({
  projectKey,
  sprintId,
}: {
  projectKey: string;
  sprintId: string | null;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>("TASK");
  const [isPending, startTransition] = useTransition();

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createIssueAction(projectKey, { title: trimmed, type, sprintId });
      if (result.error) {
        toast.error(result.error);
      } else {
        setTitle("");
        toast.success(`Ticket ${result.key} erstellt`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={type} onValueChange={setType}>
        <SelectTrigger size="sm" className="w-32 shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ISSUE_TYPES.map((issueType) => (
            <SelectItem key={issueType} value={issueType}>
              {TYPE_LABELS[issueType]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="Neues Ticket erstellen…"
        className="h-8"
        disabled={isPending}
      />
      <Button size="sm" variant="ghost" onClick={submit} disabled={isPending || !title.trim()}>
        <PlusIcon className="size-4" />
        Erstellen
      </Button>
    </div>
  );
}
