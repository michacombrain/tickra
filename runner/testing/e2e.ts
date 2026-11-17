/**
 * End-to-End-Test für Runner + API. Startet Tickra (Production-Build) mit einer Wegwerf-Datenbank
 * und spielt die Kernfälle durch. Aufruf: npm run test:e2e
 */
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../../src/generated/prisma/client";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = 3187;
const URL = `http://localhost:${PORT}`;
const tmp = mkdtempSync(join(tmpdir(), "tickra-e2e-"));
const dbUrl = `file:${join(tmp, "e2e.db")}`;
const repo = join(tmp, "repo");
const fakeAgent = join(ROOT, "runner/testing/fake-agent.mjs");
const env = { ...process.env, DATABASE_URL: dbUrl, AUTH_SECRET: "e2e-secret", AUTH_TRUST_HOST: "true" };

const processes: ChildProcess[] = [];
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ✓ ${name}`);
}

async function waitFor<T>(what: string, fn: () => Promise<T | false | null | undefined>, timeoutMs = 60_000): Promise<T> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn().catch(() => null);
    if (value) return value;
    await sleep(500);
  }
  throw new Error(`Timeout: ${what}`);
}

function newKey() {
  const prefix = `tk_${randomBytes(4).toString("hex")}`;
  const token = `${prefix}_${randomBytes(20).toString("hex")}`;
  return { prefix, token, hash: createHash("sha256").update(token).digest("hex") };
}

function apiFor(token: string) {
  return async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${URL}/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, data: (await response.json()) as any };
  };
}

/** Startet den Runner mit einer Konfiguration und liefert Prozess + gesammelte Ausgabe. */
function startRunner(name: string, config: object) {
  const configPath = join(tmp, `${name}.config.json`);
  writeFileSync(configPath, JSON.stringify(config));
  const child = spawn("npx", ["tsx", "runner/index.ts", "--config", configPath], { cwd: ROOT, env, detached: true });
  processes.push(child);
  const output: string[] = [];
  child.stdout.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk: Buffer) => output.push(chunk.toString()));
  return {
    output,
    stop: async () => {
      child.kill("SIGINT");
      await new Promise((done) => child.on("close", done));
    },
  };
}

async function main() {
  // --- Aufbau ---------------------------------------------------------------
  console.log("Aufbau: Datenbank, Git-Repo, Server …");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: ROOT, env, stdio: "pipe" });
  execFileSync("git", ["init", "-q", "-b", "main", repo]);
  writeFileSync(join(repo, "README.md"), "# Testprojekt\n");
  execFileSync("git", ["-C", repo, "add", "."]);
  execFileSync("git", ["-C", repo, "-c", "user.name=e2e", "-c", "user.email=e2e@test.local", "commit", "-qm", "init"]);

  const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: dbUrl }) });
  const human = await prisma.user.create({ data: { name: "Mensch", email: "mensch@test.local", passwordHash: "!" } });
  const keys = { human: newKey(), a: newKey(), b: newKey() };
  const makeAgent = (name: string, key: ReturnType<typeof newKey>) =>
    prisma.user.create({
      data: {
        name,
        email: `${name.toLowerCase().replace(/\s/g, "-")}@agents.tickra.local`,
        passwordHash: "!",
        kind: "AGENT",
        apiKeys: { create: { name: "e2e", prefix: key.prefix, hash: key.hash } },
      },
    });
  const agentA = await makeAgent("Agent A", keys.a);
  const agentB = await makeAgent("Agent B", keys.b);
  await prisma.apiKey.create({ data: { userId: human.id, name: "e2e", prefix: keys.human.prefix, hash: keys.human.hash } });
  const project = await prisma.project.create({
    data: {
      key: "E2E",
      name: "End-to-End",
      ownerId: human.id,
      members: {
        create: [
          { userId: human.id, role: "ADMIN" },
          { userId: agentA.id },
          { userId: agentB.id },
        ],
      },
    },
  });

  // Läuft auf dem Port noch etwas (z.B. Rest eines abgebrochenen Laufs), würden wir gegen die falsche DB testen
  const occupied = await fetch(URL).then(
    () => true,
    () => false
  );
  assert.equal(occupied, false, `Port ${PORT} ist belegt – alten Prozess beenden.`);
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: "pipe", detached: true });
  processes.push(server);
  await waitFor("Server-Start", async () => (await fetch(`${URL}/api/v1/me`)).status === 401);

  const asHuman = apiFor(keys.human.token);
  const asA = apiFor(keys.a.token);
  const asB = apiFor(keys.b.token);
  const agentConfig = (name: string, token: string, extraEnv: Record<string, string> = {}) => ({
    name,
    apiKey: token,
    type: "custom",
    command: "node",
    args: [fakeAgent],
    env: extraEnv,
  });
  const base = { url: URL, pollSeconds: 1, projects: { E2E: { path: repo } } };
  const newIssue = async (title: string) => {
    const created = await asHuman("POST", "/projects/E2E/issues", {
      title,
      agentReady: true,
      checklist: ["Schritt 1", "Schritt 2"],
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    return created.data.key as string;
  };
  const worktreeLog = (key: string) => join(tmp, ".tickra-worktrees", `repo-${key}`, "arbeit.log");

  // --- 1: Limit → warten → derselbe Agent macht weiter ----------------------
  console.log("\n1) Limit erreicht → warten → derselbe Agent setzt fort");
  const first = await newIssue("Warten auf Reset");
  let runner = startRunner("wait", {
    ...base,
    onLimit: "wait",
    agents: [agentConfig("Agent A", keys.a.token, { FAKE_LIMIT_SECONDS: "6" })],
  });
  const paused = await waitFor("Ticket pausiert", async () => {
    const issue = (await asHuman("GET", `/issues/${first}`)).data;
    return issue.work?.state === "PAUSED" && issue;
  });
  check("Ticket ist pausiert und bleibt für Agent A reserviert", () => {
    assert.equal(paused.work.by.name, "Agent A");
    assert.equal(paused.status, "IN_PROGRESS");
  });
  check("erster Zwischenstand ist gespeichert", () => {
    assert.ok(paused.checkpoints.some((c: { summary: string }) => c.summary.includes("Schritt 1 erledigt")));
    assert.equal(paused.checklist[0].done, true);
    assert.equal(paused.checklist[1].done, false);
  });
  const waiting = (await asA("POST", "/agent/next", {})).data;
  check("limitierter Agent bekommt keine neue Aufgabe, sondern eine Wartezeit", () => {
    assert.equal(waiting.task, null);
    assert.ok(new Date(waiting.wait.until).getTime() > Date.now());
  });
  let done = await waitFor("Fortsetzung nach Reset", async () => {
    const issue = (await asHuman("GET", `/issues/${first}`)).data;
    return issue.status === "IN_REVIEW" && issue;
  }, 40_000);
  await runner.stop();
  check("nach dem Reset fortgesetzt und zur Prüfung übergeben", () => {
    assert.equal(done.work.state, "FREE");
    assert.deepEqual(done.checklist.map((item: { done: boolean }) => item.done), [true, true]);
  });
  check("Fortsetzung baut auf dem Zwischenstand auf", () => {
    const kinds = done.checkpoints.map((c: { kind: string }) => c.kind);
    assert.ok(kinds.includes("LIMIT") && kinds.includes("PROGRESS") && kinds.includes("HANDOFF"));
    assert.ok(done.comments.at(-1).body.includes('Aufgesetzt auf: "Schritt 1 erledigt'));
  });
  check("Arbeitsordner (Git-Worktree + Branch) blieb über die Pause erhalten", () => {
    assert.equal(done.branch, `tickra/${first}`);
    assert.deepEqual(readFileSync(worktreeLog(first), "utf8").trim().split("\n"), [
      `Agent A: Lauf 1 an ${first}`,
      `Agent A: Lauf 2 an ${first}`,
    ]);
  });
  check("Limit steht im Verlauf", () => {
    assert.ok(done.activity.some((entry: { action: string }) => entry.action === "agent.limited"));
  });

  // --- 2: Limit → anderer Agent übernimmt -----------------------------------
  console.log("\n2) Limit erreicht → ein anderer Agent übernimmt sofort");
  const second = await newIssue("Übergabe an anderen Agenten");
  runner = startRunner("handoff", {
    ...base,
    onLimit: "handoff",
    agents: [
      agentConfig("Agent A", keys.a.token, { FAKE_LIMIT_SECONDS: "3600" }),
      agentConfig("Agent B", keys.b.token, { FAKE_LIMIT_SECONDS: "3600" }),
    ],
  });
  done = await waitFor("Übernahme", async () => {
    const issue = (await asHuman("GET", `/issues/${second}`)).data;
    return issue.status === "IN_REVIEW" && issue;
  }, 40_000);
  await runner.stop();
  const lines = readFileSync(worktreeLog(second), "utf8").trim().split("\n");
  check("zwei verschiedene Agenten haben nacheinander am selben Stand gearbeitet", () => {
    assert.equal(lines.length, 2);
    assert.notEqual(lines[0].split(":")[0], lines[1].split(":")[0]);
  });
  check("Übernahme steht im Verlauf", () => {
    const takeover = done.activity.find((entry: { action: string }) => entry.action === "issue.taken_over");
    assert.equal(takeover.details.reason, "PAUSED");
  });
  const statusA = (await asA("GET", "/agent")).data;
  const statusB = (await asB("GET", "/agent")).data;
  check("genau ein Agent ist noch im Limit, keiner hält mehr eine Reservierung", () => {
    assert.equal([statusA.limitedUntil, statusB.limitedUntil].filter(Boolean).length, 1);
    assert.equal(statusA.claimed.length + statusB.claimed.length, 0);
  });
  await asA("DELETE", "/agent/limit");
  await asB("DELETE", "/agent/limit");

  // --- 3: Absturz → begrenzte Versuche → zurück an einen Menschen ------------
  console.log("\n3) Agent stürzt wiederholt ab → Ticket geht zurück an einen Menschen");
  const third = await newIssue("Stürzt immer ab");
  runner = startRunner("crash", {
    ...base,
    maxAttempts: 2,
    agents: [agentConfig("Agent A", keys.a.token, { FAKE_MODE: "crash" })],
  });
  done = await waitFor("Rückgabe", async () => {
    const issue = (await asHuman("GET", `/issues/${third}`)).data;
    return issue.status === "TODO" && issue.work.state === "FREE" && issue.agentReady === false && issue;
  }, 40_000);
  await runner.stop();
  check("nach 2 Versuchen zurückgegeben und nicht erneut an Agenten verteilt", () => {
    assert.equal(done.assignee, null);
    assert.ok(done.checkpoints.some((c: { kind: string }) => c.kind === "RUNNER"));
    assert.ok(done.activity.some((entry: { action: string }) => entry.action === "issue.released"));
  });
  const emptyQueue = (await asA("POST", "/agent/next", {})).data;
  check("Warteschlange ist leer", () => {
    assert.equal(emptyQueue.task, null);
  });

  // --- 4: Agent nicht angemeldet --------------------------------------------
  console.log("\n4) Agent ist bei seinem Anbieter nicht angemeldet");
  const unauth = await newIssue("Agent nicht angemeldet");
  runner = startRunner("auth", {
    ...base,
    agents: [agentConfig("Agent A", keys.a.token, { FAKE_MODE: "auth" })],
  });
  done = await waitFor("Rückgabe nach Anmeldefehler", async () => {
    const issue = (await asHuman("GET", `/issues/${unauth}`)).data;
    return issue.status === "TODO" && issue.work.state === "FREE" && issue.activity.length > 2 && issue;
  }, 30_000);
  await sleep(1500);
  const afterAuth = (await asHuman("GET", `/issues/${unauth}`)).data;
  await runner.stop();
  check("Ticket bleibt in der Warteschlange – der Fehler liegt beim Agenten, nicht am Ticket", () => {
    assert.equal(done.agentReady, true);
    assert.equal(done.assignee, null);
  });
  check("Runner pausiert den Agenten, statt Versuche zu verbrennen, und nennt die Lösung", () => {
    assert.equal(afterAuth.work.state, "FREE");
    const output = runner.output.join("");
    assert.match(output, /nicht angemeldet/);
    assert.match(output, /anmelden/);
  });
  await asHuman("PATCH", `/issues/${unauth}`, { agentReady: false });

  // --- 5: Regeln ------------------------------------------------------------
  console.log("\n5) Regeln: Reservierung, Übernahme, Freigabe-Gate");
  const fourth = await newIssue("Regeln");
  const claimA = await asA("POST", `/issues/${fourth}/claim`);
  const claimB = await asB("POST", `/issues/${fourth}/claim`);
  const editB = await asB("PATCH", `/issues/${fourth}`, { title: "Gekapert" });
  check("aktiv bearbeitetes Ticket kann kein anderer Agent übernehmen oder ändern", () => {
    assert.equal(claimA.status, 200);
    assert.equal(claimB.status, 409);
    assert.equal(editB.status, 409);
  });
  const doneByAgent = await asA("PATCH", `/issues/${fourth}`, { status: "DONE" });
  const selfApprove = await asA("PATCH", `/issues/${fourth}`, { agentReady: true });
  check("Agenten können weder abschließen noch sich Arbeit selbst freigeben", () => {
    assert.equal(doneByAgent.status, 403);
    assert.equal(selfApprove.status, 403);
  });
  await prisma.issue.update({ where: { key: fourth }, data: { claimExpiresAt: new Date(Date.now() - 1000) } });
  const stalled = (await asHuman("GET", `/issues/${fourth}`)).data;
  const takeover = await asB("POST", `/issues/${fourth}/claim`);
  check("ohne Lebenszeichen gilt das Ticket als unterbrochen und darf übernommen werden", () => {
    assert.equal(stalled.work.state, "STALLED");
    assert.equal(takeover.status, 200);
    assert.equal(takeover.data.takenOverFrom, "Agent A");
  });
  const heartbeatA = await asA("POST", `/issues/${fourth}/heartbeat`);
  check("der alte Bearbeiter kann die Reservierung nicht mehr verlängern", () => {
    assert.equal(heartbeatA.status, 409);
  });
  const staleCheckpoint = await asA("POST", `/issues/${fourth}/checkpoints`, { summary: "veraltet" });
  const staleReview = await asA("POST", `/issues/${fourth}/review`, { summary: "veraltet" });
  check("…und weder Zwischenstände schreiben noch das Ticket abschließen", () => {
    assert.equal(staleCheckpoint.status, 409);
    assert.match(staleCheckpoint.data.error, /übernommen/);
    assert.equal(staleReview.status, 409);
  });
  await asB("POST", `/issues/${fourth}/review`, { summary: "fertig" });
  const approve = await asHuman("PATCH", `/issues/${fourth}`, { status: "DONE" });
  check("ein Mensch gibt frei", () => {
    assert.equal(approve.status, 200);
    assert.equal(approve.data.status, "DONE");
  });
  const lateReview = await asB("POST", `/issues/${fourth}/review`, { summary: "nochmal" });
  check("ein freigegebenes Ticket kann kein Agent zurück in die Prüfung holen", () => {
    assert.equal(lateReview.status, 409);
  });
  const fifth = await newIssue("Nachbessern");
  await asA("POST", `/issues/${fifth}/claim`);
  await asA("POST", `/issues/${fifth}/review`, { summary: "erster Versuch" });
  await asHuman("PATCH", `/issues/${fifth}`, { status: "TODO", assignee: null });
  const again = (await asB("POST", "/agent/next", {})).data;
  check("„Nachbessern“ bringt das Ticket samt Vorgeschichte zurück in die Verteilung", () => {
    assert.equal(again.task.key, fifth);
    assert.ok(again.task.checkpoints.some((c: { summary: string }) => c.summary === "erster Versuch"));
  });

  // --- 6: MCP ---------------------------------------------------------------
  console.log("\n6) MCP-Endpunkt");
  const mcp = async (token: string | null, method: string, params?: unknown) => {
    const response = await fetch(`${URL}/api/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const raw = await response.text();
    const json = raw.trimStart().startsWith("{") ? raw : (raw.split("\n").find((line) => line.startsWith("data:")) ?? "data:{}").slice(5);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: response.status, body: JSON.parse(json || "{}") as any };
  };
  const callTool = async (token: string, name: string, args: object) => {
    const { body } = await mcp(token, "tools/call", { name, arguments: args });
    return { isError: !!body.result?.isError, text: String(body.result?.content?.[0]?.text ?? "") };
  };
  const anonymous = await mcp(null, "tools/list");
  const tools = await mcp(keys.b.token, "tools/list");
  check("ohne Key kein Zugriff, mit Key alle Tools", () => {
    assert.equal(anonymous.status, 401);
    const names = tools.body.result.tools.map((tool: { name: string }) => tool.name);
    for (const name of ["next_task", "claim_issue", "save_checkpoint", "check_item", "submit_for_review", "release_issue", "report_limit"]) {
      assert.ok(names.includes(name), `Tool ${name} fehlt`);
    }
  });
  const viaMcp = await callTool(keys.b.token, "save_checkpoint", { issue: fifth, summary: "per MCP gespeichert" });
  const checked = await callTool(keys.b.token, "check_item", { issue: fifth, item: 1 });
  const forbidden = await callTool(keys.b.token, "update_issue", { issue: fifth, status: "DONE" });
  const submitted = await callTool(keys.b.token, "submit_for_review", { issue: fifth, summary: "zweiter Versuch" });
  const viaMcpIssue = (await asHuman("GET", `/issues/${fifth}`)).data;
  check("Agent arbeitet über MCP: Zwischenstand, Kriterium abhaken, zur Prüfung übergeben", () => {
    assert.equal(viaMcp.isError, false, viaMcp.text);
    assert.equal(checked.isError, false, checked.text);
    assert.equal(submitted.isError, false, submitted.text);
    assert.equal(viaMcpIssue.status, "IN_REVIEW");
    assert.equal(viaMcpIssue.checklist[0].done, true);
    assert.ok(viaMcpIssue.activity.some((entry: { via: string }) => entry.via === "MCP"));
  });
  check("Freigabe-Gate gilt auch über MCP", () => {
    assert.equal(forbidden.isError, true);
    assert.match(forbidden.text, /Nur Menschen/);
  });

  await prisma.$disconnect();
  void project;
  console.log(`\nAlle ${passed} Prüfungen bestanden.`);
}

main()
  .then(() => 0)
  .catch((error) => {
    console.error("\n✗ FEHLGESCHLAGEN:", error);
    return 1;
  })
  .then((code) => {
    // Ganze Prozessgruppe beenden – npx startet den eigentlichen Prozess als Kind
    for (const child of processes) {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {
        // bereits beendet
      }
    }
    rmSync(tmp, { recursive: true, force: true });
    process.exit(code);
  });
