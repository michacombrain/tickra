import { BotIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Menschen: runde Initialen. KI-Agenten: eckig mit Bot-Symbol – auf einen Blick unterscheidbar. */
export function UserAvatar({
  name,
  color,
  kind = "HUMAN",
  className,
  title,
}: {
  name: string;
  color: string;
  kind?: string;
  className?: string;
  title?: string;
}) {
  const isAgent = kind === "AGENT";
  return (
    <span
      title={title ?? (isAgent ? `${name} (KI-Agent)` : name)}
      className={cn(
        "inline-flex size-7 shrink-0 select-none items-center justify-center text-[11px] font-semibold text-white",
        isAgent ? "rounded-md bg-foreground text-background" : "rounded-full",
        className
      )}
      style={isAgent ? undefined : { backgroundColor: color }}
    >
      {isAgent ? <BotIcon className="size-[60%]" /> : initials(name)}
    </span>
  );
}

export function AgentTag() {
  return (
    <span className="inline-flex h-4 items-center rounded border px-1 text-[10px] font-medium text-muted-foreground">
      KI
    </span>
  );
}
