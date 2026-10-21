"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { ADMIN_ONLY, requireProjectAccess } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { logActivity } from "@/lib/services/activity";
import { issueApiKey, revokeApiKeys } from "@/lib/services/api-keys";

export type KeyResult = { error?: string; token?: string };

const AGENT_COLOR = "#525252";
const nameSchema = z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben.").max(40);

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "agent";
}

/** Legt einen KI-Agenten als Projektmitglied an und gibt seinen API-Key (einmalig) zurück. */
export async function createAgentAction(projectKey: string, name: string): Promise<KeyResult> {
  const { user, project, isAdmin } = await requireProjectAccess(projectKey);
  if (!isAdmin) return { error: ADMIN_ONLY };
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const agent = await db.user.create({
    data: {
      name: parsed.data,
      email: `${slug(parsed.data)}-${randomBytes(3).toString("hex")}@agents.tickra.local`,
      // Agents haben kein nutzbares Passwort – Login nur per API-Key
      passwordHash: "!",
      kind: "AGENT",
      avatarColor: AGENT_COLOR,
      createdById: user.id,
      memberships: { create: { projectId: project.id, role: "MEMBER" } },
    },
  });
  const key = await issueApiKey(agent.id, `Agent-Key (${project.key})`);
  await logActivity(
    { user, project, isAdmin, via: "UI" },
    { action: "agent.created", details: { agentId: agent.id, name: agent.name } }
  );
  revalidatePath(`/projects/${projectKey}`, "layout");
  return { token: key.token };
}

async function requireAgentInProject(projectKey: string, agentId: string) {
  const access = await requireProjectAccess(projectKey);
  const member = access.project.members.find((m) => m.userId === agentId && m.user.kind === "AGENT");
  return { ...access, member };
}

export async function regenerateAgentKeyAction(projectKey: string, agentId: string): Promise<KeyResult> {
  const { project, isAdmin, member } = await requireAgentInProject(projectKey, agentId);
  if (!isAdmin) return { error: ADMIN_ONLY };
  if (!member) return { error: "Agent nicht gefunden." };

  await revokeApiKeys({ userId: agentId });
  const key = await issueApiKey(agentId, `Agent-Key (${project.key})`);
  revalidatePath(`/projects/${projectKey}`, "layout");
  return { token: key.token };
}

/** Entfernt den Agenten aus dem Projekt und sperrt seine Keys. Seine Historie bleibt erhalten. */
export async function removeAgentAction(projectKey: string, agentId: string): Promise<KeyResult> {
  const { user, project, isAdmin, member } = await requireAgentInProject(projectKey, agentId);
  if (!isAdmin) return { error: ADMIN_ONLY };
  if (!member) return { error: "Agent nicht gefunden." };

  await db.$transaction([
    db.issue.updateMany({ where: { projectId: project.id, assigneeId: agentId }, data: { assigneeId: null } }),
    db.projectMember.delete({ where: { projectId_userId: { projectId: project.id, userId: agentId } } }),
  ]);
  // Ohne weitere Projekte ist der Agent nutzlos → Keys sperren
  const remaining = await db.projectMember.count({ where: { userId: agentId } });
  if (remaining === 0) await revokeApiKeys({ userId: agentId });

  await logActivity(
    { user, project, isAdmin, via: "UI" },
    { action: "agent.removed", details: { agentId, name: member.user.name } }
  );
  revalidatePath(`/projects/${projectKey}`, "layout");
  return {};
}

// --- Persönliche API-Keys (für MCP/API im eigenen Namen) --------------------

export async function createPersonalKeyAction(name: string): Promise<KeyResult> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const active = await db.apiKey.count({ where: { userId: user.id, revokedAt: null } });
  if (active >= 10) return { error: "Maximal 10 aktive Keys." };

  const key = await issueApiKey(user.id, parsed.data);
  revalidatePath("/account");
  return { token: key.token };
}

export async function revokePersonalKeyAction(keyId: string): Promise<KeyResult> {
  const user = await requireUser();
  await revokeApiKeys({ userId: user.id, id: keyId });
  revalidatePath("/account");
  return {};
}
