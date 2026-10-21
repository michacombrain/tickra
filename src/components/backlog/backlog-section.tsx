"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRightIcon, MoreHorizontalIcon, PlusIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DueDate, PriorityIcon, StatusBadge, StoryPoints, TypeIcon } from "@/components/issue-badges";
import { UserAvatar } from "@/components/user-avatar";
import { EditSprintDialog } from "@/components/backlog/create-sprint-dialog";

type IssueItem = {
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  storyPoints: number | null;
  dueDate: string | null;
  assignee: { name: string; avatarColor: string; kind: string } | null;
};

type SprintInfo = { id: string; name: string; goal: string | null; status: string };

type ActionResult = { error?: string } | undefined | void;

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
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);

  function run(action: () => Promise<ActionResult>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
      else if (success) toast.success(success);
    });
  }

  const points = issues.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0);
  const doneCount = issues.filter((issue) => issue.status === "DONE").length;

  return (
    <section className={cn("rounded-xl border", isPending && "opacity-70")}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <button
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          <ChevronRightIcon
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !collapsed && "rotate-90")}
          />
          <h2 className="truncate text-sm font-semibold">{sprint ? sprint.name : "Backlog"}</h2>
          {sprint?.status === "ACTIVE" && (
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-medium">Aktiv</span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {issues.length} {issues.length === 1 ? "Ticket" : "Tickets"}
            {sprint && issues.length > 0 && ` · ${doneCount} erledigt`}
            {points > 0 && ` · ${points} SP`}
          </span>
        </button>
        {sprint && (
          <div className="flex items-center gap-1.5">
            {sprint.status === "PLANNED" && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={isPending}>
                    Sprint starten
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Dauer</DropdownMenuLabel>
                  {[1, 2, 3, 4].map((weeks) => (
                    <DropdownMenuItem
                      key={weeks}
                      onSelect={() =>
                        run(() => startSprintAction(projectKey, sprint.id, weeks), `${sprint.name} gestartet`)
                      }
                    >
                      {weeks} {weeks === 1 ? "Woche" : "Wochen"}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {sprint.status === "ACTIVE" && (
              <Button
                size="sm"
                variant="outline"
                disabled={isPending}
                onClick={() => {
                  const open = issues.length - doneCount;
                  if (open > 0 && !confirm(`${open} offene Tickets wandern zurück ins Backlog. Fortfahren?`)) return;
                  run(() => completeSprintAction(projectKey, sprint.id), "Sprint abgeschlossen");
                }}
              >
                Sprint abschließen
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Sprint-Aktionen">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>Bearbeiten</DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    if (!confirm(`Sprint "${sprint.name}" löschen? Die Tickets wandern ins Backlog.`)) return;
                    run(() => deleteSprintAction(projectKey, sprint.id), "Sprint gelöscht");
                  }}
                >
                  Löschen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <EditSprintDialog
              projectKey={projectKey}
              sprint={sprint}
              open={editing}
              onOpenChange={setEditing}
            />
          </div>
        )}
      </header>
      {sprint?.goal && !collapsed && (
        <p className="-mt-1 px-9 pb-2 text-xs text-muted-foreground">{sprint.goal}</p>
      )}

      {!collapsed && (
        <ul className="divide-y border-t">
          {issues.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              {sprint ? "Keine Tickets in diesem Sprint – verschiebe welche aus dem Backlog." : "Das Backlog ist leer."}
            </li>
          )}
          {issues.map((issue) => (
            <li key={issue.key} className="group flex items-center gap-3 px-3 py-1.5 hover:bg-muted/50">
              <TypeIcon type={issue.type as IssueType} className="size-3.5" />
              <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>
              <Link
                href={`/projects/${projectKey}/issues/${issue.key}`}
                className={cn(
                  "min-w-0 flex-1 truncate text-sm hover:underline",
                  issue.status === "DONE" && "text-muted-foreground line-through decoration-muted-foreground/40"
                )}
              >
                {issue.title}
              </Link>
              <span className="hidden sm:contents">
                <DueDate date={issue.dueDate} done={issue.status === "DONE"} />
                <StatusBadge status={issue.status as IssueStatus} />
              </span>
              <StoryPoints points={issue.storyPoints} />
              <PriorityIcon priority={issue.priority as IssuePriority} className="size-3.5" />
              {issue.assignee ? (
                <UserAvatar name={issue.assignee.name} color={issue.assignee.avatarColor} kind={issue.assignee.kind} className="size-6 text-[10px]" />
              ) : (
                <span className="size-6 shrink-0 rounded-full border border-dashed" title="Nicht zugewiesen" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="icon-xs" variant="ghost" className="shrink-0" aria-label="Ticket-Aktionen">
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Verschieben nach</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      {sprintTargets
                        .filter((target) => target.id !== sprint?.id)
                        .map((target) => (
                          <DropdownMenuItem
                            key={target.id}
                            onSelect={() =>
                              run(() => updateIssueAction(projectKey, issue.key, { sprintId: target.id }))
                            }
                          >
                            {target.name}
                          </DropdownMenuItem>
                        ))}
                      {sprint && (
                        <>
                          {sprintTargets.length > 1 && <DropdownMenuSeparator />}
                          <DropdownMenuItem
                            onSelect={() =>
                              run(() => updateIssueAction(projectKey, issue.key, { sprintId: null }))
                            }
                          >
                            Backlog
                          </DropdownMenuItem>
                        </>
                      )}
                      {!sprint && sprintTargets.length === 0 && (
                        <DropdownMenuItem disabled>Noch keine Sprints</DropdownMenuItem>
                      )}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuItem asChild>
                    <Link href={`/projects/${projectKey}/issues/${issue.key}`}>Öffnen</Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
          <li className="px-3 py-1.5">
            <InlineIssueCreate projectKey={projectKey} sprintId={sprint?.id ?? null} />
          </li>
        </ul>
      )}
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
    if (!trimmed || isPending) return;
    startTransition(async () => {
      const result = await createIssueAction(projectKey, {
        title: trimmed,
        type: type as (typeof ISSUE_TYPES)[number],
        sprintId,
      });
      if (result.error) {
        toast.error(result.error);
      } else {
        setTitle("");
        toast.success(`${result.key} erstellt`);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
        placeholder="Ticket hinzufügen…"
        maxLength={200}
        className="h-7 border-transparent bg-transparent px-1 shadow-none focus-visible:border-input dark:bg-transparent"
        disabled={isPending}
      />
      {title.trim() && (
        <>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger size="sm" className="w-28 shrink-0">
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
          <Button size="sm" onClick={submit} disabled={isPending}>
            Erstellen
          </Button>
        </>
      )}
    </div>
  );
}
