import { notFound } from "next/navigation";
import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { TypeIcon } from "@/components/issue-badges";
import { IssueType } from "@/lib/constants";
import { UserAvatar } from "@/components/user-avatar";
import { Separator } from "@/components/ui/separator";
import { IssueSidePanel } from "@/components/issue/issue-side-panel";
import { IssueTextEditors } from "@/components/issue/issue-text-editors";
import { CommentForm } from "@/components/issue/comment-form";

export async function IssueDetail({
  projectKey,
  issueKey,
}: {
  projectKey: string;
  issueKey: string;
}) {
  const { project } = await requireProjectAccess(projectKey);

  const issue = await db.issue.findUnique({
    where: { key: issueKey, projectId: project.id },
    include: {
      assignee: { select: { id: true, name: true, avatarColor: true } },
      reporter: { select: { name: true, avatarColor: true } },
      sprint: { select: { name: true } },
      labels: { select: { labelId: true } },
      comments: {
        include: { author: { select: { name: true, avatarColor: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!issue) notFound();

  const members = project.members.map((member) => ({
    id: member.user.id,
    name: member.user.name,
    avatarColor: member.user.avatarColor,
  }));

  const dateFormat = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_240px]">
      <div className="min-w-0 space-y-6">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
            <TypeIcon type={issue.type as IssueType} />
            <span className="font-mono">{issue.key}</span>
            {issue.sprint && <span>· {issue.sprint.name}</span>}
          </div>
          <IssueTextEditors
            projectKey={projectKey}
            issueKey={issue.key}
            title={issue.title}
            description={issue.description}
          />
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold">
            Kommentare ({issue.comments.length})
          </h3>
          <ul className="space-y-4">
            {issue.comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <UserAvatar
                  name={comment.author.name}
                  color={comment.author.avatarColor}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    <span className="font-medium">{comment.author.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      {dateFormat.format(comment.createdAt)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <CommentForm projectKey={projectKey} issueKey={issue.key} />
          </div>
        </div>
      </div>

      <IssueSidePanel
        projectKey={projectKey}
        issueKey={issue.key}
        status={issue.status}
        priority={issue.priority}
        type={issue.type}
        assigneeId={issue.assignee?.id ?? null}
        members={members}
        labels={project.labels.map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color,
        }))}
        activeLabelIds={issue.labels.map((entry) => entry.labelId)}
        reporter={issue.reporter}
        createdAt={dateFormat.format(issue.createdAt)}
      />
    </div>
  );
}
