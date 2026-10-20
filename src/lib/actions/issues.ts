"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
} from "@/lib/constants";

export type FormState = { error?: string } | undefined;

type Project = Awaited<ReturnType<typeof requireProjectAccess>>["project"];

function revalidateProject(projectKey: string) {
  revalidatePath(`/projects/${projectKey}`, "layout");
  revalidatePath("/my-issues");
}

/** Prüft, dass Assignee und Sprint wirklich zu diesem Projekt gehören. */
async function validateRefs(
  project: Project,
  refs: { assigneeId?: string | null; sprintId?: string | null }
): Promise<string | null> {
  if (refs.assigneeId && !project.members.some((member) => member.userId === refs.assigneeId)) {
    return "Diese Person ist kein Mitglied des Projekts.";
  }
  if (refs.sprintId) {
    const sprint = await db.sprint.findFirst({
      where: { id: refs.sprintId, projectId: project.id },
      select: { status: true },
    });
    if (!sprint) return "Sprint nicht gefunden.";
    if (sprint.status === "COMPLETED") return "Abgeschlossene Sprints können keine Tickets aufnehmen.";
  }
  return null;
}

const issueFieldsSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt.").max(200, "Titel ist zu lang (max. 200 Zeichen)."),
  description: z.string().max(10000).nullable(),
  status: z.enum(ISSUE_STATUSES),
  priority: z.enum(ISSUE_PRIORITIES),
  type: z.enum(ISSUE_TYPES),
  assigneeId: z.string().nullable(),
  sprintId: z.string().nullable(),
  storyPoints: z.number().int().min(0).max(100).nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .transform((value) => (value ? new Date(`${value}T00:00:00`) : null)),
});

const createIssueSchema = issueFieldsSchema
  .partial()
  .required({ title: true, type: true });

export async function createIssueAction(
  projectKey: string,
  input: z.input<typeof createIssueSchema>
): Promise<{ error?: string; key?: string }> {
  const { user, project } = await requireProjectAccess(projectKey);
  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const refError = await validateRefs(project, parsed.data);
  if (refError) return { error: refError };

  const issue = await db.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: project.id },
      data: { issueCounter: { increment: 1 } },
    });
    const maxOrder = await tx.issue.aggregate({
      where: { projectId: project.id },
      _max: { order: true },
    });
    return tx.issue.create({
      data: {
        ...parsed.data,
        key: `${project.key}-${updated.issueCounter}`,
        order: (maxOrder._max.order ?? 0) + 1,
        projectId: project.id,
        reporterId: user.id,
      },
    });
  });

  revalidateProject(projectKey);
  return { key: issue.key };
}

const updateIssueSchema = issueFieldsSchema.partial();

export async function updateIssueAction(
  projectKey: string,
  issueKey: string,
  // Bewusst lose typisiert – Validierung übernimmt zod
  input: Record<string, unknown>
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const parsed = updateIssueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const refError = await validateRefs(project, parsed.data);
  if (refError) return { error: refError };

  const data = { ...parsed.data };
  // Ticket in anderen Sprint/Backlog verschoben → ans Ende der Liste
  if ("sprintId" in data) {
    const maxOrder = await db.issue.aggregate({
      where: { projectId: project.id },
      _max: { order: true },
    });
    Object.assign(data, { order: (maxOrder._max.order ?? 0) + 1 });
  }

  const result = await db.issue.updateMany({
    where: { key: issueKey, projectId: project.id },
    data,
  });
  if (result.count === 0) return { error: "Ticket nicht gefunden." };
  revalidateProject(projectKey);
}

/** Verschiebt ein Ticket auf dem Board (Statuswechsel + neue Position). */
export async function moveIssueAction(
  projectKey: string,
  issueKey: string,
  status: string,
  order: number
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const parsed = z
    .object({ status: z.enum(ISSUE_STATUSES), order: z.number().finite() })
    .safeParse({ status, order });
  if (!parsed.success) return { error: "Ungültige Position." };

  const result = await db.issue.updateMany({
    where: { key: issueKey, projectId: project.id },
    data: parsed.data,
  });
  if (result.count === 0) return { error: "Ticket nicht gefunden." };
  revalidateProject(projectKey);
}

export async function deleteIssueAction(projectKey: string, issueKey: string): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const result = await db.issue.deleteMany({ where: { key: issueKey, projectId: project.id } });
  if (result.count === 0) return { error: "Ticket nicht gefunden." };
  revalidateProject(projectKey);
}

export async function toggleIssueLabelAction(
  projectKey: string,
  issueKey: string,
  labelId: string
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  if (!project.labels.some((label) => label.id === labelId)) {
    return { error: "Label gehört nicht zu diesem Projekt." };
  }
  const issue = await db.issue.findUnique({
    where: { key: issueKey, projectId: project.id },
    select: { id: true },
  });
  if (!issue) return { error: "Ticket nicht gefunden." };

  const where = { issueId_labelId: { issueId: issue.id, labelId } };
  const existing = await db.issueLabel.findUnique({ where });
  if (existing) {
    await db.issueLabel.delete({ where });
  } else {
    await db.issueLabel.create({ data: { issueId: issue.id, labelId } });
  }
  revalidateProject(projectKey);
}

const commentSchema = z.string().trim().min(1, "Kommentar darf nicht leer sein.").max(5000);

export async function addCommentAction(
  projectKey: string,
  issueKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const { user, project } = await requireProjectAccess(projectKey);

  const body = commentSchema.safeParse(formData.get("body") ?? "");
  if (!body.success) return { error: body.error.issues[0].message };

  const issue = await db.issue.findUnique({
    where: { key: issueKey, projectId: project.id },
    select: { id: true },
  });
  if (!issue) return { error: "Ticket nicht gefunden." };

  await db.comment.create({
    data: { issueId: issue.id, authorId: user.id, body: body.data },
  });
  revalidateProject(projectKey);
}

/** Nur der Autor darf seinen Kommentar bearbeiten. */
export async function updateCommentAction(
  projectKey: string,
  commentId: string,
  body: string
): Promise<FormState> {
  const { user, project } = await requireProjectAccess(projectKey);
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const result = await db.comment.updateMany({
    where: { id: commentId, authorId: user.id, issue: { projectId: project.id } },
    data: { body: parsed.data, editedAt: new Date() },
  });
  if (result.count === 0) return { error: "Kommentar nicht gefunden." };
  revalidateProject(projectKey);
}

/** Autor oder Projekt-Admin dürfen löschen. */
export async function deleteCommentAction(
  projectKey: string,
  commentId: string
): Promise<FormState> {
  const { user, project, isAdmin } = await requireProjectAccess(projectKey);
  const result = await db.comment.deleteMany({
    where: {
      id: commentId,
      issue: { projectId: project.id },
      ...(isAdmin ? {} : { authorId: user.id }),
    },
  });
  if (result.count === 0) return { error: "Kommentar nicht gefunden." };
  revalidateProject(projectKey);
}
