import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

/** Liefert den eingeloggten User oder leitet auf /login um. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // JWT kann einen inzwischen gelöschten User referenzieren (z.B. nach DB-Reset)
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, avatarColor: true, kind: true },
  });
  if (!user || user.kind !== "HUMAN") redirect("/login");
  return user;
}
