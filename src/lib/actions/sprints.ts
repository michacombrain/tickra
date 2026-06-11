"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";

export type FormState = { error?: string } | undefined;

export async function createSprintAction(
  projectKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);

  const parsed = z
    .object({ name: z.string().min(1, "Name fehlt.").max(50), goal: z.string().optional() })
    .safeParse({ name: formData.get("name"), goal: formData.get("goal") || undefined });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.sprint.create({
    data: { projectId: project.id, name: parsed.data.name, goal: parsed.data.goal },
  });
  revalidatePath(`/projects/${projectKey}`, "layout");
}

export async function startSprintAction(projectKey: string, sprintId: string): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);

  const active = await db.sprint.findFirst({
    where: { projectId: project.id, status: "ACTIVE" },
  });
  if (active) return { error: `Es läuft bereits ein Sprint (${active.name}). Schließe ihn zuerst ab.` };

  await db.sprint.update({
    where: { id: sprintId, projectId: project.id },
    data: {
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    },
  });
  revalidatePath(`/projects/${projectKey}`, "layout");
  return undefined;
}

/** Schließt den Sprint ab; offene Tickets wandern zurück ins Backlog. */
export async function completeSprintAction(projectKey: string, sprintId: string): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);

  await db.$transaction([
    db.issue.updateMany({
      where: { sprintId, projectId: project.id, status: { not: "DONE" } },
      data: { sprintId: null },
    }),
    db.sprint.update({
      where: { id: sprintId, projectId: project.id },
      data: { status: "COMPLETED", endDate: new Date() },
    }),
  ]);
  revalidatePath(`/projects/${projectKey}`, "layout");
  return undefined;
}

export async function deleteSprintAction(projectKey: string, sprintId: string) {
  const { project } = await requireProjectAccess(projectKey);
  // Tickets bleiben erhalten (sprintId wird durch onDelete: SetNull geleert)
  await db.sprint.delete({ where: { id: sprintId, projectId: project.id } });
  revalidatePath(`/projects/${projectKey}`, "layout");
}
