import { relativeTime } from "@/lib/format";
import { AgentTag, UserAvatar } from "@/components/user-avatar";

type Checkpoint = {
  id: string;
  kind: string;
  summary: string;
  nextSteps: string | null;
  createdAt: Date;
  author: { name: string; avatarColor: string; kind: string };
};

const KIND_LABELS: Record<string, string> = {
  LIMIT: "Limit",
  HANDOFF: "Übergabe",
  RUNNER: "Runner",
};

/** Zwischenstände: der neueste ist der Einstiegspunkt für den nächsten Bearbeiter. */
export function CheckpointList({ checkpoints }: { checkpoints: Checkpoint[] }) {
  if (checkpoints.length === 0) return null;
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold">
        Zwischenstände <span className="font-normal text-muted-foreground">{checkpoints.length}</span>
      </h3>
      <ol className="space-y-3">
        {checkpoints.map((checkpoint, index) => (
          <li
            key={checkpoint.id}
            className={index === 0 ? "rounded-lg border p-3" : "border-l-2 pl-3 text-muted-foreground"}
          >
            <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <UserAvatar
                name={checkpoint.author.name}
                color={checkpoint.author.avatarColor}
                kind={checkpoint.author.kind}
                className="size-4 text-[7px]"
              />
              <span className="font-medium text-foreground">{checkpoint.author.name}</span>
              {checkpoint.author.kind === "AGENT" && <AgentTag />}
              {KIND_LABELS[checkpoint.kind] && (
                <span className="rounded border px-1 text-[10px]">{KIND_LABELS[checkpoint.kind]}</span>
              )}
              <span suppressHydrationWarning>· {relativeTime(checkpoint.createdAt)}</span>
              {index === 0 && <span className="ml-auto text-[10px] uppercase tracking-wide">Aktuell</span>}
            </div>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{checkpoint.summary}</p>
            {checkpoint.nextSteps && (
              <div className="mt-2">
                <div className="text-xs font-medium text-muted-foreground">Nächste Schritte</div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{checkpoint.nextSteps}</p>
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
