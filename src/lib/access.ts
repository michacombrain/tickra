import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** Liefert User + Projekt, wenn der eingeloggte User Mitglied ist – sonst 404. */
export async function requireProjectAccess(projectKey: string) {
  const user = await requireUser();
  const project = await db.project.findUnique({
    where: { key: projectKey },
    include: {
      members: { include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } } },
      labels: { orderBy: { name: "asc" } },
    },
  });
  if (!project) notFound();

  const membership = project.members.find((member) => member.userId === user.id);
  if (!membership) notFound();

  return { user, project, role: membership.role };
}
