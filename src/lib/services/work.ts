import { z } from "zod";
import { db } from "@/lib/db";
import { loadProjectAccess } from "@/lib/access";
import { ISSUE_PRIORITIES } from "@/lib/constants";
import { logActivity } from "@/lib/services/activity";
import { leaseExpiry, workState } from "@/lib/services/claim";
import {
  fail,
  ok,
  revalidateProject,
  type ServiceContext,
  type ServiceResult,
} from "@/lib/services/context";
import { getIssue, issueInclude } from "@/lib/services/issues";

type Actor = { id: string; name: string; kind: string };

function firstError(error: z.ZodError) {
  const issue = error.issues[0];
  const path = issue.path.join(".");
  return path ? `${path}: ${issue.message}` : issue.message;
}

function findIssue(ctx: ServiceContext, issueKey: string) {
  return db.issue.findUnique({
    where: { key: issueKey.toUpperCase(), projectId: ctx.project.id },
    include: issueInclude,
  });
}

// ---------------------------------------------------------------------------
// Reservieren, Lebenszeichen, Freigeben
// ---------------------------------------------------------------------------

/**
 * Reserviert ein Ticket für den Aufrufer. Ein fremdes Ticket lässt sich nur übernehmen,
 * wenn dessen Bearbeiter kein Lebenszeichen mehr sendet (STALLED) oder im Limit hängt (PAUSED).
 */
export async function claimIssue(ctx: ServiceContext, issueKey: string) {
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);
  if (existing.status === "DONE") return fail(`${existing.key} ist bereits erledigt.`, 409);

  const work = workState(existing);
  const mine = work.by?.id === ctx.user.id;
  if (work.state === "RUNNING" && !mine) {
    return fail(`${existing.key} wird gerade von ${work.by?.name} bearbeitet.`, 409);
  }
  const takenOverFrom = !mine && work.by ? work.by : null;

  // Bedingtes Update: nur wenn sich die Reservierung seit dem Lesen nicht geändert hat
  const result = await db.issue.updateMany({
    where: { id: existing.id, claimedById: existing.claimedById, claimExpiresAt: existing.claimExpiresAt },
    data: {
      claimedById: ctx.user.id,
      claimExpiresAt: leaseExpiry(),
      assigneeId: ctx.user.id,
      status: "IN_PROGRESS",
    },
  });
  if (result.count === 0) return fail(`${existing.key} wurde gerade von jemand anderem übernommen.`, 409);

  if (!mine) {
    await logActivity(ctx, {
      action: takenOverFrom ? "issue.taken_over" : "issue.claimed",
      issue: existing,
      details: takenOverFrom ? { from: takenOverFrom.name, reason: work.state } : undefined,
    });
  }
  revalidateProject(ctx.project.key);

  const detail = await getIssue(ctx, existing.key);
  if (!detail.ok) return detail;
  return ok({ resumed: mine, takenOverFrom: takenOverFrom?.name ?? null, issue: detail.data });
}

/** Verlängert die Reservierung – solange Lebenszeichen kommen, übernimmt niemand das Ticket. */
export async function heartbeat(ctx: ServiceContext, issueKey: string): Promise<ServiceResult<{ leaseUntil: string }>> {
  const until = leaseExpiry();
  const result = await db.issue.updateMany({
    where: { key: issueKey.toUpperCase(), projectId: ctx.project.id, claimedById: ctx.user.id },
    data: { claimExpiresAt: until },
  });
  if (result.count === 0) return fail(`${issueKey} ist nicht (mehr) für dich reserviert.`, 409);
  return ok({ leaseUntil: until.toISOString() });
}

const checkpointSchema = z.object({
  summary: z.string().trim().min(1, "summary fehlt.").max(4000),
  nextSteps: z.string().trim().max(4000).nullish().transform((v) => v || null),
  sessionId: z.string().trim().max(200).nullish().transform((v) => v || null),
  kind: z.enum(["PROGRESS", "LIMIT", "HANDOFF", "RUNNER"]).optional(),
  branch: z.string().trim().max(200).optional(),
});

/** Zwischenstand speichern. Zählt gleichzeitig als Lebenszeichen. */
export async function saveCheckpoint(ctx: ServiceContext, issueKey: string, input: unknown) {
  const parsed = checkpointSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);

  const { branch, kind, ...data } = parsed.data;
  const isClaimant = existing.claimedById === ctx.user.id;
  const checkpoint = await db.$transaction(async (tx) => {
    const created = await tx.checkpoint.create({
      data: { ...data, kind: kind ?? "PROGRESS", issueId: existing.id, authorId: ctx.user.id },
    });
    if (isClaimant || branch) {
      await tx.issue.update({
        where: { id: existing.id },
        data: {
          ...(isClaimant ? { claimExpiresAt: leaseExpiry() } : {}),
          ...(branch ? { branch } : {}),
        },
      });
    }
    return created;
  });
  revalidateProject(ctx.project.key);
  return ok({ id: checkpoint.id, createdAt: checkpoint.createdAt.toISOString() });
}

const reviewSchema = z.object({
  summary: z.string().trim().min(1, "summary fehlt.").max(4000),
  prUrl: z.string().trim().max(500).regex(/^https?:\/\/\S+$/).optional(),
  branch: z.string().trim().max(200).optional(),
});

/** Arbeit abschließen: Ticket geht zur Prüfung an einen Menschen, die Reservierung endet. */
export async function submitForReview(ctx: ServiceContext, issueKey: string, input: unknown) {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);

  const work = workState(existing);
  if (work.state === "RUNNING" && work.by?.id !== ctx.user.id) {
    return fail(`${existing.key} wird gerade von ${work.by?.name} bearbeitet.`, 409);
  }
  const open = existing.checklist.filter((item) => !item.done);

  await db.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: existing.id },
      data: {
        status: "IN_REVIEW",
        claimedById: null,
        claimExpiresAt: null,
        ...(parsed.data.prUrl ? { prUrl: parsed.data.prUrl } : {}),
        ...(parsed.data.branch ? { branch: parsed.data.branch } : {}),
      },
    });
    await tx.checkpoint.create({
      data: { issueId: existing.id, authorId: ctx.user.id, kind: "HANDOFF", summary: parsed.data.summary },
    });
    await tx.comment.create({
      data: {
        issueId: existing.id,
        authorId: ctx.user.id,
        body: `Zur Prüfung übergeben:\n\n${parsed.data.summary}${parsed.data.prUrl ? `\n\nPR: ${parsed.data.prUrl}` : ""}`,
      },
    });
    await logActivity(
      ctx,
      {
        action: "issue.updated",
        issue: existing,
        details: { changes: [{ field: "status", from: existing.status, to: "IN_REVIEW" }] },
      },
      tx
    );
  });
  revalidateProject(ctx.project.key);
  return ok({
    key: existing.key,
    status: "IN_REVIEW",
    openChecklistItems: open.map((item) => item.text),
  });
}

const releaseSchema = z.object({
  reason: z.string().trim().min(1, "reason fehlt.").max(2000),
  // true = Agenten sollen es nicht erneut versuchen (z.B. unklare Anforderung)
  needsHuman: z.boolean().optional(),
});

/** Ticket zurückgeben, ohne es abzuschließen. */
export async function releaseIssue(ctx: ServiceContext, issueKey: string, input: unknown) {
  const parsed = releaseSchema.safeParse(input);
  if (!parsed.success) return fail(firstError(parsed.error));
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);
  if (existing.claimedById !== ctx.user.id && ctx.user.kind === "AGENT") {
    return fail(`${existing.key} ist nicht für dich reserviert.`, 409);
  }

  await db.$transaction(async (tx) => {
    await tx.issue.update({
      where: { id: existing.id },
      data: {
        status: "TODO",
        assigneeId: null,
        claimedById: null,
        claimExpiresAt: null,
        ...(parsed.data.needsHuman ? { agentReady: false } : {}),
      },
    });
    await tx.checkpoint.create({
      data: {
        issueId: existing.id,
        authorId: ctx.user.id,
        kind: "HANDOFF",
        summary: `Zurückgegeben: ${parsed.data.reason}`,
      },
    });
    await logActivity(
      ctx,
      { action: "issue.released", issue: existing, details: { reason: parsed.data.reason, needsHuman: !!parsed.data.needsHuman } },
      tx
    );
  });
  revalidateProject(ctx.project.key);
  return ok({ key: existing.key, status: "TODO" });
}

// ---------------------------------------------------------------------------
// Akzeptanzkriterien
// ---------------------------------------------------------------------------

export async function addChecklistItem(ctx: ServiceContext, issueKey: string, text: unknown) {
  const parsed = z.string().trim().min(1, "Text fehlt.").max(300).safeParse(text);
  if (!parsed.success) return fail(firstError(parsed.error));
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);
  if (existing.checklist.length >= 30) return fail("Maximal 30 Kriterien pro Ticket.");

  const item = await db.checklistItem.create({
    data: { issueId: existing.id, text: parsed.data, order: (existing.checklist.at(-1)?.order ?? -1) + 1 },
  });
  revalidateProject(ctx.project.key);
  return ok({ id: item.id, text: item.text, done: item.done });
}

/** item = ID, 1-basierte Position oder exakter Text. */
export async function setChecklistItem(ctx: ServiceContext, issueKey: string, item: string | number, done: boolean) {
  const existing = await findIssue(ctx, issueKey);
  if (!existing) return fail(`Ticket ${issueKey} nicht gefunden.`, 404);
  const needle = String(item).trim();
  const target =
    existing.checklist.find((entry) => entry.id === needle) ??
    (/^\d+$/.test(needle) ? existing.checklist[Number(needle) - 1] : undefined) ??
    existing.checklist.find((entry) => entry.text.toLowerCase() === needle.toLowerCase());
  if (!target) return fail(`Kriterium "${needle}" nicht gefunden.`, 404);

  if (target.done !== done) {
    await db.checklistItem.update({ where: { id: target.id }, data: { done } });
    await logActivity(ctx, {
      action: "checklist.updated",
      issue: existing,
      details: { text: target.text, done },
    });
    revalidateProject(ctx.project.key);
  }
  return ok(
    existing.checklist.map((entry) => ({
      id: entry.id,
      text: entry.text,
      done: entry.id === target.id ? done : entry.done,
    }))
  );
}

export async function deleteChecklistItem(ctx: ServiceContext, issueKey: string, itemId: string): Promise<ServiceResult> {
  const result = await db.checklistItem.deleteMany({
    where: { id: itemId, issue: { key: issueKey.toUpperCase(), projectId: ctx.project.id } },
  });
  if (result.count === 0) return fail("Kriterium nicht gefunden.", 404);
  revalidateProject(ctx.project.key);
  return ok(undefined);
}

// ---------------------------------------------------------------------------
// Nutzungslimits
// ---------------------------------------------------------------------------

const MAX_LIMIT_DAYS = 8;

const limitSchema = z.object({
  // ISO-Zeitpunkt, an dem das Limit zurückgesetzt wird …
  resetAt: z.string().optional(),
  // … oder Minuten ab jetzt
  resetInMinutes: z.number().positive().max(MAX_LIMIT_DAYS * 24 * 60).optional(),
  note: z.string().trim().max(300).optional(),
  // Session des Agenten-Tools, um später exakt dort weiterzumachen
  sessionId: z.string().trim().max(200).optional(),
});

/**
 * Agent meldet: Nutzungslimit erreicht. Seine reservierten Tickets bleiben erhalten und gelten
 * als "pausiert" – bis zum Reset oder bis ein anderer Agent sie übernimmt.
 */
export async function reportLimit(user: Actor, input: unknown) {
  const parsed = limitSchema.safeParse(input ?? {});
  if (!parsed.success) return fail(firstError(parsed.error));
  const now = Date.now();
  let until: Date;
  if (parsed.data.resetAt) {
    until = new Date(parsed.data.resetAt);
    if (Number.isNaN(until.getTime())) return fail("resetAt ist kein gültiger Zeitpunkt (ISO 8601).");
  } else {
    until = new Date(now + (parsed.data.resetInMinutes ?? 60) * 60_000);
  }
  if (until.getTime() <= now) return fail("resetAt muss in der Zukunft liegen.");
  if (until.getTime() > now + MAX_LIMIT_DAYS * 24 * 3600_000) {
    return fail(`resetAt darf höchstens ${MAX_LIMIT_DAYS} Tage in der Zukunft liegen.`);
  }

  const claimed = await db.issue.findMany({
    where: { claimedById: user.id },
    select: { id: true, key: true, projectId: true, project: { select: { key: true } } },
  });
  const when = until.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

  await db.$transaction([
    db.user.update({
      where: { id: user.id },
      data: { limitedUntil: until, limitNote: parsed.data.note ?? null },
    }),
    ...claimed.flatMap((issue) => [
      db.checkpoint.create({
        data: {
          issueId: issue.id,
          authorId: user.id,
          kind: "LIMIT",
          summary: `Nutzungslimit erreicht – pausiert bis ${when}.${parsed.data.note ? ` ${parsed.data.note}` : ""}`,
          sessionId: parsed.data.sessionId ?? null,
        },
      }),
      db.activity.create({
        data: {
          projectId: issue.projectId,
          issueId: issue.id,
          issueKey: issue.key,
          actorId: user.id,
          action: "agent.limited",
          details: JSON.stringify({ until: until.toISOString() }),
          via: "API",
        },
      }),
    ]),
  ]);
  for (const key of new Set(claimed.map((issue) => issue.project.key))) revalidateProject(key);
  return ok({ limitedUntil: until.toISOString(), pausedIssues: claimed.map((issue) => issue.key) });
}

export async function clearLimit(userId: string) {
  await db.user.update({ where: { id: userId }, data: { limitedUntil: null, limitNote: null } });
  const projects = await db.project.findMany({
    where: { members: { some: { userId } } },
    select: { key: true },
  });
  for (const project of projects) revalidateProject(project.key);
  return ok({ limitedUntil: null });
}

// ---------------------------------------------------------------------------
// Automatische Verteilung
// ---------------------------------------------------------------------------

const nextSchema = z.object({
  // Pausierte Tickets anderer Agenten (Limit) übernehmen statt warten lassen
  takeover: z.boolean().optional(),
  // Auf bestimmte Projekte einschränken
  projects: z.array(z.string()).max(50).optional(),
});

const priorityRank = (priority: string) => {
  const index = (ISSUE_PRIORITIES as readonly string[]).indexOf(priority);
  return index === -1 ? ISSUE_PRIORITIES.length : index;
};

/**
 * Liefert die nächste Aufgabe für den Aufrufer und reserviert sie:
 *  1. eigene angefangene Tickets (fortsetzen)
 *  2. verwaiste Tickets anderer (kein Lebenszeichen) – und bei takeover auch wegen Limit pausierte
 *  3. freigegebene To-Do-Tickets: aktiver Sprint zuerst, dann nach Priorität
 */
export async function nextTask(user: Actor, input: unknown, via: ServiceContext["via"]) {
  const parsed = nextSchema.safeParse(input ?? {});
  if (!parsed.success) return fail(firstError(parsed.error));
  const now = new Date();

  const me = await db.user.findUnique({ where: { id: user.id }, select: { limitedUntil: true, limitNote: true } });
  if (me?.limitedUntil && me.limitedUntil > now) {
    return ok({
      task: null,
      wait: { until: me.limitedUntil.toISOString(), reason: me.limitNote ?? "Nutzungslimit erreicht" },
    });
  }
  if (me?.limitedUntil) await db.user.update({ where: { id: user.id }, data: { limitedUntil: null, limitNote: null } });

  const projectFilter = parsed.data.projects?.map((key) => key.toUpperCase());
  const candidates = await db.issue.findMany({
    where: {
      project: {
        members: { some: { userId: user.id } },
        ...(projectFilter ? { key: { in: projectFilter } } : {}),
      },
      status: { in: ["TODO", "IN_PROGRESS"] },
      OR: [
        { claimedById: user.id },
        { agentReady: true, claimedById: { not: null } },
        { agentReady: true, claimedById: null, OR: [{ assigneeId: null }, { assigneeId: user.id }] },
      ],
    },
    include: { ...issueInclude, project: { select: { key: true } } },
  });

  const ranked = candidates
    .map((issue) => {
      const work = workState(issue, now);
      let tier: number;
      if (work.by?.id === user.id) tier = 0;
      else if (work.state === "STALLED") tier = 1;
      else if (work.state === "PAUSED") tier = parsed.data.takeover ? 1 : -1;
      else if (work.state === "RUNNING") tier = -1;
      else tier = issue.status === "IN_PROGRESS" ? (issue.assigneeId === user.id ? 0 : -1) : 2;
      return { issue, tier };
    })
    .filter((entry) => entry.tier >= 0)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        Number(b.issue.sprint?.status === "ACTIVE") - Number(a.issue.sprint?.status === "ACTIVE") ||
        priorityRank(a.issue.priority) - priorityRank(b.issue.priority) ||
        a.issue.order - b.issue.order
    );

  for (const { issue } of ranked) {
    const access = await loadProjectAccess(user.id, issue.project.key);
    if (!access) continue;
    const ctx: ServiceContext = { user, project: access.project, isAdmin: access.isAdmin, via };
    const claimed = await claimIssue(ctx, issue.key);
    // 409 = jemand war schneller → nächsten Kandidaten versuchen
    if (claimed.ok) return ok({ task: claimed.data.issue, resumed: claimed.data.resumed, takenOverFrom: claimed.data.takenOverFrom });
  }

  // Nichts zu tun – gibt es pausierte Arbeit, auf die sich Warten lohnt?
  const paused = candidates.filter((issue) => workState(issue, now).state === "PAUSED").length;
  return ok({ task: null, pausedByOthers: paused });
}

/** Überblick für Dashboard und Runner. */
export async function agentStatus(user: Actor) {
  const [me, claimed] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { limitedUntil: true, limitNote: true } }),
    db.issue.findMany({
      where: { claimedById: user.id },
      select: { key: true, title: true, status: true, claimExpiresAt: true },
    }),
  ]);
  const limited = me?.limitedUntil && me.limitedUntil > new Date();
  return ok({
    user,
    limitedUntil: limited ? me!.limitedUntil!.toISOString() : null,
    limitNote: limited ? me!.limitNote : null,
    claimed: claimed.map((issue) => ({
      key: issue.key,
      title: issue.title,
      status: issue.status,
      leaseUntil: issue.claimExpiresAt?.toISOString() ?? null,
    })),
  });
}
