import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { UserAvatar } from "@/components/user-avatar";

export const metadata = { title: "Projekte – Tickra" };

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await db.project.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      members: { include: { user: { select: { name: true, avatarColor: true, kind: true } } } },
      sprints: {
        where: { status: "ACTIVE" },
        select: { name: true, issues: { select: { status: true } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const openCounts = await db.issue.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projects.map((p) => p.id) }, status: { not: "DONE" } },
    _count: true,
  });
  const openByProject = new Map(openCounts.map((row) => [row.projectId, row._count]));

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Projekte</h1>
          <p className="text-sm text-muted-foreground">Alle Projekte, in denen du Mitglied bist.</p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="mb-1 font-medium">Noch keine Projekte</p>
          <p className="text-sm text-muted-foreground">
            Lege dein erstes Projekt an oder lass dich von einem Admin einladen.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const sprint = project.sprints[0];
            const sprintDone = sprint?.issues.filter((issue) => issue.status === "DONE").length ?? 0;
            const sprintTotal = sprint?.issues.length ?? 0;
            const progress = sprintTotal ? Math.round((sprintDone / sprintTotal) * 100) : 0;
            return (
              <Link
                key={project.id}
                href={`/projects/${project.key}/board`}
                className="group flex flex-col rounded-xl border p-4 transition-colors hover:border-foreground/25 hover:bg-muted/30"
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-semibold">
                    {project.key.slice(0, 3)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{project.name}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{project.key}</div>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-sm text-muted-foreground">
                  {project.description || "Keine Beschreibung"}
                </p>
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="truncate">{sprint ? sprint.name : "Kein aktiver Sprint"}</span>
                    {sprint && <span className="tabular-nums">{sprintDone}/{sprintTotal}</span>}
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-foreground" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between">
                  <div className="flex -space-x-1.5">
                    {project.members.slice(0, 5).map((member) => (
                      <UserAvatar
                        key={member.userId}
                        name={member.user.name}
                        color={member.user.avatarColor}
                        kind={member.user.kind}
                        className="size-6 text-[10px] ring-2 ring-background"
                      />
                    ))}
                    {project.members.length > 5 && (
                      <span className="flex size-6 items-center justify-center rounded-full bg-muted text-[10px] ring-2 ring-background">
                        +{project.members.length - 5}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {openByProject.get(project.id) ?? 0} offen
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
