import Link from "next/link";
import { notFound } from "next/navigation";
import { ExpandIcon } from "lucide-react";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { dateTimeFormat, toDateInput } from "@/lib/format";
import { TypeIcon } from "@/components/issue-badges";
import { IssueType } from "@/lib/constants";
import { Separator } from "@/components/ui/separator";
import { IssueSidePanel } from "@/components/issue/issue-side-panel";
import { IssueTextEditors } from "@/components/issue/issue-text-editors";
import { CommentForm } from "@/components/issue/comment-form";
import { CommentItem } from "@/components/issue/comment-item";

export async function IssueDetail({
  projectKey,
  issueKey,
  inModal = false,
}: {
  projectKey: string;
  issueKey: string;
  inModal?: boolean;
}) {
  const { user, project, isAdmin } = await requireProjectAccess(projectKey);

  const [issue, sprints] = await Promise.all([
    db.issue.findUnique({
      where: { key: issueKey, projectId: project.id },
      include: {
        assignee: { select: { id: true, name: true, avatarColor: true } },
        reporter: { select: { name: true, avatarColor: true } },
        sprint: { select: { id: true, name: true, status: true } },
        labels: { select: { labelId: true } },
        comments: {
          include: { author: { select: { id: true, name: true, avatarColor: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    }),
    db.sprint.findMany({
      where: { projectId: project.id, status: { in: ["ACTIVE", "PLANNED"] } },
      select: { id: true, name: true, status: true },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!issue) notFound();

  const members = project.members.map((member) => ({
    id: member.user.id,
    name: member.user.name,
    avatarColor: member.user.avatarColor,
  }));

  // Abgeschlossener Sprint des Tickets soll trotzdem angezeigt werden
  const sprintOptions =
    issue.sprint && !sprints.some((sprint) => sprint.id === issue.sprint!.id)
      ? [...sprints, issue.sprint]
      : sprints;

  return (
    <div className="grid gap-8 md:grid-cols-[1fr_220px]">
      <div className="min-w-0 space-y-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <TypeIcon type={issue.type as IssueType} className="size-3.5" />
            <Link href={`/projects/${projectKey}/backlog`} className="hover:text-foreground">
              {project.name}
            </Link>
            <span>/</span>
            <span className="font-mono">{issue.key}</span>
            {inModal && (
              <a
                href={`/projects/${projectKey}/issues/${issue.key}`}
                className="ml-auto mr-8 inline-flex items-center gap-1 hover:text-foreground"
                title="Als eigene Seite öffnen"
              >
                <ExpandIcon className="size-3.5" />
              </a>
            )}
          </div>
          <IssueTextEditors
            key={`${issue.title}|${issue.description}`}
            projectKey={projectKey}
            issueKey={issue.key}
            title={issue.title}
            description={issue.description}
          />
        </div>

        <Separator />

        <div>
          <h3 className="mb-4 text-sm font-semibold">
            Kommentare <span className="font-normal text-muted-foreground">{issue.comments.length}</span>
          </h3>
          <ul className="space-y-5">
            {issue.comments.map((comment) => (
              <CommentItem
                key={comment.id}
                projectKey={projectKey}
                comment={{
                  id: comment.id,
                  body: comment.body,
                  createdAt: comment.createdAt.toISOString(),
                  edited: comment.editedAt !== null,
                  author: comment.author,
                }}
                canEdit={comment.author.id === user.id}
                canDelete={comment.author.id === user.id || isAdmin}
              />
            ))}
          </ul>
          <div className="mt-5">
            <CommentForm projectKey={projectKey} issueKey={issue.key} />
          </div>
        </div>
      </div>

      <IssueSidePanel
        projectKey={projectKey}
        issueKey={issue.key}
        inModal={inModal}
        status={issue.status}
        priority={issue.priority}
        type={issue.type}
        assigneeId={issue.assignee?.id ?? null}
        sprintId={issue.sprint?.id ?? null}
        storyPoints={issue.storyPoints}
        dueDate={toDateInput(issue.dueDate)}
        members={members}
        sprints={sprintOptions}
        labels={project.labels.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color,
        }))}
        activeLabelIds={issue.labels.map((entry) => entry.labelId)}
        reporter={issue.reporter}
        createdAt={dateTimeFormat.format(issue.createdAt)}
        updatedAt={dateTimeFormat.format(issue.updatedAt)}
      />
    </div>
  );
}
