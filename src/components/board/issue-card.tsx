"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IssuePriority, IssueType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { DueDate, LabelBadge, PriorityIcon, StoryPoints, TypeIcon } from "@/components/issue-badges";
import { UserAvatar } from "@/components/user-avatar";

export type BoardIssue = {
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  order: number;
  storyPoints: number | null;
  dueDate: string | null;
  assignee: { id: string; name: string; avatarColor: string; kind: string } | null;
  labels: { name: string; color: string }[];
};

export function IssueCard({
  issue,
  projectKey,
  overlay = false,
}: {
  issue: BoardIssue;
  projectKey: string;
  overlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: issue.key, disabled: overlay });

  const done = issue.status === "DONE";

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "group cursor-grab rounded-lg border bg-card p-3 shadow-xs transition-colors hover:border-foreground/20 active:cursor-grabbing",
        isDragging && "opacity-30",
        overlay && "cursor-grabbing shadow-lg ring-1 ring-foreground/10"
      )}
    >
      <Link
        href={`/projects/${projectKey}/issues/${issue.key}`}
        className={cn(
          "block text-sm leading-snug hover:underline",
          done && "text-muted-foreground line-through decoration-muted-foreground/40"
        )}
        draggable={false}
      >
        {issue.title}
      </Link>
      {issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.map((label) => (
            <LabelBadge key={label.name} name={label.name} color={label.color} />
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-1.5">
        <TypeIcon type={issue.type as IssueType} className="size-3.5" />
        <span className="font-mono text-[11px] text-muted-foreground">{issue.key}</span>
        <DueDate date={issue.dueDate} done={done} />
        <div className="ml-auto flex items-center gap-1.5">
          <StoryPoints points={issue.storyPoints} />
          <PriorityIcon priority={issue.priority as IssuePriority} className="size-3.5" />
          {issue.assignee ? (
            <UserAvatar
              name={issue.assignee.name}
              color={issue.assignee.avatarColor}
              kind={issue.assignee.kind}
              className="size-5 text-[9px]"
            />
          ) : (
            <span className="size-5 rounded-full border border-dashed" title="Nicht zugewiesen" />
          )}
        </div>
      </div>
    </div>
  );
}
