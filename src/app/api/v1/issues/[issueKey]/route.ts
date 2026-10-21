import { NextRequest, NextResponse } from "next/server";
import { apiError, authenticate, contextFor, projectKeyOf, INVALID_JSON, invalidJsonResponse, readJson, toResponse } from "@/lib/api";
import { getIssue, updateIssue } from "@/lib/services/issues";

type Params = { params: Promise<{ issueKey: string }> };

async function issueContext(request: NextRequest, params: Params["params"]) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return { response: user };
  const { issueKey } = await params;
  const projectKey = projectKeyOf(issueKey);
  const ctx = projectKey ? await contextFor(user, projectKey, "API") : null;
  if (!ctx) return { response: apiError(`Ticket ${issueKey} nicht gefunden.`, 404) };
  return { ctx, issueKey };
}

export async function GET(request: NextRequest, { params }: Params) {
  const { ctx, issueKey, response } = await issueContext(request, params);
  if (response) return response;
  return toResponse(await getIssue(ctx, issueKey));
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { ctx, issueKey, response } = await issueContext(request, params);
  if (response) return response;
  const body = await readJson(request);
  if (body === INVALID_JSON) return invalidJsonResponse();
  return toResponse(await updateIssue(ctx, issueKey, body));
}
