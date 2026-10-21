import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { BacklogSection } from "@/components/backlog/backlog-section";
import { CreateSprintDialog } from "@/components/backlog/create-sprint-dialog";

const issueInclude = { assignee: { select: { name: true, avatarColor: true } } } as const;

export default async function BacklogPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { project } = await requireProjectAccess(key);

  const [sprints, backlogIssues, sprintCount] = await Promise.all([
    db.sprint.findMany({
      where: { projectId: project.id, status: { in: ["ACTIVE", "PLANNED"] } },
      include: { issues: { include: issueInclude, orderBy: { order: "asc" } } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
    db.issue.findMany({
      where: { projectId: project.id, sprintId: null },
      include: issueInclude,
      orderBy: { order: "asc" },
    }),
    db.sprint.count({ where: { projectId: project.id } }),
  ]);

  const sprintTargets = sprints.map((sprint) => ({ id: sprint.id, name: sprint.name }));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Backlog</h1>
          <p className="text-sm text-muted-foreground">
            Plane Sprints und verschiebe Tickets über das Menü (···).
          </p>
        </div>
        <CreateSprintDialog projectKey={project.key} suggestedName={`Sprint ${sprintCount + 1}`} />
      </div>

      <div className="space-y-4">
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
  storyPoints: number | null;
  dueDate: Date | null;
  assignee: { name: string; avatarColor: string } | null;
};

function toIssueProps(issue: IssueWithAssignee) {
  return {
    key: issue.key,
    title: issue.title,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    storyPoints: issue.storyPoints,
    dueDate: issue.dueDate?.toISOString() ?? null,
    assignee: issue.assignee,
  };
}
