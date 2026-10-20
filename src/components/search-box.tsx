"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "lucide-react";
import { IssueType } from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { TypeIcon } from "@/components/issue-badges";
import { cn } from "@/lib/utils";

type SearchResult = {
  key: string;
  title: string;
  projectKey: string;
  type: string;
};

export function SearchBox() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const trimmed = query.trim();
  const tooShort = trimmed.length < 2;

  useEffect(() => {
    if (tooShort) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          setResults(await res.json());
          setSearchedQuery(trimmed);
          setHighlight(0);
        }
      } catch {
        // abgebrochene Anfrage – neuere Suche läuft bereits
      }
    }, 200);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmed, tooShort]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    // "/" fokussiert die Suche (außer beim Tippen in Feldern)
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (e.key !== "/" || target.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const visibleResults = tooShort ? [] : results;
  const showPanel = open && !tooShort && searchedQuery !== "";

  function go(result: SearchResult) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(`/projects/${result.projectKey}/issues/${result.key}`);
  }

  return (
    <div ref={containerRef} className="relative hidden md:block">
      <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            inputRef.current?.blur();
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, visibleResults.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter" && visibleResults[highlight]) {
            go(visibleResults[highlight]);
          }
        }}
        placeholder="Suchen…"
        className="h-8 w-56 pl-8 pr-8 text-sm lg:w-64"
        aria-label="Tickets suchen"
      />
      <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border px-1 font-mono text-[10px] text-muted-foreground">
        /
      </kbd>
      {showPanel && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-popover p-1 shadow-md">
          {visibleResults.length === 0 ? (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Keine Tickets für „{searchedQuery}“
            </p>
          ) : (
            visibleResults.map((result, index) => (
              <button
                key={result.key}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  index === highlight && "bg-accent"
                )}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => go(result)}
              >
                <TypeIcon type={result.type as IssueType} className="size-3.5" />
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{result.key}</span>
                <span className="truncate">{result.title}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
