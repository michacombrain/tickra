import { requireProjectAccess } from "@/lib/access";
import { ProjectSidebar } from "@/components/project-sidebar";

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

  return (
    <div className="flex flex-1">
      <ProjectSidebar projectKey={project.key} projectName={project.name} />
      <main className="min-w-0 flex-1 p-6">{children}</main>
      {modal}
    </div>
  );
}
