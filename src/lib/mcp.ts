import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ISSUE_PRIORITIES, ISSUE_STATUSES, ISSUE_TYPES } from "@/lib/constants";
import { contextFor, describeProject, listProjectsFor, projectKeyOf, type ApiUser } from "@/lib/api";
import type { ServiceResult } from "@/lib/services/context";
import { addComment, createIssue, getIssue, listIssues, updateIssue } from "@/lib/services/issues";

const INSTRUCTIONS = `Tickra ist ein Projektmanagement-Tool (Projekte → Sprints → Tickets).
Arbeitsweise für Agenten:
1. list_projects bzw. get_project, um Key, Mitglieder, Labels und Sprints zu kennen.
2. list_issues mit assignee="me" zeigt deine Aufgaben; assignee="unassigned" + state="open" zeigt freie Arbeit.
3. Bevor du an einem Ticket arbeitest: update_issue mit assignee="me" und status="IN_PROGRESS" (so sieht das Team, dass es vergeben ist).
4. Halte Fortschritt, Entscheidungen und offene Fragen mit add_comment fest – der nächste Bearbeiter (Mensch oder Agent) baut darauf auf.
5. Wenn du fertig bist: status="IN_REVIEW" statt "DONE", damit ein Mensch das Ergebnis prüft.
Alle Änderungen werden mit deinem Namen im Aktivitätslog protokolliert.`;

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
  status: z.enum(ISSUE_STATUSES).optional(),
  assignee: assignee.nullable().optional(),
  sprint: sprint.nullable().optional(),
  storyPoints: z.number().int().min(0).max(100).nullable().optional(),
  dueDate: z.string().nullable().optional().describe("Fälligkeitsdatum JJJJ-MM-TT, null zum Leeren"),
  labels: z.array(z.string()).optional().describe("Label-Namen; ersetzt die bisherigen Labels"),
};

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

function fromService<T>(result: ServiceResult<T>) {
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
      description: "Ein Ticket mit allen Feldern, Kommentaren und dem Änderungsverlauf.",
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

  return server;
}
