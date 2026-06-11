import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { UserAvatar } from "@/components/user-avatar";

export default async function ProjectsPage() {
  const user = await requireUser();
  const projects = await db.project.findMany({
    where: { members: { some: { userId: user.id } } },
    include: {
      members: { include: { user: { select: { name: true, avatarColor: true } } } },
      _count: { select: { issues: true } },
      sprints: { where: { status: "ACTIVE" }, select: { name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <main className="mx-auto w-full max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Projekte</h1>
          <p className="text-sm text-muted-foreground">Alle Projekte, in denen du Mitglied bist.</p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Noch keine Projekte</p>
          <p className="text-sm">Lege dein erstes Projekt an, um Tickets und Sprints zu verwalten.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.key}/board`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono">{project.key}</Badge>
                    {project.sprints[0] && (
                      <Badge className="bg-blue-600 text-white hover:bg-blue-600">
                        {project.sprints[0].name} läuft
                      </Badge>
                    )}
                  </div>
                  <CardTitle className="text-lg">{project.name}</CardTitle>
                  {project.description && (
                    <CardDescription className="line-clamp-2">{project.description}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="flex items-center justify-between">
                  <div className="flex -space-x-1.5">
                    {project.members.slice(0, 4).map((member) => (
                      <UserAvatar
                        key={member.userId}
                        name={member.user.name}
                        color={member.user.avatarColor}
                        className="ring-2 ring-background"
                      />
                    ))}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {project._count.issues} Tickets
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
