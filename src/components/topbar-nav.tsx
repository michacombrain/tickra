"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/projects", label: "Projekte" },
  { href: "/my-issues", label: "Meine Tickets" },
];

export function TopbarNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-0.5 text-sm">
      {LINKS.map((link) => {
        // Projektseiten zählen zu "Projekte"
        const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "whitespace-nowrap rounded-md px-2.5 py-1 font-medium transition-colors",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
