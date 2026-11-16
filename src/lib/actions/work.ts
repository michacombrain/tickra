"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ADMIN_ONLY, requireProjectAccess } from "@/lib/access";
import { logActivity } from "@/lib/services/activity";
import type { ServiceContext, ServiceResult } from "@/lib/services/context";
import * as work from "@/lib/services/work";

export type FormState = { error?: string } | undefined;

async function uiContext(projectKey: string): Promise<ServiceContext> {
  const { user, project, isAdmin } = await requireProjectAccess(projectKey);
  return { user, project, isAdmin, via: "UI" };
}

function toFormState(result: ServiceResult<unknown>): FormState {
  return result.ok ? undefined : { error: result.error };
}

export async function addChecklistItemAction(projectKey: string, issueKey: string, text: string): Promise<FormState> {
  return toFormState(await work.addChecklistItem(await uiContext(projectKey), issueKey, text));
}

export async function setChecklistItemAction(
  projectKey: string,
  issueKey: string,
  itemId: string,
  done: boolean
): Promise<FormState> {
  return toFormState(await work.setChecklistItem(await uiContext(projectKey), issueKey, itemId, done));
}

export async function deleteChecklistItemAction(
  projectKey: string,
  issueKey: string,
  itemId: string
): Promise<FormState> {
  return toFormState(await work.deleteChecklistItem(await uiContext(projectKey), issueKey, itemId));
}

/** Mensch hebt die Reservierung eines Agenten auf (Ticket bleibt, wo es ist). */
export async function clearClaimAction(projectKey: string, issueKey: string): Promise<FormState> {
  const ctx = await uiContext(projectKey);
  const issue = await db.issue.findUnique({
    where: { key: issueKey, projectId: ctx.project.id },
    select: { id: true, key: true, claimedBy: { select: { name: true } } },
  });
  if (!issue) return { error: "Ticket nicht gefunden." };
  if (!issue.claimedBy) return undefined;

  await db.issue.update({ where: { id: issue.id }, data: { claimedById: null, claimExpiresAt: null } });
  await logActivity(ctx, { action: "issue.claim_cleared", issue, details: { from: issue.claimedBy.name } });
  revalidatePath(`/projects/${projectKey}`, "layout");
}

/** Admin hebt die Limit-Pause eines Agenten vorzeitig auf. */
export async function clearAgentLimitAction(projectKey: string, agentId: string): Promise<FormState> {
  const { project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };
  if (!project.members.some((member) => member.userId === agentId && member.user.kind === "AGENT")) {
    return { error: "Agent nicht gefunden." };
  }
  await work.clearLimit(agentId);
}
