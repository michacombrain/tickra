import {
  BookmarkIcon,
  BugIcon,
  CalendarIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  ChevronUpIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleIcon,
  EqualIcon,
  ZapIcon,
} from "lucide-react";
import {
  IssuePriority,
  IssueStatus,
  IssueType,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
} from "@/lib/constants";
import { daysUntil, shortDateFormat } from "@/lib/format";
import { cn } from "@/lib/utils";

// Bewusst zurückhaltend: Farbe nur dort, wo sie Bedeutung trägt (Bugs, hohe Priorität, Fertig)
const TYPE_ICONS = {
  STORY: BookmarkIcon,
  TASK: CheckSquareIcon,
  BUG: BugIcon,
  EPIC: ZapIcon,
} as const;

export function TypeIcon({ type, className }: { type: IssueType; className?: string }) {
  const Icon = TYPE_ICONS[type] ?? CheckSquareIcon;
  return (
    <Icon
      className={cn(
        "size-4 shrink-0",
        type === "BUG" ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
        className
      )}
      aria-label={TYPE_LABELS[type]}
    >
      <title>{TYPE_LABELS[type]}</title>
    </Icon>
  );
}

const PRIORITY_ICONS = {
  HIGHEST: ChevronsUpIcon,
  HIGH: ChevronUpIcon,
  MEDIUM: EqualIcon,
  LOW: ChevronDownIcon,
  LOWEST: ChevronsDownIcon,
} as const;

export function PriorityIcon({
  priority,
  className,
}: {
  priority: IssuePriority;
  className?: string;
}) {
  const Icon = PRIORITY_ICONS[priority] ?? EqualIcon;
  return (
    <Icon
      className={cn(
        "size-4 shrink-0",
        priority === "HIGHEST" || priority === "HIGH"
          ? "text-orange-600 dark:text-orange-400"
          : "text-muted-foreground",
        className
      )}
      aria-label={PRIORITY_LABELS[priority]}
    >
      <title>{`Priorität: ${PRIORITY_LABELS[priority]}`}</title>
    </Icon>
  );
}

const STATUS_ICONS = {
  TODO: CircleIcon,
  IN_PROGRESS: CircleDashedIcon,
  IN_REVIEW: CircleDotIcon,
  DONE: CircleCheckIcon,
} as const;

export function StatusIcon({ status, className }: { status: IssueStatus; className?: string }) {
  const Icon = STATUS_ICONS[status] ?? CircleIcon;
  return (
    <Icon
      className={cn(
        "size-3.5 shrink-0",
        status === "DONE" ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
        className
      )}
    />
  );
}

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium">
      <StatusIcon status={status} />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function LabelBadge({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium text-foreground/80">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: color }} />
      {name}
    </span>
  );
}

export function StoryPoints({ points }: { points: number | null }) {
  if (points == null) return null;
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[11px] font-medium tabular-nums text-muted-foreground"
      title={`${points} Story Points`}
    >
      {points}
    </span>
  );
}

export function DueDate({ date, done = false }: { date: Date | string | null; done?: boolean }) {
  if (!date) return null;
  const days = daysUntil(date);
  const overdue = !done && days < 0;
  const soon = !done && days >= 0 && days <= 2;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1 text-[11px] font-medium tabular-nums",
        overdue ? "text-red-600 dark:text-red-400" : soon ? "text-foreground" : "text-muted-foreground"
      )}
      title={overdue ? "Überfällig" : "Fällig"}
    >
      <CalendarIcon className="size-3" />
      {shortDateFormat.format(new Date(date))}
    </span>
  );
}
