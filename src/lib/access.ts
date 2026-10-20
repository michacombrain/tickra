import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export const ADMIN_ONLY = "Nur Projekt-Admins dürfen das.";

/** Liefert User + Projekt, wenn der eingeloggte User Mitglied ist – sonst 404. */
export async function requireProjectAccess(projectKey: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({
    where: { key: projectKey },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } },
        orderBy: { user: { name: "asc" } },
      },
      labels: { orderBy: { name: "asc" } },
    },
  });
  if (!project) notFound();

  const membership = project.members.find((member) => member.userId === user.id);
  if (!membership) notFound();

  const isAdmin = membership.role === "ADMIN" || project.ownerId === user.id;
  return { user, project, role: membership.role, isAdmin };
}
