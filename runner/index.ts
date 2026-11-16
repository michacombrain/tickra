/**
 * Tickra-Runner: startet Agenten automatisch für freigegebene Tickets.
 *
 *   npm run runner -- --config runner.config.json [--once] [--check]
 *
 *   --check  prüft Konfiguration, API-Keys und Agenten-Befehle, ohne Arbeit zu starten
 *   --once   arbeitet ab, was gerade ansteht, und beendet sich dann
 *
 * Ablauf pro Agent: nächste Aufgabe holen → Agent im Projektordner starten → Lebenszeichen senden →
 * nach dem Ende prüfen: abgeschlossen? Nutzungslimit? Abgebrochen? Bei Limit wird der Zeitpunkt an
 * Tickra gemeldet und nach dem Reset an derselben Stelle weitergemacht (oder ein anderer Agent übernimmt).
 */
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { detectLimit, limitSignalLines } from "./limits";
import { failureSummary, isAuthFailure } from "./output";
import { buildPrompt, buildResumePrompt, type Task } from "./prompt";

const execFileAsync = promisify(execFile);

// --- Konfiguration ----------------------------------------------------------

type AgentConfig = {
  name: string;
  apiKey?: string;
  /** Name einer Umgebungsvariable mit dem API-Key (empfohlen statt apiKey im Klartext) */
  apiKeyEnv?: string;
  /** "claude" (Standard) oder "custom" */
  type?: "claude" | "custom";
  command?: string;
  /** Zusätzliche Argumente; bei type "custom" wird "{prompt}" ersetzt */
  args?: string[];
  /**
   * Was der Agent ohne Rückfrage darf (nur type "claude"). Standard: Tickra-Tools, Dateien bearbeiten
   * und Git-Grundbefehle. Für Tests/Builds ergänzen, z.B. "Bash(npm test *)".
   */
  allowedTools?: string[];
  /** Zusätzliche Umgebungsvariablen, z.B. CLAUDE_CONFIG_DIR für einen zweiten Account */
  env?: Record<string, string>;
};

type Config = {
  url: string;
  pollSeconds?: number;
  /** Bei Limit eines Agenten: "handoff" = andere Agenten übernehmen, "wait" = auf den Reset warten */
  onLimit?: "handoff" | "wait";
  /** Wartezeit, wenn die Limit-Meldung keinen Zeitpunkt nennt */
  defaultLimitMinutes?: number;
  maxAttempts?: number;
  /** Jedes Ticket in eigenem Git-Worktree bearbeiten (Standard: true bei Git-Repos) */
  worktrees?: boolean;
  projects: Record<string, { path: string }>;
  agents: AgentConfig[];
};

function expandHome(path: string) {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

function loadConfig(): { config: Config; once: boolean; checkOnly: boolean; stateFile: string } {
  const args = process.argv.slice(2);
  const once = args.includes("--once");
  const checkOnly = args.includes("--check");
  const configIndex = args.indexOf("--config");
  const configPath = resolve(configIndex >= 0 ? args[configIndex + 1] : "runner.config.json");
  if (!existsSync(configPath)) {
    console.error(`Konfiguration nicht gefunden: ${configPath}\nVorlage: runner.config.example.json`);
    process.exit(1);
  }
  const config = JSON.parse(readFileSync(configPath, "utf8")) as Config;
  if (!config.url || !config.agents?.length || !config.projects) {
    console.error('Konfiguration braucht "url", "projects" und mindestens einen Eintrag in "agents".');
    process.exit(1);
  }
  for (const [key, project] of Object.entries(config.projects)) {
    project.path = resolve(dirname(configPath), expandHome(project.path));
    if (!existsSync(project.path)) {
      console.error(`Projekt ${key}: Ordner existiert nicht: ${project.path}`);
      process.exit(1);
    }
  }
  return { config, once, checkOnly, stateFile: join(dirname(configPath), ".tickra-runner-state.json") };
}

const { config, once, checkOnly, stateFile } = loadConfig();
const POLL_MS = (config.pollSeconds ?? 20) * 1000;
const MAX_ATTEMPTS = config.maxAttempts ?? 3;
const HEARTBEAT_MS = 60_000;
/** Pause, wenn ein Agent nicht angemeldet ist – erneute Versuche helfen erst nach einem Login */
const AUTH_BACKOFF_MS = 5 * 60_000;
/** Wartezeit vor dem n-ten Wiederholungsversuch eines Tickets */
const retryDelayMs = (attempts: number) => Math.min(5 * 60_000, 5_000 * 3 ** (attempts - 1));

class AgentUnavailable extends Error {}
const DEFAULT_ALLOWED_TOOLS = [
  "mcp__tickra",
  "Bash(git status *)",
  "Bash(git diff *)",
  "Bash(git log *)",
  "Bash(git add *)",
  "Bash(git commit *)",
];

// --- Lokaler Zustand (Sessions zum Fortsetzen, Fehlversuche) ----------------

type RunState = Record<string, { agent: string; sessionId?: string; attempts: number }>;

function readState(): RunState {
  try {
    return JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {
    return {};
  }
}
const state = readState();
const saveState = () => writeFileSync(stateFile, JSON.stringify(state, null, 2));

// --- Tickra-API -------------------------------------------------------------

function keyOf(agent: AgentConfig) {
  const key = agent.apiKey ?? (agent.apiKeyEnv ? process.env[agent.apiKeyEnv] : undefined);
  if (!key) throw new Error(`Agent "${agent.name}": kein API-Key (apiKey oder apiKeyEnv setzen).`);
  return key;
}

async function api<T>(agent: AgentConfig, method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${config.url.replace(/\/$/, "")}/api/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${keyOf(agent)}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status}: ${data.error ?? "Fehler"}`);
  return data;
}

type NextResult = {
  task: (Task & { status: string; work: { state: string; by: { id: string } | null } }) | null;
  resumed?: boolean;
  takenOverFrom?: string | null;
  wait?: { until: string; reason: string };
};

// --- Hilfen -----------------------------------------------------------------

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));
const log = (agent: string, message: string) =>
  console.log(`${new Date().toLocaleTimeString("de-DE")} [${agent}] ${message}`);

let stopping = false;
const children = new Set<ChildProcess>();

async function git(cwd: string, ...args: string[]) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

/** Eigener Worktree + Branch pro Ticket: parallele Agenten kommen sich nicht in die Quere, der Stand bleibt liegen. */
async function prepareWorkspace(projectPath: string, task: Task) {
  const branch = task.branch ?? `tickra/${task.key}`;
  const isRepo = await git(projectPath, "rev-parse", "--is-inside-work-tree").then(
    () => true,
    () => false
  );
  if (!isRepo) return { cwd: projectPath, branch: null, worktree: false };
  if (config.worktrees === false) return { cwd: projectPath, branch, worktree: false };

  const root = await git(projectPath, "rev-parse", "--show-toplevel");
  const dir = join(dirname(root), ".tickra-worktrees", `${root.split("/").pop()}-${task.key}`);
  if (!existsSync(dir)) {
    mkdirSync(dirname(dir), { recursive: true });
    const exists = await git(root, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).then(
      () => true,
      () => false
    );
    await git(root, "worktree", "add", ...(exists ? [dir, branch] : ["-b", branch, dir]));
  }
  return { cwd: dir, branch, worktree: true };
}

function commandFor(agent: AgentConfig, prompt: string, options: { sessionId: string; resume: boolean }) {
  if (agent.type === "custom") {
    if (!agent.command) throw new Error(`Agent "${agent.name}": type "custom" braucht "command".`);
    return {
      command: expandHome(agent.command),
      args: (agent.args ?? ["{prompt}"]).map((arg) => arg.replace("{prompt}", prompt)),
      cleanup: () => {},
    };
  }
  // MCP-Zugang nur für diesen Lauf, Key liegt in einer Datei mit eingeschränkten Rechten
  const mcpFile = join(tmpdir(), `tickra-mcp-${randomUUID()}.json`);
  writeFileSync(
    mcpFile,
    JSON.stringify({
      mcpServers: {
        tickra: {
          type: "http",
          url: `${config.url.replace(/\/$/, "")}/api/mcp`,
          headers: { Authorization: `Bearer ${keyOf(agent)}` },
        },
      },
    }),
    { mode: 0o600 }
  );
  return {
    command: agent.command ?? "claude",
    args: [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--mcp-config",
      mcpFile,
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      ...(agent.allowedTools ?? DEFAULT_ALLOWED_TOOLS),
      ...(options.resume ? ["--resume", options.sessionId] : ["--session-id", options.sessionId]),
      ...(agent.args ?? []),
    ],
    cleanup: () => rmSync(mcpFile, { force: true }),
  };
}

function runProcess(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((done) => {
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    let stdout = "";
    let stderr = "";
    // Nur das Ende aufheben – reicht für Limit-Erkennung und Fehlerberichte
    const keep = (buffer: string, chunk: Buffer) => (buffer + chunk.toString()).slice(-200_000);
    child.stdout.on("data", (chunk: Buffer) => (stdout = keep(stdout, chunk)));
    child.stderr.on("data", (chunk: Buffer) => (stderr = keep(stderr, chunk)));
    child.on("error", (error) => {
      children.delete(child);
      done({ code: 127, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on("close", (code) => {
      children.delete(child);
      done({ code, stdout, stderr });
    });
  });
}

// --- Ein Ticket bearbeiten --------------------------------------------------

async function work(agent: AgentConfig, next: NextResult) {
  const task = next.task!;
  const projectKey = task.key.slice(0, task.key.lastIndexOf("-"));
  const project = config.projects[projectKey];
  const run = state[task.key]?.agent === agent.name ? state[task.key] : { agent: agent.name, attempts: 0 };
  state[task.key] = run;

  const workspace = await prepareWorkspace(project.path, task);
  if (workspace.branch && task.branch !== workspace.branch) {
    await api(agent, "PATCH", `/issues/${task.key}`, { branch: workspace.branch });
  }

  // Eigene, noch bekannte Session → exakt dort weitermachen; sonst frisch mit Zwischenständen als Kontext
  const canResume = agent.type !== "custom" && !!run.sessionId && !next.takenOverFrom;
  const sessionId = canResume ? run.sessionId! : randomUUID();
  run.sessionId = sessionId;
  saveState();

  const prompt = canResume
    ? buildResumePrompt(task)
    : buildPrompt(task, {
        resumed: !!next.resumed,
        takenOverFrom: next.takenOverFrom ?? null,
        branch: workspace.branch,
        worktree: workspace.worktree,
      });
  const { command, args, cleanup } = commandFor(agent, prompt, { sessionId, resume: canResume });

  log(
    agent.name,
    `${task.key} „${task.title}“ – ${canResume ? "setze Session fort" : next.takenOverFrom ? `übernehme von ${next.takenOverFrom}` : next.resumed ? "mache weiter" : "starte"} in ${workspace.cwd}`
  );

  const beat = setInterval(() => {
    api(agent, "POST", `/issues/${task.key}/heartbeat`).catch(() => {});
  }, HEARTBEAT_MS);
  const agentEnv = Object.fromEntries(
    Object.entries(agent.env ?? {}).map(([name, value]) => [name, expandHome(value)])
  );
  const result = await runProcess(command, args, workspace.cwd, {
    ...process.env,
    ...agentEnv,
    TICKRA_URL: config.url,
    TICKRA_API_KEY: keyOf(agent),
    TICKRA_ISSUE: task.key,
    TICKRA_PROJECT: projectKey,
  });
  clearInterval(beat);
  cleanup();
  if (stopping) return;

  // 1) Nutzungslimit?
  const limit = detectLimit(limitSignalLines(result.stdout, result.stderr));
  if (limit) {
    const body = limit.resetAt
      ? { resetAt: limit.resetAt.toISOString() }
      : { resetInMinutes: config.defaultLimitMinutes ?? 60 };
    const reported = await api<{ limitedUntil: string }>(agent, "POST", "/agent/limit", {
      ...body,
      note: limit.message.slice(0, 200),
      sessionId,
    });
    log(agent.name, `Nutzungslimit – ${task.key} pausiert bis ${new Date(reported.limitedUntil).toLocaleString("de-DE")}`);
    return;
  }

  // 2) Agent nicht angemeldet? Liegt nicht am Ticket → zurück in die Warteschlange, Agent pausiert.
  if (isAuthFailure(result.stdout, result.stderr)) {
    const reason = failureSummary(result.stdout, result.stderr, 200);
    await api(agent, "POST", `/issues/${task.key}/release`, {
      reason: `Runner: ${agent.name} ist bei seinem Anbieter nicht angemeldet (${reason}). Ticket bleibt in der Warteschlange.`,
    });
    delete state[task.key];
    saveState();
    throw new AgentUnavailable(
      `nicht angemeldet: ${reason}\n    → Im Terminal "${agent.command ?? "claude"}" starten und anmelden` +
        (agent.env?.CLAUDE_CONFIG_DIR ? ` (mit CLAUDE_CONFIG_DIR=${agent.env.CLAUDE_CONFIG_DIR})` : "") +
        "."
    );
  }

  // 3) Abgeschlossen oder zurückgegeben?
  const after = await api<{ status: string; work: { state: string; by: { id: string } | null } }>(
    agent,
    "GET",
    `/issues/${task.key}`
  );
  if (after.status !== "IN_PROGRESS" || after.work.state === "FREE") {
    log(agent.name, `${task.key} → ${after.status === "IN_REVIEW" ? "zur Prüfung übergeben" : after.status}`);
    delete state[task.key];
    saveState();
    return;
  }

  // 4) Prozess endete ohne Abschluss
  run.attempts += 1;
  // Fehlgeschlagene Session nicht erneut fortsetzen
  if (result.code !== 0) delete run.sessionId;
  saveState();
  const output = failureSummary(result.stdout, result.stderr);
  if (run.attempts >= MAX_ATTEMPTS) {
    await api(agent, "POST", `/issues/${task.key}/release`, {
      reason: `Runner: ${run.attempts} Versuche ohne Abschluss (Exit-Code ${result.code}). Letzte Ausgabe:\n${output}`,
      needsHuman: true,
    });
    log(agent.name, `${task.key} nach ${run.attempts} Versuchen zurückgegeben – braucht einen Menschen`);
    delete state[task.key];
    saveState();
  } else {
    await api(agent, "POST", `/issues/${task.key}/checkpoints`, {
      kind: "RUNNER",
      summary: `Agent-Prozess endete ohne Abschluss (Exit-Code ${result.code}, Versuch ${run.attempts}/${MAX_ATTEMPTS}). Letzte Ausgabe:\n${output}`,
    });
    const delay = retryDelayMs(run.attempts);
    log(
      agent.name,
      `${task.key} unterbrochen (Exit-Code ${result.code}): ${output.split("\n")[0].slice(0, 120)} – Versuch ${run.attempts + 1}/${MAX_ATTEMPTS} in ${Math.round(delay / 1000)} s`
    );
    if (!once) await sleep(delay);
  }
}

// --- Schleife pro Agent -----------------------------------------------------

async function agentLoop(agent: AgentConfig) {
  let idleNotified = false;
  while (!stopping) {
    let next: NextResult;
    try {
      next = await api<NextResult>(agent, "POST", "/agent/next", {
        takeover: (config.onLimit ?? "handoff") === "handoff",
        projects: Object.keys(config.projects),
      });
    } catch (error) {
      log(agent.name, `Tickra nicht erreichbar: ${(error as Error).message}`);
      if (once) return;
      await sleep(POLL_MS);
      continue;
    }

    if (next.task) {
      idleNotified = false;
      try {
        await work(agent, next);
      } catch (error) {
        if (error instanceof AgentUnavailable) {
          log(agent.name, `${error.message}\n    Nächster Versuch in ${AUTH_BACKOFF_MS / 60_000} Minuten.`);
          if (once) return;
          await sleep(AUTH_BACKOFF_MS);
        } else {
          log(agent.name, `Fehler bei ${next.task.key}: ${(error as Error).message}`);
          await sleep(POLL_MS);
        }
      }
      continue;
    }

    if (next.wait) {
      const until = new Date(next.wait.until);
      if (!idleNotified) log(agent.name, `pausiert bis ${until.toLocaleString("de-DE")} (${next.wait.reason})`);
      idleNotified = true;
      if (once) return;
      // In Häppchen schlafen: reagiert auf Stopp und auf "Pause aufheben" in der Oberfläche
      await sleep(Math.min(POLL_MS, Math.max(1000, until.getTime() - Date.now())));
      continue;
    }

    if (once) return;
    if (!idleNotified) log(agent.name, "keine Aufgaben – warte");
    idleNotified = true;
    await sleep(POLL_MS);
  }
}

/** Prüft, ob alles bereit ist – ohne ein Ticket anzufassen oder Kontingent zu verbrauchen. */
async function check() {
  let problems = 0;
  const fail = (message: string) => {
    problems += 1;
    console.log(`  ✗ ${message}`);
  };
  for (const agent of config.agents) {
    console.log(`\n${agent.name}`);
    try {
      const me = await api<{ user: { name: string; kind: string }; projects: { key: string }[] }>(agent, "GET", "/me");
      console.log(`  ✓ API-Key gültig: ${me.user.name} (${me.user.kind === "AGENT" ? "KI-Agent" : "Mensch"})`);
      const reachable = me.projects.map((project) => project.key);
      for (const key of Object.keys(config.projects)) {
        if (reachable.includes(key.toUpperCase())) console.log(`  ✓ Mitglied in ${key}`);
        else fail(`kein Mitglied im Projekt ${key} – in Tickra unter Einstellungen hinzufügen`);
      }
    } catch (error) {
      fail((error as Error).message);
    }
    const command = expandHome(agent.command ?? "claude");
    try {
      const { stdout } = await execFileAsync(command, ["--version"], { timeout: 15_000 });
      console.log(`  ✓ Befehl "${command}" gefunden (${stdout.trim().split("\n")[0]})`);
    } catch {
      if (agent.type === "custom") console.log(`  · Befehl "${command}" nicht geprüft (type custom)`);
      else fail(`Befehl "${command}" nicht gefunden oder nicht startbar`);
    }
  }
  for (const [key, project] of Object.entries(config.projects)) {
    const isRepo = await git(project.path, "rev-parse", "--is-inside-work-tree").then(
      () => true,
      () => false
    );
    console.log(`\n${key}: ${project.path} ${isRepo ? "(Git-Repo → eigener Worktree pro Ticket)" : "(kein Git-Repo → Agenten arbeiten direkt im Ordner)"}`);
  }
  console.log(
    problems
      ? `\n${problems} Problem(e) gefunden.`
      : "\nAlles bereit. Hinweis: Ob ein Agent bei seinem Anbieter angemeldet ist, zeigt sich erst beim ersten Lauf."
  );
  process.exit(problems ? 1 : 0);
}

async function main() {
  console.log(
    `Tickra-Runner · ${config.url} · Projekte: ${Object.keys(config.projects).join(", ")} · Agenten: ${config.agents
      .map((agent) => agent.name)
      .join(", ")} · bei Limit: ${config.onLimit ?? "handoff"}`
  );
  for (const agent of config.agents) keyOf(agent);
  if (checkOnly) return check();

  const shutdown = () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log("\nStoppe … laufende Tickets bleiben reserviert und werden beim nächsten Start fortgesetzt.");
    for (const child of children) child.kill("SIGTERM");
    // Schlafende Schleifen nicht abwarten
    setTimeout(() => process.exit(0), 1500).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await Promise.all(config.agents.map(agentLoop));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
