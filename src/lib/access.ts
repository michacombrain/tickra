import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const ADMIN_ONLY = "Nur Projekt-Admins dürfen das.";

export const userSummarySelect = {
  id: true,
  name: true,
  email: true,
  avatarColor: true,
  kind: true,
} as const;

/** Projekt + Mitgliedschaft eines Users laden – null, wenn kein Zugriff. Ohne Redirects (auch für die API). */
export async function loadProjectAccess(userId: string, projectKey: string) {
  const project = await db.project.findUnique({
    where: { key: projectKey },
    include: {
      members: {
        include: { user: { select: userSummarySelect } },
        orderBy: { user: { name: "asc" } },
      },
      labels: { orderBy: { name: "asc" } },
    },
  });
  if (!project) return null;

  const membership = project.members.find((member) => member.userId === userId);
  if (!membership) return null;

  const isAdmin = membership.role === "ADMIN" || project.ownerId === userId;
  return { project, role: membership.role, isAdmin };
}

export type ProjectAccess = NonNullable<Awaited<ReturnType<typeof loadProjectAccess>>>;
export type AccessProject = ProjectAccess["project"];

/** Liefert User + Projekt, wenn der eingeloggte User Mitglied ist – sonst 404. */
export async function requireProjectAccess(projectKey: string) {
  const user = await requireUser();
  const access = await loadProjectAccess(user.id, projectKey);
  if (!access) notFound();
  return { user, ...access };
}
