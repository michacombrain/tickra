import Link from "next/link";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { KanbanBoard } from "@/components/board/kanban-board";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { project } = await requireProjectAccess(key);

  const activeSprint = await db.sprint.findFirst({
    where: { projectId: project.id, status: "ACTIVE" },
    include: {
      issues: {
        include: {
          assignee: { select: { id: true, name: true, avatarColor: true } },
          labels: { include: { label: true } },
        },
        orderBy: { order: "asc" },
      },
    },
  });

  if (!activeSprint) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center">
        <p className="font-medium">Kein aktiver Sprint</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Starte einen Sprint im Backlog, um Tickets auf dem Board zu sehen.
        </p>
        <Button asChild variant="outline">
          <Link href={`/projects/${project.key}/backlog`}>Zum Backlog</Link>
        </Button>
      </div>
    );
  }

  const members = project.members.map((member) => ({
    id: member.user.id,
    name: member.user.name,
    avatarColor: member.user.avatarColor,
  }));

  const issues = activeSprint.issues.map((issue) => ({
    key: issue.key,
    title: issue.title,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    order: issue.order,
    assignee: issue.assignee
      ? { id: issue.assignee.id, name: issue.assignee.name, avatarColor: issue.assignee.avatarColor }
      : null,
    labels: issue.labels.map((entry) => ({ name: entry.label.name, color: entry.label.color })),
  }));

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-bold tracking-tight">{activeSprint.name}</h1>
        {activeSprint.goal && (
          <p className="text-sm text-muted-foreground">{activeSprint.goal}</p>
        )}
      </div>
      <KanbanBoard projectKey={project.key} initialIssues={issues} members={members} />
    </div>
  );
}
