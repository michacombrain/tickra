import { requireUser } from "@/lib/session";
import { db } from "@/lib/db";
import { Topbar } from "@/components/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await requireUser();
  const user = await db.user.findUniqueOrThrow({
    where: { id: sessionUser.id },
    select: { name: true, email: true, avatarColor: true },
  });

  return (
    <div className="flex min-h-screen flex-col">
      <Topbar user={user} />
      <div className="flex flex-1">{children}</div>
    </div>
  );
}
