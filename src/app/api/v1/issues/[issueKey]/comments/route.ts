import { NextRequest, NextResponse } from "next/server";
import { apiError, authenticate, contextFor, projectKeyOf, INVALID_JSON, invalidJsonResponse, readJson, toResponse } from "@/lib/api";
import { addComment } from "@/lib/services/issues";

export async function POST(request: NextRequest, { params }: { params: Promise<{ issueKey: string }> }) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;
  const { issueKey } = await params;
  const projectKey = projectKeyOf(issueKey);
  const ctx = projectKey ? await contextFor(user, projectKey, "API") : null;
  if (!ctx) return apiError(`Ticket ${issueKey} nicht gefunden.`, 404);

  const body = await readJson(request);
  if (body === INVALID_JSON || typeof body !== "object" || body === null) return invalidJsonResponse();
  return toResponse(await addComment(ctx, issueKey, (body as { body?: unknown }).body), 201);
}
