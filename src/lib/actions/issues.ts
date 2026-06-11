"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireProjectAccess } from "@/lib/access";
import { requireUser } from "@/lib/session";
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
} from "@/lib/constants";

export type FormState = { error?: string } | undefined;

function revalidateProject(projectKey: string) {
  revalidatePath(`/projects/${projectKey}`, "layout");
}

const createIssueSchema = z.object({
  title: z.string().min(1, "Titel fehlt.").max(200),
  type: z.enum(ISSUE_TYPES),
  sprintId: z.string().nullable(),
});

export async function createIssueAction(
  projectKey: string,
  input: { title: string; type: string; sprintId: string | null }
): Promise<{ error?: string; key?: string }> {
  const { user, project } = await requireProjectAccess(projectKey);
  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

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
        key: `${project.key}-${updated.issueCounter}`,
        title: parsed.data.title,
        type: parsed.data.type,
        sprintId: parsed.data.sprintId,
        order: (maxOrder._max.order ?? 0) + 1,
        projectId: project.id,
        reporterId: user.id,
      },
    });
  });

  revalidateProject(projectKey);
  return { key: issue.key };
}

const updateIssueSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().nullable(),
    status: z.enum(ISSUE_STATUSES),
    priority: z.enum(ISSUE_PRIORITIES),
    type: z.enum(ISSUE_TYPES),
    assigneeId: z.string().nullable(),
    sprintId: z.string().nullable(),
  })
  .partial();

export async function updateIssueAction(
  projectKey: string,
  issueKey: string,
  input: Record<string, unknown>
): Promise<FormState> {
  const { project } = await requireProjectAccess(projectKey);
  const parsed = updateIssueSchema.safeParse(input);
  if (!parsed.success) return { error: "Ungültige Eingabe." };

  await db.issue.update({
    where: { key: issueKey, projectId: project.id },
    data: parsed.data,
  });
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
  const parsedStatus = z.enum(ISSUE_STATUSES).safeParse(status);
  if (!parsedStatus.success) return { error: "Ungültiger Status." };

  await db.issue.update({
    where: { key: issueKey, projectId: project.id },
    data: { status: parsedStatus.data, order },
  });
  revalidateProject(projectKey);
}

export async function deleteIssueAction(projectKey: string, issueKey: string) {
  const { project } = await requireProjectAccess(projectKey);
  await db.issue.delete({ where: { key: issueKey, projectId: project.id } });
  revalidateProject(projectKey);
}

export async function toggleIssueLabelAction(
  projectKey: string,
  issueKey: string,
  labelId: string
) {
  const { project } = await requireProjectAccess(projectKey);
  const issue = await db.issue.findUniqueOrThrow({
    where: { key: issueKey, projectId: project.id },
    select: { id: true },
  });

  const existing = await db.issueLabel.findUnique({
    where: { issueId_labelId: { issueId: issue.id, labelId } },
  });
  if (existing) {
    await db.issueLabel.delete({
      where: { issueId_labelId: { issueId: issue.id, labelId } },
    });
  } else {
    await db.issueLabel.create({ data: { issueId: issue.id, labelId } });
  }
  revalidateProject(projectKey);
}

export async function addCommentAction(
  projectKey: string,
  issueKey: string,
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const user = await requireUser();
  const { project } = await requireProjectAccess(projectKey);

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Kommentar darf nicht leer sein." };

  const issue = await db.issue.findUniqueOrThrow({
    where: { key: issueKey, projectId: project.id },
    select: { id: true },
  });
  await db.comment.create({
    data: { issueId: issue.id, authorId: user.id, body },
  });
  revalidateProject(projectKey);
}
