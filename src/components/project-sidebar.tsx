"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KanbanSquareIcon, ListTodoIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useCreateIssue } from "@/components/issue/create-issue-dialog";

function projectLinks(projectKey: string) {
  return [
    { href: `/projects/${projectKey}/board`, label: "Board", icon: KanbanSquareIcon },
    { href: `/projects/${projectKey}/backlog`, label: "Backlog", icon: ListTodoIcon },
    { href: `/projects/${projectKey}/settings`, label: "Einstellungen", icon: SettingsIcon },
  ];
}

export function ProjectSidebar({
  projectKey,
  projectName,
}: {
  projectKey: string;
  projectName: string;
}) {
  const pathname = usePathname();
  const openCreateIssue = useCreateIssue();

  return (
    <aside className="sticky top-12 hidden h-[calc(100vh-3rem)] w-52 shrink-0 flex-col border-r px-3 py-4 md:flex">
      <div className="mb-4 flex items-center gap-2 px-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border font-mono text-[10px] font-semibold">
          {projectKey.slice(0, 3)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={projectName}>{projectName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{projectKey}</div>
        </div>
      </div>
      <Button size="sm" variant="outline" className="mb-4 justify-start" onClick={() => openCreateIssue()}>
        <PlusIcon />
        Ticket erstellen
        <kbd className="ml-auto font-mono text-[10px] text-muted-foreground">C</kbd>
      </Button>
      <nav className="space-y-0.5">
        {projectLinks(projectKey).map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
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

/** Ersatz für die Sidebar auf kleinen Bildschirmen. */
export function ProjectMobileNav({
  projectKey,
  projectName,
}: {
  projectKey: string;
  projectName: string;
}) {
  const pathname = usePathname();
  const openCreateIssue = useCreateIssue();

  return (
    <div className="border-b px-3 pt-3 md:hidden">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold">
          {projectName} <span className="font-mono text-xs font-normal text-muted-foreground">{projectKey}</span>
        </div>
        <Button size="icon-sm" variant="outline" onClick={() => openCreateIssue()} aria-label="Ticket erstellen">
          <PlusIcon />
        </Button>
      </div>
      <nav className="-mb-px flex gap-4 text-sm">
        {projectLinks(projectKey).map((link) => {
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "border-b-2 pb-2 transition-colors",
                active
                  ? "border-foreground font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
