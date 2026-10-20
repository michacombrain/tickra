import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Bereits eingeloggt → direkt zu den Projekten (nur wenn der User noch existiert, sonst Redirect-Schleife)
  const session = await auth();
  if (session?.user?.id) {
    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } });
    if (user) redirect("/projects");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex size-9 items-center justify-center rounded-lg bg-foreground text-sm font-bold text-background">
            T
          </span>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Tickra</h1>
            <p className="text-sm text-muted-foreground">Projektmanagement für dein Team</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
