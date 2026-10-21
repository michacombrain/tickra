"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { moveIssueAction } from "@/lib/actions/issues";
import { ISSUE_STATUSES, ISSUE_TYPES, IssueStatus, STATUS_LABELS, TYPE_LABELS } from "@/lib/constants";
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
import { UserAvatar } from "@/components/user-avatar";
import { BoardColumn } from "@/components/board/board-column";
import { IssueCard, type BoardIssue } from "@/components/board/issue-card";
import { useCreateIssue } from "@/components/issue/create-issue-dialog";

const ALL_TYPES = "__all__";

export function KanbanBoard({
  projectKey,
  sprintId,
  currentUserId,
  initialIssues,
  members,
}: {
  projectKey: string;
  sprintId: string;
  currentUserId: string;
  initialIssues: BoardIssue[];
  members: { id: string; name: string; avatarColor: string; kind: string }[];
}) {
  const [issues, setIssues] = useState(initialIssues);
  const [activeIssue, setActiveIssue] = useState<BoardIssue | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES);
  const [textFilter, setTextFilter] = useState("");
  const [, startTransition] = useTransition();
  const dragStart = useRef<{ status: string; order: number } | null>(null);
  const lastTargetStatus = useRef<IssueStatus | null>(null);
  const router = useRouter();
  const openCreateIssue = useCreateIssue();

  // Server-Refreshs (z.B. nach Ticket-Edit im Modal) übernehmen –
  // aber nicht mitten in einem laufenden Drag, sonst bricht dnd-kit ab
  const [syncedIssues, setSyncedIssues] = useState(initialIssues);
  if (syncedIssues !== initialIssues && !activeIssue) {
    setSyncedIssues(initialIssues);
    setIssues(initialIssues);
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Auf Touch-Geräten erst nach kurzem Halten ziehen, damit Scrollen funktioniert
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const query = textFilter.trim().toLowerCase();
  const filtersActive = assigneeFilter !== null || typeFilter !== ALL_TYPES || query !== "";

  const visibleIssues = useMemo(
    () =>
      issues.filter((issue) => {
        if (assigneeFilter === "unassigned" ? issue.assignee : assigneeFilter && issue.assignee?.id !== assigneeFilter) {
          return false;
        }
        if (typeFilter !== ALL_TYPES && issue.type !== typeFilter) return false;
        if (query && !`${issue.key} ${issue.title}`.toLowerCase().includes(query)) return false;
        return true;
      }),
    [issues, assigneeFilter, typeFilter, query]
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
    const issue = findIssue(String(event.active.id));
    setActiveIssue(issue);
    dragStart.current = issue ? { status: issue.status, order: issue.order } : null;
  }

  function onDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const targetStatus = resolveTargetStatus(String(over.id));
    const issue = findIssue(String(active.id));
    if (!targetStatus) return;
    lastTargetStatus.current = targetStatus;
    if (!issue || issue.status === targetStatus) return;

    setIssues((prev) =>
      prev.map((item) =>
        item.key === issue.key ? { ...item, status: targetStatus } : item
      )
    );
  }

  function onDragCancel() {
    setActiveIssue(null);
    lastTargetStatus.current = null;
    // Optimistische Spaltenwechsel aus onDragOver zurücknehmen
    setIssues(initialIssues);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    const start = dragStart.current;
    setActiveIssue(null);
    dragStart.current = null;

    const issueKey = String(active.id);
    const issue = findIssue(issueKey);
    // Falls beim Loslassen kein Drop-Ziel erkannt wird, zählt die zuletzt überfahrene Spalte
    const targetStatus = over
      ? resolveTargetStatus(String(over.id))
      : lastTargetStatus.current;
    lastTargetStatus.current = null;
    if (!issue || !targetStatus || !start) {
      setIssues(initialIssues);
      return;
    }

    // Neue Position zwischen den sichtbaren Nachbarkarten der Zielspalte
    const others = visibleIssues
      .filter((item) => item.status === targetStatus && item.key !== issueKey)
      .sort((a, b) => a.order - b.order);
    const overIssue = others.find((item) => item.key === String(over?.id));

    let newOrder: number;
    if (!overIssue) {
      newOrder = (others.at(-1)?.order ?? 0) + 1;
    } else {
      const index = others.indexOf(overIssue);
      // Innerhalb derselben Spalte nach unten gezogen → hinter die Zielkarte
      const placeAfter = start.status === targetStatus && start.order < overIssue.order;
      const before = placeAfter ? overIssue : others[index - 1];
      const after = placeAfter ? others[index + 1] : overIssue;
      newOrder =
        before && after
          ? (before.order + after.order) / 2
          : before
            ? before.order + 1
            : after.order - 1;
    }

    if (start.status === targetStatus && start.order === newOrder) return;

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
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            placeholder="Board filtern…"
            className="h-8 w-44 pl-8 text-sm"
            aria-label="Board filtern"
          />
        </div>
        <div className="flex items-center -space-x-1">
          {members.map((member) => (
            <button
              key={member.id}
              onClick={() =>
                setAssigneeFilter((current) => (current === member.id ? null : member.id))
              }
              className={cn(
                "rounded-full ring-2 ring-background transition-transform hover:z-10 hover:-translate-y-0.5",
                assigneeFilter === member.id && "z-10 ring-foreground"
              )}
              title={member.name}
              aria-pressed={assigneeFilter === member.id}
            >
              <UserAvatar name={member.name} color={member.avatarColor} kind={member.kind} />
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant={assigneeFilter === currentUserId ? "secondary" : "ghost"}
          onClick={() => setAssigneeFilter((c) => (c === currentUserId ? null : currentUserId))}
        >
          Nur meine
        </Button>
        <Button
          size="sm"
          variant={assigneeFilter === "unassigned" ? "secondary" : "ghost"}
          onClick={() => setAssigneeFilter((c) => (c === "unassigned" ? null : "unassigned"))}
        >
          Nicht zugewiesen
        </Button>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_TYPES}>Alle Typen</SelectItem>
            {ISSUE_TYPES.map((type) => (
              <SelectItem key={type} value={type}>{TYPE_LABELS[type]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtersActive && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            onClick={() => {
              setAssigneeFilter(null);
              setTypeFilter(ALL_TYPES);
              setTextFilter("");
            }}
          >
            <XIcon />
            Zurücksetzen
          </Button>
        )}
      </div>

      <DndContext
        id="kanban-board"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                footer={
                  column.status === "TODO" && (
                    <button
                      onClick={() => openCreateIssue({ sprintId })}
                      className="mt-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                      <PlusIcon className="size-4" />
                      Ticket erstellen
                    </button>
                  )
                }
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
