import Link from "next/link";
import { UserMenu } from "@/components/user-menu";
import { SearchBox } from "@/components/search-box";

export function Topbar({
  user,
}: {
  user: { name: string; email: string; avatarColor: string };
}) {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4">
      <Link href="/projects" className="flex items-center gap-2 font-bold tracking-tight">
        <span className="flex size-7 items-center justify-center rounded bg-blue-600 text-sm font-bold text-white">
          T
        </span>
        Tickra
      </Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link
          href="/projects"
          className="rounded px-3 py-1.5 font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Projekte
        </Link>
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <SearchBox />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
