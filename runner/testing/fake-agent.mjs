#!/usr/bin/env node
/**
 * Test-Agent für den Runner: simuliert einen Agenten, der mitten in der Arbeit an sein Nutzungslimit
 * stößt und später (oder als anderer Agent) am Zwischenstand weitermacht.
 *
 * Lauf 1 (kein Zwischenstand): Schritt 1 erledigen → Checkpoint → Limit-Meldung → Exit 1
 * Lauf 2 (Zwischenstand da):   Schritt 2 erledigen → zur Prüfung übergeben
 *
 * FAKE_MODE=crash: Prozess bricht immer ohne Abschluss ab (testet die Versuchs-Obergrenze).
 * FAKE_MODE=auth:  Agent ist bei seinem Anbieter nicht angemeldet.
 */
import { appendFileSync } from "node:fs";

const { TICKRA_URL, TICKRA_API_KEY, TICKRA_ISSUE, FAKE_MODE, FAKE_LIMIT_SECONDS } = process.env;

async function api(method, path, body) {
  const response = await fetch(`${TICKRA_URL}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${TICKRA_API_KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${data.error}`);
  return data;
}

if (FAKE_MODE === "auth") {
  // So meldet Claude Code eine abgelaufene Anmeldung (stream-json)
  console.log(
    JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: true,
      result: "Failed to authenticate: OAuth session expired and could not be refreshed",
    })
  );
  process.exit(1);
}

if (FAKE_MODE === "crash") {
  console.error("Segmentation fault (simuliert)");
  process.exit(139);
}

const me = (await api("GET", "/me")).user;
const issue = await api("GET", `/issues/${TICKRA_ISSUE}`);
const progress = issue.checkpoints.filter((checkpoint) => checkpoint.kind === "PROGRESS");

// "Arbeit" im Projektordner hinterlassen – zeigt, dass der Stand über Läufe hinweg erhalten bleibt
appendFileSync("arbeit.log", `${me.name}: Lauf ${progress.length + 1} an ${TICKRA_ISSUE}\n`);

if (progress.length === 0) {
  await api("PATCH", `/issues/${TICKRA_ISSUE}/checklist`, { item: 1, done: true });
  await api("POST", `/issues/${TICKRA_ISSUE}/checkpoints`, {
    summary: `Schritt 1 erledigt (von ${me.name}).`,
    nextSteps: "Schritt 2 umsetzen, dann zur Prüfung übergeben.",
  });
  const reset = Math.floor(Date.now() / 1000) + Number(FAKE_LIMIT_SECONDS ?? 3600);
  console.error(`Claude AI usage limit reached|${reset}`);
  process.exit(1);
}

await api("PATCH", `/issues/${TICKRA_ISSUE}/checklist`, { item: 2, done: true });
await api("POST", `/issues/${TICKRA_ISSUE}/review`, {
  summary: `Schritt 2 erledigt (von ${me.name}). Aufgesetzt auf: "${progress[0].summary}"`,
});
