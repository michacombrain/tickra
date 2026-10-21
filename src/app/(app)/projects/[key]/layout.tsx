import { requireProjectAccess } from "@/lib/access";
import { db } from "@/lib/db";
import { ProjectMobileNav, ProjectSidebar } from "@/components/project-sidebar";
import { CreateIssueProvider } from "@/components/issue/create-issue-dialog";

export default async function ProjectLayout({
  children,
  modal,
  params,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const { project } = await requireProjectAccess(key);

  const sprints = await db.sprint.findMany({
    where: { projectId: project.id, status: { in: ["ACTIVE", "PLANNED"] } },
    select: { id: true, name: true, status: true },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  return (
    <CreateIssueProvider
      projectKey={project.key}
      members={project.members.map((member) => ({ id: member.user.id, name: member.user.name }))}
      sprints={sprints}
    >
      <div className="flex min-w-0 flex-1 flex-col md:flex-row">
        <ProjectSidebar projectKey={project.key} projectName={project.name} />
        <ProjectMobileNav projectKey={project.key} projectName={project.name} />
        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
        {modal}
      </div>
    </CreateIssueProvider>
  );
}
