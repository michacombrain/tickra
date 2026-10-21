import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { IssuePriority, IssueStatus, IssueType, ISSUE_PRIORITIES } from "@/lib/constants";
import { DueDate, PriorityIcon, StatusBadge, StoryPoints, TypeIcon } from "@/components/issue-badges";

export const metadata = { title: "Meine Tickets – Tickra" };

export default async function MyIssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>;
}) {
  const user = await requireUser();
  const showDone = (await searchParams).done === "1";

  const issues = await db.issue.findMany({
    where: {
      assigneeId: user.id,
      project: { members: { some: { userId: user.id } } },
      ...(showDone ? {} : { status: { not: "DONE" } }),
    },
    include: {
      project: { select: { key: true, name: true } },
      sprint: { select: { name: true, status: true } },
    },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
  });

  // Fällige zuerst, dann nach Priorität
  const priorityRank = (priority: string) => ISSUE_PRIORITIES.indexOf(priority as IssuePriority);
  issues.sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return priorityRank(a.priority) - priorityRank(b.priority);
  });

  const byProject = new Map<string, { name: string; issues: typeof issues }>();
  for (const issue of issues) {
    const group = byProject.get(issue.project.key) ?? { name: issue.project.name, issues: [] };
    group.issues.push(issue);
    byProject.set(issue.project.key, group);
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Meine Tickets</h1>
          <p className="text-sm text-muted-foreground">
            {issues.length} {showDone ? "zugewiesene" : "offene"} {issues.length === 1 ? "Ticket" : "Tickets"} in allen Projekten
          </p>
        </div>
        <Link
          href={showDone ? "/my-issues" : "/my-issues?done=1"}
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {showDone ? "Erledigte ausblenden" : "Erledigte anzeigen"}
        </Link>
      </div>

      {issues.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">Alles erledigt</p>
          <p className="mt-1 text-sm text-muted-foreground">Dir sind gerade keine offenen Tickets zugewiesen.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...byProject.entries()].map(([projectKey, group]) => (
            <section key={projectKey}>
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Link href={`/projects/${projectKey}/board`} className="hover:underline">
                  {group.name}
                </Link>
                <span className="font-mono text-xs font-normal text-muted-foreground">{projectKey}</span>
              </h2>
              <ul className="divide-y rounded-xl border">
                {group.issues.map((issue) => (
                  <li key={issue.key} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50">
                    <TypeIcon type={issue.type as IssueType} className="size-3.5" />
                    <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">{issue.key}</span>
                    <Link
                      href={`/projects/${projectKey}/issues/${issue.key}`}
                      className="min-w-0 flex-1 truncate text-sm hover:underline"
                    >
                      {issue.title}
                    </Link>
                    {issue.sprint && (
                      <span className="hidden text-xs text-muted-foreground lg:inline">{issue.sprint.name}</span>
                    )}
                    <DueDate date={issue.dueDate} done={issue.status === "DONE"} />
                    <span className="hidden sm:contents">
                      <StatusBadge status={issue.status as IssueStatus} />
                    </span>
                    <StoryPoints points={issue.storyPoints} />
                    <PriorityIcon priority={issue.priority as IssuePriority} className="size-3.5" />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
