import { NextRequest, NextResponse } from "next/server";
import { apiError, authenticate, contextFor, describeProject } from "@/lib/api";

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;
  const ctx = await contextFor(user, (await params).key, "API");
  if (!ctx) return apiError("Projekt nicht gefunden.", 404);
  return NextResponse.json(await describeProject(ctx));
}
