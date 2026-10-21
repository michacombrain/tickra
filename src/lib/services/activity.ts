import { db } from "@/lib/db";
import type { ServiceContext } from "@/lib/services/context";

export type ActivityChange = { field: string; from: unknown; to: unknown };

type Tx = Pick<typeof db, "activity">;

export async function logActivity(
  ctx: ServiceContext,
  entry: {
    action: string;
    issue?: { id: string | null; key: string } | null;
    details?: Record<string, unknown>;
  },
  tx: Tx = db
) {
  await tx.activity.create({
    data: {
      projectId: ctx.project.id,
      issueId: entry.issue?.id ?? null,
      issueKey: entry.issue?.key ?? null,
      actorId: ctx.user.id,
      action: entry.action,
      details: entry.details ? JSON.stringify(entry.details) : null,
      via: ctx.via,
    },
  });
}

export function parseDetails(details: string | null): Record<string, unknown> {
  if (!details) return {};
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
}
