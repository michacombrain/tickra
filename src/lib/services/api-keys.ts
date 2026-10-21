import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

const KEY_PREFIX = "tk_";

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

/** Neuer Key im Format tk_<8 hex>_<40 hex>. Der Klartext wird nur einmal zurückgegeben. */
export async function issueApiKey(userId: string, name: string) {
  const prefix = `${KEY_PREFIX}${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(20).toString("hex");
  const token = `${prefix}_${secret}`;
  const key = await db.apiKey.create({
    data: { userId, name, prefix, hash: sha256(token) },
  });
  return { id: key.id, prefix, token };
}

export async function revokeApiKeys(where: { userId: string; id?: string }) {
  await db.apiKey.updateMany({
    where: { ...where, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Prüft einen Bearer-Token und liefert den zugehörigen User (Mensch oder Agent). */
export async function authenticateApiKey(token: string) {
  const match = /^(tk_[0-9a-f]{8})_[0-9a-f]{40}$/.exec(token);
  if (!match) return null;

  const key = await db.apiKey.findUnique({
    where: { prefix: match[1] },
    include: { user: { select: { id: true, name: true, email: true, kind: true } } },
  });
  if (!key || key.revokedAt) return null;

  const expected = Buffer.from(key.hash, "hex");
  const actual = Buffer.from(sha256(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  // lastUsedAt höchstens einmal pro Minute schreiben
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    await db.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  }
  return key.user;
}
