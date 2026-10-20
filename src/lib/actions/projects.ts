"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { ADMIN_ONLY, requireProjectAccess } from "@/lib/access";

export type FormState = { error?: string; success?: boolean } | undefined;

function revalidateProject(projectKey: string) {
  revalidatePath(`/projects/${projectKey}`, "layout");
  revalidatePath("/projects");
}

const projectFieldsSchema = z.object({
  name: z.string().trim().min(3, "Projektname muss mindestens 3 Zeichen haben.").max(80),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null),
});

const createProjectSchema = projectFieldsSchema.extend({
  key: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key: 2–10 Großbuchstaben/Ziffern, beginnt mit Buchstabe (z.B. WEB)."),
});

export async function createProjectAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    key: String(formData.get("key") ?? "").trim().toUpperCase(),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db.project.findUnique({ where: { key: parsed.data.key } });
  if (existing) return { error: `Der Key "${parsed.data.key}" ist bereits vergeben.` };

  await db.project.create({
    data: {
      ...parsed.data,
      ownerId: user.id,
      members: { create: [{ userId: user.id, role: "ADMIN" }] },
    },
  });

  revalidatePath("/projects");
  redirect(`/projects/${parsed.data.key}/board`);
}

export async function updateProjectAction(
  projectKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };

  const parsed = projectFieldsSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.project.update({ where: { id: project.id }, data: parsed.data });
  revalidateProject(projectKey);
  return { success: true };
}

/** Nur der Owner darf ein Projekt endgültig löschen. */
export async function deleteProjectAction(projectKey: string): Promise<FormState> {
  const { user, project } = await requireProjectAccess(projectKey);
  if (project.ownerId !== user.id) return { error: "Nur der Projekt-Owner kann das Projekt löschen." };

  await db.project.delete({ where: { id: project.id } });
  revalidatePath("/projects");
  redirect("/projects");
}

export async function addMemberAction(
  projectKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const newMember = await db.user.findUnique({ where: { email } });
  if (!newMember) return { error: `Kein Benutzer mit der E-Mail "${email}" gefunden.` };

  if (project.members.some((member) => member.userId === newMember.id)) {
    return { error: "Diese Person ist bereits Mitglied." };
  }

  await db.projectMember.create({
    data: { projectId: project.id, userId: newMember.id },
  });
  revalidateProject(projectKey);
  return { success: true };
}

/** Entfernt ein Mitglied; seine offenen Tickets werden freigegeben. */
async function removeMember(projectId: string, userId: string) {
  await db.$transaction([
    db.issue.updateMany({
      where: { projectId, assigneeId: userId },
      data: { assigneeId: null },
    }),
    db.projectMember.delete({
      where: { projectId_userId: { projectId, userId } },
    }),
  ]);
}

export async function removeMemberAction(projectKey: string, userId: string): Promise<FormState> {
  const { project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };
  if (userId === project.ownerId) return { error: "Der Owner kann nicht entfernt werden." };
  if (!project.members.some((member) => member.userId === userId)) {
    return { error: "Diese Person ist kein Mitglied." };
  }

  await removeMember(project.id, userId);
  revalidateProject(projectKey);
}

export async function leaveProjectAction(projectKey: string): Promise<FormState> {
  const { user, project } = await requireProjectAccess(projectKey);
  if (user.id === project.ownerId) {
    return { error: "Als Owner kannst du das Projekt nicht verlassen – lösche es stattdessen." };
  }

  await removeMember(project.id, user.id);
  revalidatePath("/projects");
  redirect("/projects");
}

export async function setMemberRoleAction(
  projectKey: string,
  userId: string,
  role: string
): Promise<FormState> {
  const { project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };
  const parsedRole = z.enum(["ADMIN", "MEMBER"]).safeParse(role);
  if (!parsedRole.success) return { error: "Ungültige Rolle." };
  if (userId === project.ownerId) return { error: "Der Owner ist immer Admin." };

  const result = await db.projectMember.updateMany({
    where: { projectId: project.id, userId },
    data: { role: parsedRole.data },
  });
  if (result.count === 0) return { error: "Diese Person ist kein Mitglied." };
  revalidateProject(projectKey);
}

const labelSchema = z.object({
  name: z.string().trim().min(1, "Label-Name fehlt.").max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Ungültige Farbe."),
});

export async function createLabelAction(
  projectKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };
  const parsed = labelSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  if (project.labels.some((label) => label.name.toLowerCase() === parsed.data.name.toLowerCase())) {
    return { error: "Dieses Label existiert bereits." };
  }

  await db.label.create({ data: { projectId: project.id, ...parsed.data } });
  revalidateProject(projectKey);
  return { success: true };
}

export async function deleteLabelAction(projectKey: string, labelId: string): Promise<FormState> {
  const { project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };
  await db.label.deleteMany({ where: { id: labelId, projectId: project.id } });
  revalidateProject(projectKey);
}
