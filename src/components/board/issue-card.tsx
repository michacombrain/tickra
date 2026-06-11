"use client";

import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IssuePriority, IssueType } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { LabelBadge, PriorityIcon, TypeIcon } from "@/components/issue-badges";
import { UserAvatar } from "@/components/user-avatar";

export type BoardIssue = {
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  order: number;
  assignee: { id: string; name: string; avatarColor: string } | null;
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

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        "rounded-md border bg-background p-3 shadow-sm",
        isDragging && "opacity-40",
        overlay && "rotate-2 shadow-lg"
      )}
    >
      <Link
        href={`/projects/${projectKey}/issues/${issue.key}`}
        className="block text-sm font-medium leading-snug hover:underline"
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
        <TypeIcon type={issue.type as IssueType} />
        <span className="font-mono text-xs text-muted-foreground">{issue.key}</span>
        <div className="ml-auto flex items-center gap-1.5">
          <PriorityIcon priority={issue.priority as IssuePriority} />
          {issue.assignee && (
            <UserAvatar
              name={issue.assignee.name}
              color={issue.assignee.avatarColor}
              className="size-6 text-[10px]"
            />
          )}
        </div>
      </div>
    </div>
  );
}
