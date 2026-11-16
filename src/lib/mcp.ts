import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, ISSUE_TYPES } from "@/lib/constants";
import { contextFor, describeProject, listProjectsFor, projectKeyOf, type ApiUser } from "@/lib/api";
import type { ServiceResult } from "@/lib/services/context";
import { addComment, createIssue, getIssue, listIssues, updateIssue } from "@/lib/services/issues";
import {
  claimIssue,
  nextTask,
  releaseIssue,
  reportLimit,
  saveCheckpoint,
  setChecklistItem,
  submitForReview,
} from "@/lib/services/work";

const INSTRUCTIONS = `Tickra verteilt Aufgaben an Menschen und KI-Agenten (Projekte → Sprints → Tickets) und sorgt dafür, dass Arbeit Unterbrechungen übersteht.

Arbeitsablauf für Agenten:
1. next_task holt die nächste Aufgabe und reserviert sie für dich. Lies zuerst "checkpoints" (neuester zuerst): Dort steht, was schon erledigt ist und wo es weitergeht – fang nie von vorne an, wenn es Zwischenstände gibt.
2. Speichere nach JEDEM abgeschlossenen Teilschritt einen Zwischenstand mit save_checkpoint (was ist fertig, was kommt als Nächstes, welche Entscheidungen wurden getroffen). Du kannst jederzeit ohne Vorwarnung unterbrochen werden (Nutzungslimit, Absturz) – nur was im Checkpoint oder im Git-Branch steht, überlebt.
3. Committe Code-Zwischenstände regelmäßig auf einen eigenen Branch und nenne ihn im Checkpoint (branch).
4. Hake erfüllte Akzeptanzkriterien mit check_item ab.
5. Fertig? submit_for_review mit einer Zusammenfassung. Ein Mensch prüft und gibt frei – du kannst nicht selbst auf DONE setzen.
6. Kommst du nicht weiter (unklare Anforderung, fehlender Zugang)? release_issue mit Begründung und needsHuman=true.
7. Merkst du, dass dein Nutzungslimit erreicht ist oder gleich erreicht wird: zuerst save_checkpoint, dann report_limit mit dem Reset-Zeitpunkt.

Eine Reservierung gilt 15 Minuten und verlängert sich mit jedem save_checkpoint. Ohne Lebenszeichen darf ein anderer Agent das Ticket übernehmen.
Alle Änderungen werden mit deinem Namen protokolliert.`;

const issueKey = z.string().describe('Ticket-Key, z.B. "WEB-12"');
const projectKey = z.string().describe('Projekt-Key, z.B. "WEB"');
const assignee = z
  .string()
  .describe('"me", "none", Name, E-Mail oder User-ID eines Projektmitglieds');
const sprint = z
  .string()
  .describe('"active" (laufender Sprint), "backlog", Sprint-Name oder Sprint-ID');

const editableFields = {
  description: z.string().nullable().optional().describe("Beschreibung (Markdown-Text), null zum Leeren"),
  type: z.enum(ISSUE_TYPES).optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  status: z
    .enum(ISSUE_STATUSES)
    .optional()
    .describe("DONE dürfen nur Menschen setzen – Agenten nutzen submit_for_review"),
  assignee: assignee.nullable().optional(),
  sprint: sprint.nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().nullable().optional().describe("Fälligkeitsdatum JJJJ-MM-TT, null zum Leeren"),
  labels: z.array(z.string()).optional().describe("Label-Namen; ersetzt die bisherigen Labels"),
  branch: z.string().nullable().optional().describe("Git-Branch mit der Arbeit zu diesem Ticket"),
  prUrl: z.string().nullable().optional().describe("Link zum Pull Request"),
};

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function fromService(result: ServiceResult<unknown>) {
  return result.ok ? text(result.data ?? { ok: true }) : errorResult(result.error);
}

const NO_ACCESS = (key: string) =>
  errorResult(`Projekt "${key}" nicht gefunden oder kein Zugriff. Nutze list_projects.`);

/** Ein MCP-Server pro Request, fest an den authentifizierten User gebunden. */
export function createTickraMcpServer(user: ApiUser) {
  const server = new McpServer({ name: "tickra", version: "1.0.0" }, { instructions: INSTRUCTIONS });

  async function forProject(key: string) {
    return contextFor(user, key, "MCP");
  }
  async function forIssue(key: string) {
    const project = projectKeyOf(key);
    return project ? contextFor(user, project, "MCP") : null;
  }

  server.registerTool(
    "whoami",
    {
      title: "Wer bin ich?",
      description: "Zeigt den angemeldeten Benutzer bzw. Agenten und seine Projekte.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => text({ user, projects: await listProjectsFor(user.id) })
  );

  server.registerTool(
    "list_projects",
    {
      title: "Projekte auflisten",
      description: "Alle Projekte, auf die du Zugriff hast – mit aktivem Sprint und Anzahl offener Tickets.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () => text(await listProjectsFor(user.id))
  );

  server.registerTool(
    "get_project",
    {
      title: "Projekt-Details",
      description: "Mitglieder (Menschen und Agenten), Labels und offene Sprints eines Projekts.",
      inputSchema: z.object({ project: projectKey }),
      annotations: { readOnlyHint: true },
    },
    async ({ project }) => {
      const ctx = await forProject(project);
      return ctx ? text(await describeProject(ctx)) : NO_ACCESS(project);
    }
  );

  server.registerTool(
    "list_issues",
    {
      title: "Tickets suchen",
      description:
        'Tickets eines Projekts filtern. Ohne Filter: alle Tickets. Tipp: assignee="me", state="open" für deine offenen Aufgaben.',
      inputSchema: z.object({
        project: projectKey,
        status: z.enum(ISSUE_STATUSES).optional(),
        state: z.enum(["open", "all"]).optional().describe('"open" = alles außer DONE'),
        assignee: assignee.optional().describe('zusätzlich "unassigned" für freie Tickets'),
        sprint: sprint.optional(),
        type: z.enum(ISSUE_TYPES).optional(),
        query: z.string().optional().describe("Volltextsuche in Titel, Beschreibung und Key"),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ project, ...filters }) => {
      const ctx = await forProject(project);
      return ctx ? fromService(await listIssues(ctx, filters)) : NO_ACCESS(project);
    }
  );

  server.registerTool(
    "get_issue",
    {
      title: "Ticket lesen",
      description:
        "Ein Ticket mit allen Feldern, Akzeptanzkriterien, Zwischenständen (checkpoints), Kommentaren und Änderungsverlauf.",
      inputSchema: z.object({ issue: issueKey }),
      annotations: { readOnlyHint: true },
    },
    async ({ issue }) => {
      const ctx = await forIssue(issue);
      return ctx ? fromService(await getIssue(ctx, issue)) : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  server.registerTool(
    "create_issue",
    {
      title: "Ticket erstellen",
      description: "Legt ein neues Ticket an. Ohne sprint landet es im Backlog.",
      inputSchema: z.object({
        project: projectKey,
        title: z.string().describe("Kurzer, eindeutiger Titel"),
        ...editableFields,
        checklist: z
          .array(z.string())
          .optional()
          .describe("Akzeptanzkriterien: prüfbare Bedingungen, wann das Ticket fertig ist"),
      }),
    },
    async ({ project, ...input }) => {
      const ctx = await forProject(project);
      return ctx ? fromService(await createIssue(ctx, input)) : NO_ACCESS(project);
    }
  );

  server.registerTool(
    "update_issue",
    {
      title: "Ticket ändern",
      description:
        'Ändert nur die übergebenen Felder. Zum Übernehmen: assignee="me", status="IN_PROGRESS". Wenn fertig: status="IN_REVIEW".',
      inputSchema: z.object({
        issue: issueKey,
        title: z.string().optional(),
        ...editableFields,
      }),
      annotations: { idempotentHint: true },
    },
    async ({ issue, ...input }) => {
      const ctx = await forIssue(issue);
      return ctx ? fromService(await updateIssue(ctx, issue, input)) : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  server.registerTool(
    "add_comment",
    {
      title: "Kommentar schreiben",
      description: "Hält Fortschritt, Entscheidungen, Ergebnisse oder Fragen am Ticket fest.",
      inputSchema: z.object({ issue: issueKey, body: z.string().describe("Kommentartext") }),
    },
    async ({ issue, body }) => {
      const ctx = await forIssue(issue);
      return ctx ? fromService(await addComment(ctx, issue, body)) : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  // --- Dauerhafte Arbeit: Reservieren, Zwischenstände, Limits ----------------

  server.registerTool(
    "next_task",
    {
      title: "Nächste Aufgabe holen",
      description:
        "Liefert die nächste Aufgabe für dich und reserviert sie: zuerst deine angefangenen Tickets, dann verwaiste, dann freigegebene To-Dos (aktiver Sprint und hohe Priorität zuerst). Antwort enthält alle Zwischenstände. task=null bedeutet: nichts zu tun oder du musst warten (wait).",
      inputSchema: z.object({
        takeover: z
          .boolean()
          .optional()
          .describe("Auch Tickets übernehmen, deren Bearbeiter wegen Nutzungslimit pausiert"),
        projects: z.array(z.string()).optional().describe("Auf diese Projekt-Keys einschränken"),
      }),
    },
    async (input) => fromService(await nextTask(user, input, "MCP"))
  );

  server.registerTool(
    "claim_issue",
    {
      title: "Ticket reservieren",
      description:
        "Reserviert ein bestimmtes Ticket für dich (15 Minuten, verlängert durch save_checkpoint) und setzt es auf IN_PROGRESS. Schlägt fehl, wenn gerade jemand anderes aktiv daran arbeitet.",
      inputSchema: z.object({ issue: issueKey }),
    },
    async ({ issue }) => {
      const ctx = await forIssue(issue);
      return ctx ? fromService(await claimIssue(ctx, issue)) : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  server.registerTool(
    "save_checkpoint",
    {
      title: "Zwischenstand speichern",
      description:
        "Speichert den aktuellen Arbeitsstand, damit nach einer Unterbrechung (Limit, Absturz, Übergabe) nahtlos weitergearbeitet werden kann. Nach jedem Teilschritt aufrufen. Verlängert die Reservierung.",
      inputSchema: z.object({
        issue: issueKey,
        summary: z
          .string()
          .describe("Was ist erledigt? Welche Entscheidungen wurden getroffen und warum? So schreiben, dass jemand ohne Vorwissen es versteht."),
        nextSteps: z.string().optional().describe("Konkrete nächste Schritte in Reihenfolge"),
        branch: z.string().optional().describe("Git-Branch, auf dem der Code-Stand liegt"),
      }),
    },
    async ({ issue, ...input }) => {
      const ctx = await forIssue(issue);
      return ctx ? fromService(await saveCheckpoint(ctx, issue, input)) : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  server.registerTool(
    "check_item",
    {
      title: "Akzeptanzkriterium abhaken",
      description: "Markiert ein Akzeptanzkriterium als erfüllt (oder wieder offen).",
      inputSchema: z.object({
        issue: issueKey,
        item: z.union([z.string(), z.number()]).describe("ID, Position (1 = erstes) oder exakter Text des Kriteriums"),
        done: z.boolean().optional().describe("Standard: true"),
      }),
      annotations: { idempotentHint: true },
    },
    async ({ issue, item, done }) => {
      const ctx = await forIssue(issue);
      return ctx
        ? fromService(await setChecklistItem(ctx, issue, item, done ?? true))
        : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  server.registerTool(
    "submit_for_review",
    {
      title: "Zur Prüfung übergeben",
      description:
        "Schließt deine Arbeit ab: Status IN_REVIEW, Reservierung endet, Zusammenfassung wird als Kommentar gespeichert. Ein Mensch prüft und gibt frei.",
      inputSchema: z.object({
        issue: issueKey,
        summary: z.string().describe("Was wurde gemacht, wie wurde es getestet, worauf soll der Prüfer achten?"),
        prUrl: z.string().optional().describe("Link zum Pull Request"),
        branch: z.string().optional(),
      }),
    },
    async ({ issue, ...input }) => {
      const ctx = await forIssue(issue);
      return ctx ? fromService(await submitForReview(ctx, issue, input)) : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  server.registerTool(
    "release_issue",
    {
      title: "Ticket zurückgeben",
      description:
        "Gibt ein Ticket unfertig zurück (Status TODO, Reservierung endet). Mit needsHuman=true wird es nicht erneut an Agenten verteilt.",
      inputSchema: z.object({
        issue: issueKey,
        reason: z.string().describe("Warum? Was fehlt, was wurde versucht?"),
        needsHuman: z.boolean().optional(),
      }),
    },
    async ({ issue, ...input }) => {
      const ctx = await forIssue(issue);
      return ctx ? fromService(await releaseIssue(ctx, issue, input)) : errorResult(`Ticket ${issue} nicht gefunden.`);
    }
  );

  server.registerTool(
    "report_limit",
    {
      title: "Nutzungslimit melden",
      description:
        "Meldet, dass dein Nutzungslimit erreicht ist. Deine Tickets werden bis zum Reset pausiert (oder von einem anderen Agenten übernommen). Vorher save_checkpoint aufrufen!",
      inputSchema: z.object({
        resetAt: z.string().optional().describe("Zeitpunkt des Resets (ISO 8601), falls bekannt"),
        resetInMinutes: z.number().optional().describe("Alternativ: Minuten bis zum Reset (Standard 60)"),
        note: z.string().optional(),
      }),
    },
    async (input) => fromService(await reportLimit(user, input, "MCP"))
  );

  return server;
}
