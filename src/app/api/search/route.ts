import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);

  const issues = await db.issue.findMany({
    where: {
      project: { members: { some: { userId: session.user.id } } },
      OR: [{ title: { contains: q } }, { key: { contains: q } }],
    },
    select: { key: true, title: true, type: true, project: { select: { key: true } } },
    orderBy: { updatedAt: "desc" },
    take: 8,
  });

  return NextResponse.json(
    issues.map((issue) => ({
      key: issue.key,
      title: issue.title,
      type: issue.type,
      projectKey: issue.project.key,
    }))
  );
}
