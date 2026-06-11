import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { BacklogSection } from "@/components/backlog/backlog-section";
import { CreateSprintDialog } from "@/components/backlog/create-sprint-dialog";

export default async function BacklogPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { project } = await requireProjectAccess(key);

  const sprints = await db.sprint.findMany({
    where: { projectId: project.id, status: { in: ["ACTIVE", "PLANNED"] } },
    include: {
      issues: {
        include: { assignee: { select: { name: true, avatarColor: true } } },
        orderBy: { order: "asc" },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const backlogIssues = await db.issue.findMany({
    where: { projectId: project.id, sprintId: null },
    include: { assignee: { select: { name: true, avatarColor: true } } },
    orderBy: { order: "asc" },
  });

  const sprintTargets = sprints.map((sprint) => ({ id: sprint.id, name: sprint.name }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Backlog</h1>
          <p className="text-sm text-muted-foreground">
            Plane Sprints und verschiebe Tickets per Menü.
          </p>
        </div>
        <CreateSprintDialog projectKey={project.key} />
      </div>

      <div className="space-y-6">
        {sprints.map((sprint) => (
          <BacklogSection
            key={sprint.id}
            projectKey={project.key}
            sprint={{
              id: sprint.id,
              name: sprint.name,
              goal: sprint.goal,
              status: sprint.status,
            }}
            issues={sprint.issues.map(toIssueProps)}
            sprintTargets={sprintTargets}
          />
        ))}
        <BacklogSection
          projectKey={project.key}
          sprint={null}
          issues={backlogIssues.map(toIssueProps)}
          sprintTargets={sprintTargets}
        />
      </div>
    </div>
  );
}

type IssueWithAssignee = {
  key: string;
  title: string;
  type: string;
  status: string;
  priority: string;
  assignee: { name: string; avatarColor: string } | null;
};

function toIssueProps(issue: IssueWithAssignee) {
  return {
    key: issue.key,
    title: issue.title,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    assignee: issue.assignee,
  };
}
