import Link from "next/link";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { daysUntil, shortDateFormat } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/board/kanban-board";
import { CompleteSprintButton } from "@/components/board/complete-sprint-button";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { user, project } = await requireProjectAccess(key);

  const activeSprint = await db.sprint.findFirst({
    where: { projectId: project.id, status: "ACTIVE" },
    include: {
      issues: {
        include: {
          assignee: { select: { id: true, name: true, avatarColor: true, kind: true } },
          labels: { include: { label: true } },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!activeSprint) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <p className="font-medium">Kein aktiver Sprint</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Starte einen Sprint im Backlog, um seine Tickets hier auf dem Board zu sehen.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.key}/backlog`}>Zum Backlog</Link>
        </Button>
      </div>
    );
  }

  const members = project.members.map((member) => ({
    id: member.user.id,
    name: member.user.name,
    avatarColor: member.user.avatarColor,
    kind: member.user.kind,
  }));

  const issues = activeSprint.issues.map((issue) => ({
    key: issue.key,
    title: issue.title,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    order: issue.order,
    storyPoints: issue.storyPoints,
    dueDate: issue.dueDate?.toISOString() ?? null,
    assignee: issue.assignee,
    labels: issue.labels.map((entry) => ({ name: entry.label.name, color: entry.label.color })),
  }));

  const done = issues.filter((issue) => issue.status === "DONE");
  const totalPoints = issues.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0);
  const donePoints = done.reduce((sum, issue) => sum + (issue.storyPoints ?? 0), 0);
  const progress = issues.length ? Math.round((done.length / issues.length) * 100) : 0;
  const remaining = activeSprint.endDate ? daysUntil(activeSprint.endDate) : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">{activeSprint.name}</h1>
          {activeSprint.goal && (
            <p className="text-sm text-muted-foreground">{activeSprint.goal}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {activeSprint.startDate && activeSprint.endDate && (
              <span>
                {shortDateFormat.format(activeSprint.startDate)} – {shortDateFormat.format(activeSprint.endDate)}
              </span>
            )}
            {remaining !== null && (
              <span className={remaining < 0 ? "text-red-600 dark:text-red-400" : undefined}>
                {remaining < 0
                  ? `${-remaining} ${-remaining === 1 ? "Tag" : "Tage"} überzogen`
                  : remaining === 0
                    ? "Endet heute"
                    : `Noch ${remaining} ${remaining === 1 ? "Tag" : "Tage"}`}
              </span>
            )}
            <span className="flex items-center gap-2">
              <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                <span className="block h-full bg-foreground" style={{ width: `${progress}%` }} />
              </span>
              {done.length}/{issues.length} erledigt
              {totalPoints > 0 && ` · ${donePoints}/${totalPoints} SP`}
            </span>
          </div>
        </div>
        <CompleteSprintButton
          projectKey={project.key}
          sprintId={activeSprint.id}
          openCount={issues.length - done.length}
        />
      </div>
      <KanbanBoard
        projectKey={project.key}
        sprintId={activeSprint.id}
        currentUserId={user.id}
        initialIssues={issues}
        members={members}
      />
    </div>
  );
}
