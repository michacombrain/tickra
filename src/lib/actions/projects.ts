"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { requireProjectAccess } from "@/lib/access";

export type FormState = { error?: string } | undefined;

const createProjectSchema = z.object({
  name: z.string().min(3, "Projektname muss mindestens 3 Zeichen haben."),
  key: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{1,9}$/, "Key: 2–10 Großbuchstaben/Ziffern, beginnt mit Buchstabe (z.B. WEB)."),
  description: z.string().optional(),
});

export async function createProjectAction(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const parsed = createProjectSchema.safeParse({
    name: formData.get("name"),
    key: String(formData.get("key") ?? "").toUpperCase(),
    description: formData.get("description") || undefined,
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

  redirect(`/projects/${parsed.data.key}/board`);
}

export async function addMemberAction(
  projectKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);

  const email = String(formData.get("email") ?? "").trim();
  const newMember = await db.user.findUnique({ where: { email } });
  if (!newMember) return { error: `Kein Benutzer mit der E-Mail "${email}" gefunden.` };

  if (project.members.some((member) => member.userId === newMember.id)) {
    return { error: "Diese Person ist bereits Mitglied." };
  }

  await db.projectMember.create({
    data: { projectId: project.id, userId: newMember.id },
  });
  revalidatePath(`/projects/${projectKey}`, "layout");
}

export async function removeMemberAction(projectKey: string, userId: string) {
  const { project } = await requireProjectAccess(projectKey);
  if (userId === project.ownerId) return; // Owner kann nicht entfernt werden

  await db.projectMember.delete({
    where: { projectId_userId: { projectId: project.id, userId } },
  });
  revalidatePath(`/projects/${projectKey}`, "layout");
}

const labelSchema = z.object({
  name: z.string().min(1, "Label-Name fehlt.").max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export async function createLabelAction(
  projectKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const parsed = labelSchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const existing = await db.label.findUnique({
    where: { projectId_name: { projectId: project.id, name: parsed.data.name } },
  });
  if (existing) return { error: "Dieses Label existiert bereits." };

  await db.label.create({ data: { projectId: project.id, ...parsed.data } });
  revalidatePath(`/projects/${projectKey}`, "layout");
}

export async function deleteLabelAction(projectKey: string, labelId: string) {
  const { project } = await requireProjectAccess(projectKey);
  await db.label.delete({ where: { id: labelId, projectId: project.id } });
  revalidatePath(`/projects/${projectKey}`, "layout");
}
