"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";

export type FormState = { error?: string } | undefined;

const DAY_MS = 24 * 3600 * 1000;

function revalidateProject(projectKey: string) {
  revalidatePath(`/projects/${projectKey}`, "layout");
  revalidatePath("/projects");
}

const sprintSchema = z.object({
  name: z.string().trim().min(1, "Name fehlt.").max(50),
  goal: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((value) => value || null),
});

function readSprintForm(formData: FormData) {
  return sprintSchema.safeParse({
    name: formData.get("name"),
    goal: formData.get("goal") ?? undefined,
  });
}

export async function createSprintAction(
  projectKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const parsed = readSprintForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.sprint.create({ data: { projectId: project.id, ...parsed.data } });
  revalidateProject(projectKey);
}

export async function updateSprintAction(
  projectKey: string,
  sprintId: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const parsed = readSprintForm(formData);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await db.sprint.updateMany({
    where: { id: sprintId, projectId: project.id },
    data: parsed.data,
  });
  if (result.count === 0) return { error: "Sprint nicht gefunden." };
  revalidateProject(projectKey);
}

const durationSchema = z.number().int().min(1).max(8);

export async function startSprintAction(
  projectKey: string,
  sprintId: string,
  weeks = 2
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const parsedWeeks = durationSchema.safeParse(weeks);
  if (!parsedWeeks.success) return { error: "Ungültige Sprint-Dauer." };

  const active = await db.sprint.findFirst({
    where: { projectId: project.id, status: "ACTIVE" },
  });
  if (active) return { error: `Es läuft bereits ein Sprint (${active.name}). Schließe ihn zuerst ab.` };

  const result = await db.sprint.updateMany({
    where: { id: sprintId, projectId: project.id, status: "PLANNED" },
    data: {
      status: "ACTIVE",
      startDate: new Date(),
      endDate: new Date(Date.now() + parsedWeeks.data * 7 * DAY_MS),
    },
  });
  if (result.count === 0) return { error: "Nur geplante Sprints können gestartet werden." };
  revalidateProject(projectKey);
}

/** Schließt den Sprint ab; offene Tickets wandern zurück ins Backlog. */
export async function completeSprintAction(projectKey: string, sprintId: string): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);

  const sprint = await db.sprint.findFirst({
    where: { id: sprintId, projectId: project.id, status: "ACTIVE" },
  });
  if (!sprint) return { error: "Nur aktive Sprints können abgeschlossen werden." };

  await db.$transaction([
    db.issue.updateMany({
      where: { sprintId, projectId: project.id, status: { not: "DONE" } },
      data: { sprintId: null },
    }),
    db.sprint.update({
      where: { id: sprintId },
      data: { status: "COMPLETED", endDate: new Date() },
    }),
  ]);
  revalidateProject(projectKey);
}

export async function deleteSprintAction(projectKey: string, sprintId: string): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  // Tickets bleiben erhalten (sprintId wird durch onDelete: SetNull geleert)
  const result = await db.sprint.deleteMany({ where: { id: sprintId, projectId: project.id } });
  if (result.count === 0) return { error: "Sprint nicht gefunden." };
  revalidateProject(projectKey);
}
