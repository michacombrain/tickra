"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KanbanSquareIcon, ListTodoIcon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProjectSidebar({
  projectKey,
  projectName,
}: {
  projectKey: string;
  projectName: string;
}) {
  const pathname = usePathname();

  const links = [
    { href: `/projects/${projectKey}/board`, label: "Board", icon: KanbanSquareIcon },
    { href: `/projects/${projectKey}/backlog`, label: "Backlog", icon: ListTodoIcon },
    { href: `/projects/${projectKey}/settings`, label: "Einstellungen", icon: SettingsIcon },
  ];

  return (
    <aside className="hidden w-56 shrink-0 border-r bg-muted/30 p-4 md:block">
      <div className="mb-4 px-2">
        <div className="text-xs font-medium uppercase text-muted-foreground">Projekt</div>
        <div className="truncate font-semibold" title={projectName}>{projectName}</div>
      </div>
      <nav className="space-y-1">
        {links.map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <link.icon className="size-4" />
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
