import { NextRequest, NextResponse } from "next/server";
import { apiError, authenticate, contextFor, INVALID_JSON, invalidJsonResponse, readJson, toResponse } from "@/lib/api";
import { createIssue, listIssues } from "@/lib/services/issues";

type Params = { params: Promise<{ key: string }> };

/** GET ?status=&state=open|all&assignee=me|unassigned|…&sprint=active|backlog|…&type=&query=&limit= */
export async function GET(request: NextRequest, { params }: Params) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;
  const ctx = await contextFor(user, (await params).key, "API");
  if (!ctx) return apiError("Projekt nicht gefunden.", 404);

  const search = request.nextUrl.searchParams;
  const get = (name: string) => search.get(name) ?? undefined;
  const limit = get("limit");
  return toResponse(
    await listIssues(ctx, {
      status: get("status") as never,
      state: get("state") as never,
      assignee: get("assignee"),
      sprint: get("sprint"),
      type: get("type") as never,
      query: get("query"),
      limit: limit ? Number(limit) : undefined,
    })
  );
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;
  const ctx = await contextFor(user, (await params).key, "API");
  if (!ctx) return apiError("Projekt nicht gefunden.", 404);
  const body = await readJson(request);
  if (body === INVALID_JSON) return invalidJsonResponse();
  return toResponse(await createIssue(ctx, body), 201);
}
