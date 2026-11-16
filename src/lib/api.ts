import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadProjectAccess } from "@/lib/access";
import { authenticateApiKey } from "@/lib/services/api-keys";
import type { ServiceContext, ServiceResult } from "@/lib/services/context";

export type ApiUser = NonNullable<Awaited<ReturnType<typeof authenticateApiKey>>>;

export function apiError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** Bearer-Token prüfen. Liefert den User oder eine fertige 401-Antwort. */
export async function authenticate(request: NextRequest | Request): Promise<ApiUser | NextResponse> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return apiError("API-Key fehlt (Header: Authorization: Bearer tk_…).", 401);
  const user = await authenticateApiKey(token);
  if (!user) return apiError("Ungültiger oder gesperrter API-Key.", 401);
  return user;
}

export async function contextFor(
  user: ApiUser,
  projectKey: string,
  via: ServiceContext["via"]
): Promise<ServiceContext | null> {
  const access = await loadProjectAccess(user.id, projectKey.toUpperCase());
  if (!access) return null;
  return { user, project: access.project, isAdmin: access.isAdmin, via };
}

/** "WEB-12" → "WEB" (Projekt-Keys enthalten nie einen Bindestrich). */
export function projectKeyOf(issueKey: string) {
  const index = issueKey.lastIndexOf("-");
  return index > 0 ? issueKey.slice(0, index).toUpperCase() : null;
}

export function toResponse<T>(result: ServiceResult<T>, successStatus = 200) {
  return result.ok
    ? NextResponse.json(result.data ?? { ok: true }, { status: successStatus })
    : apiError(result.error, result.status);
}

export const INVALID_JSON = Symbol("invalid-json");

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return INVALID_JSON;
  }
}

export const invalidJsonResponse = () => apiError("Request-Body muss gültiges JSON sein.", 400);

/** Projekte des Users mit kompakten Metadaten. */
export async function listProjectsFor(userId: string) {
  const projects = await db.project.findMany({
    where: { members: { some: { userId } } },
    include: {
      sprints: { where: { status: "ACTIVE" }, select: { id: true, name: true } },
      _count: { select: { issues: { where: { status: { not: "DONE" } } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return projects.map((project) => ({
    key: project.key,
    name: project.name,
    description: project.description,
    activeSprint: project.sprints[0] ?? null,
    openIssues: project._count.issues,
  }));
}

export async function describeProject(ctx: ServiceContext) {
  const sprints = await db.sprint.findMany({
    where: { projectId: ctx.project.id, status: { in: ["ACTIVE", "PLANNED"] } },
    select: { id: true, name: true, goal: true, status: true, startDate: true, endDate: true },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });
  return {
    key: ctx.project.key,
    name: ctx.project.name,
    description: ctx.project.description,
    yourRole: ctx.isAdmin ? "ADMIN" : "MEMBER",
    members: ctx.project.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      kind: m.user.kind,
      role: m.role,
    })),
    labels: ctx.project.labels.map((l) => l.name),
    sprints,
  };
}

type IssueParams = { params: Promise<{ issueKey: string }> };

/** Gemeinsamer Rahmen für /issues/:issueKey/…-Routen: Auth, Projektzugriff, JSON-Body. */
export function issueRoute(
  handler: (ctx: ServiceContext, issueKey: string, body: unknown) => Promise<ServiceResult<unknown>>,
  options: { body?: boolean; status?: number } = {}
) {
  return async (request: NextRequest, { params }: IssueParams) => {
    const user = await authenticate(request);
    if (user instanceof NextResponse) return user;
    const { issueKey } = await params;
    const projectKey = projectKeyOf(issueKey);
    const ctx = projectKey ? await contextFor(user, projectKey, "API") : null;
    if (!ctx) return apiError(`Ticket ${issueKey} nicht gefunden.`, 404);

    let body: unknown = undefined;
    if (options.body) {
      body = await readJson(request);
      if (body === INVALID_JSON) return invalidJsonResponse();
    }
    return toResponse(await handler(ctx, issueKey, body), options.status);
  };
}

/** Rahmen für /agent/…-Routen, die am User statt an einem Projekt hängen. */
export function userRoute(
  handler: (user: ApiUser, body: unknown) => Promise<ServiceResult<unknown>>,
  options: { body?: boolean } = {}
) {
  return async (request: NextRequest) => {
    const user = await authenticate(request);
    if (user instanceof NextResponse) return user;
    let body: unknown = undefined;
    if (options.body) {
      // Leerer Body ist erlaubt (alle Felder optional)
      const text = await request.text();
      if (text.trim()) {
        try {
          body = JSON.parse(text);
        } catch {
          return invalidJsonResponse();
        }
      }
    }
    return toResponse(await handler(user, body));
  };
}
