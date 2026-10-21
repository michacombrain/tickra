import {
  IssuePriority,
  IssueStatus,
  IssueType,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/constants";
import { relativeTime } from "@/lib/format";
import { parseDetails } from "@/lib/services/activity";
import { AgentTag, UserAvatar } from "@/components/user-avatar";

type ActivityEntry = {
  id: string;
  action: string;
  details: string | null;
  via: string;
  createdAt: Date;
  actor: { name: string; avatarColor: string; kind: string };
};

type Change = { field: string; from: unknown; to: unknown };

const FIELD_LABELS: Record<string, string> = {
  title: "Titel",
  description: "Beschreibung",
  status: "Status",
  priority: "Priorität",
  type: "Typ",
  assignee: "Zuweisung",
  sprint: "Sprint",
  storyPoints: "Story Points",
  dueDate: "Fälligkeit",
  labels: "Labels",
};

function formatValue(field: string, value: unknown) {
  if (field === "sprint" && value === null) return "Backlog";
  if (value === null || value === undefined || (Array.isArray(value) && value.length === 0)) return "–";
  if (Array.isArray(value)) return value.join(", ");
  if (field === "status") return STATUS_LABELS[value as IssueStatus] ?? String(value);
  if (field === "priority") return PRIORITY_LABELS[value as IssuePriority] ?? String(value);
  if (field === "type") return TYPE_LABELS[value as IssueType] ?? String(value);
  return String(value);
}

function describe(entry: ActivityEntry): React.ReactNode[] {
  const details = parseDetails(entry.details);
  switch (entry.action) {
    case "issue.created":
      return ["hat das Ticket erstellt"];
    case "comment.added":
      return ["hat kommentiert"];
    case "issue.updated": {
      const changes = (details.changes as Change[] | undefined) ?? [];
      return changes.map((change) =>
        change.field === "description" ? (
          "hat die Beschreibung geändert"
        ) : (
          <>
            hat {FIELD_LABELS[change.field] ?? change.field}{" "}
            <span className="text-muted-foreground line-through decoration-muted-foreground/50">
              {formatValue(change.field, change.from)}
            </span>{" "}
            → <span className="font-medium text-foreground">{formatValue(change.field, change.to)}</span>
          </>
        )
      );
    }
    default:
      return [entry.action];
  }
}

export function ActivityList({ entries }: { entries: ActivityEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Noch keine Änderungen protokolliert.</p>;
  }

  return (
    <ol className="space-y-2.5">
      {entries.flatMap((entry) =>
        describe(entry).map((line, index) => (
          <li key={`${entry.id}-${index}`} className="flex items-start gap-2 text-xs">
            <UserAvatar
              name={entry.actor.name}
              color={entry.actor.avatarColor}
              kind={entry.actor.kind}
              className="mt-px size-4 text-[7px]"
            />
            <div className="min-w-0 flex-1 leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground">{entry.actor.name}</span>{" "}
              {entry.actor.kind === "AGENT" && <AgentTag />} {line}
              <span className="whitespace-nowrap" suppressHydrationWarning>
                {" · "}
                {relativeTime(entry.createdAt)}
                {entry.via !== "UI" && ` · via ${entry.via}`}
              </span>
            </div>
          </li>
        ))
      )}
    </ol>
  );
}
