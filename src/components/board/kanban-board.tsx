"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { moveIssueAction } from "@/lib/actions/issues";
import { ISSUE_STATUSES, IssueStatus, STATUS_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { BoardColumn } from "@/components/board/board-column";
import { IssueCard, type BoardIssue } from "@/components/board/issue-card";

export function KanbanBoard({
  projectKey,
  initialIssues,
  members,
}: {
  projectKey: string;
  initialIssues: BoardIssue[];
  members: { id: string; name: string; avatarColor: string }[];
}) {
  const [issues, setIssues] = useState(initialIssues);
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  // Server-Refreshs (z.B. nach Ticket-Edit im Modal) übernehmen
  useEffect(() => setIssues(initialIssues), [initialIssues]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const visibleIssues = useMemo(
    () =>
      assigneeFilter
        ? issues.filter((issue) => issue.assignee?.id === assigneeFilter)
        : issues,
    [issues, assigneeFilter]
  );

  const columns = useMemo(
    () =>
      ISSUE_STATUSES.map((status) => ({
        status,
        issues: visibleIssues
          .filter((issue) => issue.status === status)
          .sort((a, b) => a.order - b.order),
      })),
    [visibleIssues]
  );

  function findIssue(key: string) {
    return issues.find((issue) => issue.key === key) ?? null;
  }

  /** Ermittelt die Zielspalte: entweder die Spalte selbst oder die der Karte darunter. */
  function resolveTargetStatus(overId: string): IssueStatus | null {
    if ((ISSUE_STATUSES as readonly string[]).includes(overId)) return overId as IssueStatus;
    return (findIssue(overId)?.status as IssueStatus) ?? null;
  }

  function onDragStart(event: DragStartEvent) {
    setActiveIssue(findIssue(String(event.active.id)));
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetStatus = resolveTargetStatus(String(over.id));
    const issue = findIssue(String(active.id));
    if (!issue || !targetStatus || issue.status === targetStatus) return;

    setIssues((prev) =>
      prev.map((item) =>
        item.key === issue.key ? { ...item, status: targetStatus } : item
      )
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveIssue(null);
    if (!over) return;

    const issueKey = String(active.id);
    const issue = findIssue(issueKey);
    const targetStatus = resolveTargetStatus(String(over.id));
    if (!issue || !targetStatus) return;

    // Neue Position: zwischen Nachbarkarten in der Zielspalte einsortieren
    const columnIssues = issues
      .filter((item) => item.status === targetStatus && item.key !== issueKey)
      .sort((a, b) => a.order - b.order);

    let newOrder: number;
    const overIndex = columnIssues.findIndex((item) => item.key === String(over.id));
    if (overIndex === -1) {
      newOrder = (columnIssues.at(-1)?.order ?? 0) + 1;
    } else {
      const prev = columnIssues[overIndex - 1]?.order ?? columnIssues[overIndex].order - 2;
      newOrder = (prev + columnIssues[overIndex].order) / 2;
    }

    setIssues((current) =>
      current.map((item) =>
        item.key === issueKey ? { ...item, status: targetStatus, order: newOrder } : item
      )
    );

    startTransition(async () => {
      const result = await moveIssueAction(projectKey, issueKey, targetStatus, newOrder);
      if (result?.error) {
        toast.error(result.error);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter:</span>
        <div className="flex -space-x-1.5">
          {members.map((member) => (
            <button
              key={member.id}
              onClick={() =>
                setAssigneeFilter((current) => (current === member.id ? null : member.id))
              }
              className={cn(
                "rounded-full ring-2 ring-background transition-transform hover:-translate-y-0.5",
                assigneeFilter === member.id && "ring-blue-600"
              )}
              title={member.name}
            >
              <UserAvatar name={member.name} color={member.avatarColor} className="size-8" />
            </button>
          ))}
        </div>
        {assigneeFilter && (
          <button
            onClick={() => setAssigneeFilter(null)}
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((column) => (
            <SortableContext
              key={column.status}
              items={column.issues.map((issue) => issue.key)}
              strategy={verticalListSortingStrategy}
            >
              <BoardColumn
                status={column.status}
                label={STATUS_LABELS[column.status]}
                count={column.issues.length}
              >
                {column.issues.map((issue) => (
                  <IssueCard key={issue.key} issue={issue} projectKey={projectKey} />
                ))}
              </BoardColumn>
            </SortableContext>
          ))}
        </div>
        <DragOverlay>
          {activeIssue && (
            <IssueCard issue={activeIssue} projectKey={projectKey} overlay />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
