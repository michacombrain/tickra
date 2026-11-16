import { BotIcon, CirclePauseIcon, TriangleAlertIcon } from "lucide-react";
import { relativeTime } from "@/lib/format";
import type { WorkState } from "@/lib/services/claim";
import { cn } from "@/lib/utils";

type Work = { state: WorkState; by: { name: string; kind: string } | null; until: Date | string | null };

const timeFormat = new Intl.DateTimeFormat("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });

export function describeWork(work: Work) {
  const until = work.until ? timeFormat.format(new Date(work.until)) : "";
  switch (work.state) {
    case "RUNNING":
      return `${work.by?.name} arbeitet daran`;
    case "PAUSED":
      return `Pausiert bis ${until} – Nutzungslimit von ${work.by?.name}`;
    case "STALLED":
      return `Unterbrochen – kein Lebenszeichen von ${work.by?.name}${
        work.until ? ` seit ${relativeTime(work.until).replace(/^vor /, "")}` : ""
      }`;
    default:
      return "";
  }
}

/** Kleines Symbol für Board-Karten und Listen. */
export function WorkIcon({
  work,
  queued = false,
  className,
}: {
  work: Work;
  /** Für Agenten freigegeben, aber noch nicht begonnen */
  queued?: boolean;
  className?: string;
}) {
  if (work.state === "FREE") {
    return queued ? (
      <span title="Für Agenten freigegeben – wartet auf Verteilung" className="inline-flex shrink-0">
        <BotIcon className={cn("size-3.5 text-muted-foreground/60", className)} />
      </span>
    ) : null;
  }
  const Icon = work.state === "RUNNING" ? BotIcon : work.state === "PAUSED" ? CirclePauseIcon : TriangleAlertIcon;
  return (
    <span title={describeWork(work)} className="inline-flex shrink-0" suppressHydrationWarning>
      <Icon
        className={cn(
          "size-3.5",
          work.state === "RUNNING" && "animate-pulse text-foreground",
          work.state === "PAUSED" && "text-muted-foreground",
          work.state === "STALLED" && "text-orange-600 dark:text-orange-400",
          className
        )}
      />
    </span>
  );
}

/** Hinweiszeile in der Ticket-Ansicht. */
export function WorkBanner({ work, children }: { work: Work; children?: React.ReactNode }) {
  if (work.state === "FREE") return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        work.state === "STALLED" && "border-orange-600/30"
      )}
    >
      <WorkIcon work={work} />
      <span className="min-w-0 flex-1" suppressHydrationWarning>
        {describeWork(work)}
        {work.state !== "RUNNING" && (
          <span className="text-muted-foreground">
            {" "}
            · Zwischenstände bleiben erhalten{work.state === "STALLED" ? ", ein anderer Agent kann übernehmen" : ""}
          </span>
        )}
      </span>
      {children}
    </div>
  );
}
