import { NextRequest, NextResponse } from "next/server";
import { authenticate, listProjectsFor } from "@/lib/api";

export async function GET(request: NextRequest) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;
  return NextResponse.json({ user, projects: await listProjectsFor(user.id) });
}
