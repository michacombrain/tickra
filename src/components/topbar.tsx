import Link from "next/link";
import { UserMenu } from "@/components/user-menu";
import { SearchBox } from "@/components/search-box";
import { TopbarNav } from "@/components/topbar-nav";

export function Topbar({
  user,
}: {
  user: { name: string; email: string; avatarColor: string };
}) {
  return (
    <header className="sticky top-0 z-40 flex h-12 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur sm:gap-4 sm:px-4">
      <Link href="/projects" className="flex items-center gap-2 text-sm font-semibold tracking-tight">
        <span className="flex size-6 items-center justify-center rounded-md bg-foreground text-xs font-bold text-background">
          T
        </span>
        <span className="hidden sm:inline">Tickra</span>
      </Link>
      <TopbarNav />
      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <SearchBox />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
