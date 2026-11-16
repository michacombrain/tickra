/** Wie lange eine Reservierung ohne Lebenszeichen gilt. */
export const LEASE_MINUTES = 15;

export function leaseExpiry(from = new Date()) {
  return new Date(from.getTime() + LEASE_MINUTES * 60_000);
}

export type WorkState = "FREE" | "RUNNING" | "PAUSED" | "STALLED";

type Claimable = {
  claimedById: string | null;
  claimExpiresAt: Date | null;
  claimedBy: { id: string; name: string; kind: string; limitedUntil: Date | null } | null;
};

/**
 * FREE     – niemand arbeitet daran
 * RUNNING  – reserviert, Lebenszeichen aktuell
 * PAUSED   – reserviert, aber der Bearbeiter wartet auf sein Nutzungslimit
 * STALLED  – reserviert, aber kein Lebenszeichen mehr (Absturz, Terminal zu) → darf übernommen werden
 */
export function workState(issue: Claimable, now = new Date()) {
  if (!issue.claimedById || !issue.claimedBy) return { state: "FREE" as WorkState, by: null, until: null };
  const by = { id: issue.claimedBy.id, name: issue.claimedBy.name, kind: issue.claimedBy.kind };
  const limitedUntil = issue.claimedBy.limitedUntil;
  if (limitedUntil && limitedUntil > now) return { state: "PAUSED" as WorkState, by, until: limitedUntil };
  if (issue.claimExpiresAt && issue.claimExpiresAt > now) {
    return { state: "RUNNING" as WorkState, by, until: issue.claimExpiresAt };
  }
  return { state: "STALLED" as WorkState, by, until: issue.claimExpiresAt };
}

export const claimedBySelect = {
  select: { id: true, name: true, kind: true, limitedUntil: true },
} as const;
