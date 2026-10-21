import { z } from "zod";
import { db } from "@/lib/db";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, ISSUE_TYPES } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { logActivity, type ActivityChange } from "@/lib/services/activity";
import {
  fail,
  ok,
  revalidateProject,
  type ServiceContext,
  type ServiceResult,
} from "@/lib/services/context";

// ---------------------------------------------------------------------------
// Eingaben
// ---------------------------------------------------------------------------

const dueDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Datum im Format JJJJ-MM-TT angeben.")
  .nullable()
  .transform((value) => (value ? new Date(`${value}T00:00:00`) : null));

const issueFieldsSchema = z.object({
  title: z.string().trim().min(1, "Titel fehlt.").max(200, "Titel ist zu lang (max. 200 Zeichen)."),
  description: z.string().max(10000).nullable(),
  status: z.enum(ISSUE_STATUSES),
  priority: z.enum(ISSUE_PRIORITIES),
  type: z.enum(ISSUE_TYPES),
  // "me", User-ID, E-Mail oder Name eines Mitglieds – null = niemand
  assignee: z.string().trim().min(1).nullable(),
  // "active", "backlog"/null, Sprint-ID oder Sprint-Name
  sprint: z.string().trim().min(1).nullable(),
  storyPoints: z.number().int().min(0).max(100).nullable(),
  dueDate: dueDateSchema,
  // Label-Namen; ersetzt die bisherigen Labels
  labels: z.array(z.string().trim().min(1)).max(20),
});

export const createIssueSchema = issueFieldsSchema.partial().required({ title: true });
export const updateIssueSchema = issueFieldsSchema.partial();

export type CreateIssueInput = z.input<typeof createIssueSchema>;
export type UpdateIssueInput = z.input<typeof updateIssueSchema>;

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

// ---------------------------------------------------------------------------
// Referenzen auflösen (Assignee, Sprint, Labels) – immer innerhalb des Projekts
// ---------------------------------------------------------------------------

function resolveAssignee(ctx: ServiceContext, value: string | null): ServiceResult<string | null> {
  if (value === null || value.toLowerCase() === "none") return ok(null);
  if (value.toLowerCase() === "me") return ok(ctx.user.id);
  const needle = value.toLowerCase();
  const member = ctx.project.members.find(
    (m) =>
      m.user.id === value ||
      m.user.email.toLowerCase() === needle ||
      m.user.name.toLowerCase() === needle
  );
  if (!member) return fail(`"${value}" ist kein Mitglied dieses Projekts.`);
  return ok(member.user.id);
}

async function resolveSprint(ctx: ServiceContext, value: string | null): Promise<ServiceResult<string | null>> {
  if (value === null || value.toLowerCase() === "backlog") return ok(null);
  const sprints = await db.sprint.findMany({
    where: { projectId: ctx.project.id },
    select: { id: true, name: true, status: true },
  });
  const sprint =
    value.toLowerCase() === "active"
      ? sprints.find((s) => s.status === "ACTIVE")
      : sprints.find((s) => s.id === value || s.name.toLowerCase() === value.toLowerCase());
  if (!sprint) {
    return fail(value.toLowerCase() === "active" ? "Es läuft gerade kein Sprint." : `Sprint "${value}" nicht gefunden.`, 404);
  }
  if (sprint.status === "COMPLETED") return fail("Abgeschlossene Sprints können keine Tickets aufnehmen.");
  return ok(sprint.id);
}

function resolveLabels(ctx: ServiceContext, names: string[]): ServiceResult<string[]> {
  const ids: string[] = [];
  for (const name of names) {
    const label = ctx.project.labels.find((l) => l.name.toLowerCase() === name.toLowerCase() || l.id === name);
    if (!label) {
      const available = ctx.project.labels.map((l) => l.name).join(", ") || "keine";
      return fail(`Label "${name}" existiert nicht (vorhanden: ${available}).`);
    }
    ids.push(label.id);
  }
  return ok([...new Set(ids)]);
}

type ResolvedFields = {
  title?: string;
  description?: string | null;
  status?: string;
  priority?: string;
  type?: string;
  assigneeId?: string | null;
  sprintId?: string | null;
  storyPoints?: number | null;
  dueDate?: Date | null;
  labelIds?: string[];
};

async function resolveFields(
  ctx: ServiceContext,
  data: z.output<typeof updateIssueSchema>
): Promise<ServiceResult<ResolvedFields>> {
  const { assignee, sprint, labels, ...rest } = data;
  const fields: ResolvedFields = { ...rest };

  if (assignee !== undefined) {
    const result = resolveAssignee(ctx, assignee);
    if (!result.ok) return result;
    fields.assigneeId = result.data;
  }
  if (sprint !== undefined) {
    const result = await resolveSprint(ctx, sprint);
    if (!result.ok) return result;
    fields.sprintId = result.data;
  }
  if (labels !== undefined) {
    const result = resolveLabels(ctx, labels);
    if (!result.ok) return result;
    fields.labelIds = result.data;
  }
  return ok(fields);
}

// ---------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------

export const issueInclude = {
  assignee: { select: { id: true, name: true, email: true, avatarColor: true, kind: true } },
  reporter: { select: { id: true, name: true, email: true, avatarColor: true, kind: true } },
  sprint: { select: { id: true, name: true, status: true } },
  labels: { include: { label: { select: { id: true, name: true, color: true } } } },
} as const;

type IssueRecord = NonNullable<Awaited<ReturnType<typeof findIssue>>>;

function findIssue(ctx: ServiceContext, issueKey: string) {
  return db.issue.findUnique({
    where: { key: issueKey.toUpperCase(), projectId: ctx.project.id },
    include: issueInclude,
  });
}

/** Einheitliche Darstellung für API und MCP. */
export function serializeIssue(issue: IssueRecord) {
  const person = (user: IssueRecord["reporter"] | null) =>
    user ? { id: user.id, name: user.name, email: user.email, kind: user.kind } : null;
  return {
    key: issue.key,
    title: issue.title,
    description: issue.description,
    type: issue.type,
    status: issue.status,
    priority: issue.priority,
    storyPoints: issue.storyPoints,
    dueDate: issue.dueDate ? toDateInput(issue.dueDate) : null,
    assignee: person(issue.assignee),
    reporter: person(issue.reporter),
    sprint: issue.sprint,
    labels: issue.labels.map((entry) => entry.label.name),
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
  };
}

export type ApiIssue = ReturnType<typeof serializeIssue>;

export const listIssuesSchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  // "open" = alles außer DONE
  state: z.enum(["open", "all"]).optional(),
  assignee: z.string().trim().min(1).optional(),
  sprint: z.string().trim().min(1).optional(),
  type: z.enum(ISSUE_TYPES).optional(),
  query: z.string().trim().max(100).optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

export async function listIssues(
  ctx: ServiceContext,
  filters: z.input<typeof listIssuesSchema>
): Promise<ServiceResult<ApiIssue[]>> {
  const parsed = listIssuesSchema.safeParse(filters);
  if (!parsed.success) return fail(firstError(parsed.error));
  const f = parsed.data;

  let assigneeId: string | null | undefined;
  if (f.assignee !== undefined) {
    if (f.assignee.toLowerCase() === "unassigned") assigneeId = null;
    else {
      const result = resolveAssignee(ctx, f.assignee);
      if (!result.ok) return result;
      assigneeId = result.data;
    }
  }

  let sprintId: string | null | undefined;
  if (f.sprint !== undefined) {
    if (f.sprint.toLowerCase() === "backlog") sprintId = null;
    else {
      const sprint = await db.sprint.findFirst({
        where: {
          projectId: ctx.project.id,
          ...(f.sprint.toLowerCase() === "active"
            ? { status: "ACTIVE" }
            : { OR: [{ id: f.sprint }, { name: f.sprint }] }),
        },
        select: { id: true },
      });
      if (!sprint) return ok([]);
      sprintId = sprint.id;
    }
  }

  const issues = await db.issue.findMany({
    where: {
      projectId: ctx.project.id,
      ...(f.status ? { status: f.status } : f.state === "all" ? {} : f.state === "open" ? { status: { not: "DONE" } } : {}),
      ...(assigneeId !== undefined ? { assigneeId } : {}),
      ...(sprintId !== undefined ? { sprintId } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.query
        ? {
            OR: [
              { title: { contains: f.query } },
              { description: { contains: f.query } },
              { key: { contains: f.query.toUpperCase() } },
            ],
          }
        : {}),
    },
    include: issueInclude,
    orderBy: [{ order: "asc" }],
    take: f.limit ?? 50,
  });
  return ok(issues.map(serializeIssue));
}

export async function getIssue(ctx: ServiceContext, issueKey: string) {
  const issue = await db.issue.findUnique({
    where: { key: issueKey.toUpperCase(), projectId: ctx.project.id },
    include: {
      ...issueInclude,
      comments: {
        include: { author: { select: { id: true, name: true, kind: true } } },
        orderBy: { createdAt: "asc" },
      },
      activities: {
        include: { actor: { select: { id: true, name: true, kind: true } } },
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
  if (!issue) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);
  return ok({
    ...serializeIssue(issue),
    comments: issue.comments.map((comment) => ({
      id: comment.id,
      author: comment.author,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      edited: comment.editedAt !== null,
    })),
    activity: issue.activities.map((entry) => ({
      action: entry.action,
      actor: entry.actor,
      via: entry.via,
      details: entry.details ? JSON.parse(entry.details) : null,
      createdAt: entry.createdAt.toISOString(),
    })),
  });
}

// ---------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------

async function nextOrder(projectId: string) {
  const max = await db.issue.aggregate({ where: { projectId }, _max: { order: true } });
  return (max._max.order ?? 0) + 1;
}

export async function createIssue(
  ctx: ServiceContext,
  input: unknown
): Promise<ServiceResult<ApiIssue>> {
  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const resolved = await resolveFields(ctx, parsed.data);
  if (!resolved.ok) return resolved;
  const { labelIds, ...fields } = resolved.data;
  const order = await nextOrder(ctx.project.id);

  const issue = await db.$transaction(async (tx) => {
    const updated = await tx.project.update({
      where: { id: ctx.project.id },
      data: { issueCounter: { increment: 1 } },
    });
    const created = await tx.issue.create({
      data: {
        ...fields,
        title: fields.title!,
        key: `${ctx.project.key}-${updated.issueCounter}`,
        order,
        projectId: ctx.project.id,
        reporterId: ctx.user.id,
        labels: labelIds?.length ? { create: labelIds.map((labelId) => ({ labelId })) } : undefined,
      },
      include: issueInclude,
    });
    await logActivity(ctx, { action: "issue.created", issue: created, details: { title: created.title } }, tx);
    return created;
  });

  revalidateProject(ctx.project.key);
  return ok(serializeIssue(issue));
}

const TRACKED_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "type",
  "assigneeId",
  "sprintId",
  "storyPoints",
  "dueDate",
] as const;

function displayValue(field: string, value: unknown, ctx: ServiceContext, sprintNames: Map<string, string>) {
  if (value === null || value === undefined) return null;
  if (field === "assigneeId") return ctx.project.members.find((m) => m.userId === value)?.user.name ?? value;
  if (field === "sprintId") return sprintNames.get(String(value)) ?? value;
  if (value instanceof Date) return toDateInput(value);
  if (field === "description") return String(value).length > 80 ? `${String(value).slice(0, 80)}…` : value;
  return value;
}

export async function updateIssue(
  ctx: ServiceContext,
  issueKey: string,
  input: unknown
): Promise<ServiceResult<ApiIssue>> {
  const parsed = updateIssueSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));

  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);

  const resolved = await resolveFields(ctx, parsed.data);
  if (!resolved.ok) return resolved;
  const { labelIds, ...fields } = resolved.data;

  // Nur echte Änderungen speichern und protokollieren
  const changes: ActivityChange[] = [];
  const data: Record<string, unknown> = {};
  const sprintNames = new Map(
    (await db.sprint.findMany({ where: { projectId: ctx.project.id }, select: { id: true, name: true } })).map(
      (s) => [s.id, s.name]
    )
  );
  for (const field of TRACKED_FIELDS) {
    if (!(field in fields)) continue;
    const next = fields[field as keyof typeof fields];
    const prev = existing[field as keyof typeof existing];
    const same =
      prev instanceof Date || next instanceof Date
        ? (prev as Date | null)?.getTime() === (next as Date | null)?.getTime()
        : prev === next;
    if (same) continue;
    data[field] = next;
    changes.push({
      field: field.replace(/Id$/, ""),
      from: displayValue(field, prev, ctx, sprintNames),
      to: displayValue(field, next, ctx, sprintNames),
    });
  }
  // In anderen Sprint/Backlog verschoben → ans Ende der Liste
  if ("sprintId" in data) data.order = await nextOrder(ctx.project.id);

  const prevLabelIds = existing.labels.map((entry) => entry.label.id);
  const labelsChanged =
    labelIds !== undefined &&
    (labelIds.length !== prevLabelIds.length || labelIds.some((id) => !prevLabelIds.includes(id)));
  if (labelsChanged) {
    const name = (id: string) => ctx.project.labels.find((l) => l.id === id)?.name ?? id;
    changes.push({ field: "labels", from: prevLabelIds.map(name), to: labelIds.map(name) });
  }

  if (changes.length === 0) return ok(serializeIssue(existing));

  const updated = await db.$transaction(async (tx) => {
    if (labelsChanged) {
      await tx.issueLabel.deleteMany({ where: { issueId: existing.id } });
      await tx.issueLabel.createMany({ data: labelIds.map((labelId) => ({ issueId: existing.id, labelId })) });
    }
    const issue = await tx.issue.update({ where: { id: existing.id }, data, include: issueInclude });
    await logActivity(ctx, { action: "issue.updated", issue, details: { changes } }, tx);
    return issue;
  });

  revalidateProject(ctx.project.key);
  return ok(serializeIssue(updated));
}

/** Board-Drag&Drop: Status + Position. Nur Statuswechsel landen im Protokoll. */
export async function moveIssue(
  ctx: ServiceContext,
  issueKey: string,
  status: string,
  order: number
): Promise<ServiceResult> {
  const parsed = z
    .object({ status: z.enum(ISSUE_STATUSES), order: z.number().finite() })
    .safeParse({ status, order });
  if (!parsed.success) return fail("Ungültige Position.");

  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);

  await db.$transaction(async (tx) => {
    await tx.issue.update({ where: { id: existing.id }, data: parsed.data });
    if (existing.status !== parsed.data.status) {
      await logActivity(
        ctx,
        {
          action: "issue.updated",
          issue: existing,
          details: { changes: [{ field: "status", from: existing.status, to: parsed.data.status }] },
        },
        tx
      );
    }
  });
  revalidateProject(ctx.project.key);
  return ok(undefined);
}

export async function toggleIssueLabel(ctx: ServiceContext, issueKey: string, labelId: string): Promise<ServiceResult> {
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);
  const current = existing.labels.map((entry) => entry.label.id);
  const next = current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId];
  const result = await updateIssue(ctx, issueKey, {
    labels: next.map((id) => ctx.project.labels.find((l) => l.id === id)?.name ?? id),
  });
  return result.ok ? ok(undefined) : result;
}

export async function deleteIssue(ctx: ServiceContext, issueKey: string): Promise<ServiceResult> {
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);
  await db.$transaction(async (tx) => {
    await tx.issue.delete({ where: { id: existing.id } });
    await logActivity(ctx, { action: "issue.deleted", issue: { id: null, key: existing.key }, details: { title: existing.title } }, tx);
  });
  revalidateProject(ctx.project.key);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Kommentare
// ---------------------------------------------------------------------------

const commentSchema = z.string().trim().min(1, "Kommentar darf nicht leer sein.").max(5000);

export async function addComment(ctx: ServiceContext, issueKey: string, body: unknown) {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return fail(firstError(parsed.error));
  const issue = await findIssue(ctx, issueKey);
  if (!issue) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);

  const comment = await db.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { issueId: issue.id, authorId: ctx.user.id, body: parsed.data },
    });
    await logActivity(ctx, { action: "comment.added", issue, details: { commentId: created.id } }, tx);
    return created;
  });
  revalidateProject(ctx.project.key);
  return ok({ id: comment.id, body: comment.body, createdAt: comment.createdAt.toISOString() });
}

/** Nur der Autor darf seinen Kommentar bearbeiten. */
export async function updateComment(ctx: ServiceContext, commentId: string, body: unknown): Promise<ServiceResult> {
  const parsed = commentSchema.safeParse(body);
  if (!parsed.success) return fail(firstError(parsed.error));
  const result = await db.comment.updateMany({
    where: { id: commentId, authorId: ctx.user.id, issue: { projectId: ctx.project.id } },
    data: { body: parsed.data, editedAt: new Date() },
  });
  if (result.count === 0) return fail("Kommentar nicht gefunden.", 404);
  revalidateProject(ctx.project.key);
  return ok(undefined);
}

/** Autor oder Projekt-Admin dürfen löschen. */
export async function deleteComment(ctx: ServiceContext, commentId: string): Promise<ServiceResult> {
  const result = await db.comment.deleteMany({
    where: {
      id: commentId,
      issue: { projectId: ctx.project.id },
      ...(ctx.isAdmin ? {} : { authorId: ctx.user.id }),
    },
  });
  if (result.count === 0) return fail("Kommentar nicht gefunden.", 404);
  revalidateProject(ctx.project.key);
  return ok(undefined);
}
