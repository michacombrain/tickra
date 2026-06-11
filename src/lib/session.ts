import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Liefert den eingeloggten User oder leitet auf /login um. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return { id: session.user.id, name: session.user.name ?? "", email: session.user.email ?? "" };
}
