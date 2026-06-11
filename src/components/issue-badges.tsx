import {
  AlertOctagonIcon,
  BookmarkIcon,
  BugIcon,
  CheckSquareIcon,
  ChevronDownIcon,
  ChevronsDownIcon,
  ChevronsUpIcon,
  ChevronUpIcon,
  MinusIcon,
  ZapIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  IssuePriority,
  IssueStatus,
  IssueType,
  PRIORITY_COLORS,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TYPE_COLORS,
  TYPE_LABELS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

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
      className={cn("size-4 shrink-0", className)}
      style={{ color: TYPE_COLORS[type] }}
      aria-label={TYPE_LABELS[type]}
    />
  );
}

const PRIORITY_ICONS = {
  HIGHEST: ChevronsUpIcon,
  HIGH: ChevronUpIcon,
  MEDIUM: MinusIcon,
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
  const Icon = PRIORITY_ICONS[priority] ?? AlertOctagonIcon;
  return (
    <Icon
      className={cn("size-4 shrink-0", className)}
      style={{ color: PRIORITY_COLORS[priority] }}
      aria-label={PRIORITY_LABELS[priority]}
    />
  );
}

const STATUS_STYLES: Record<IssueStatus, string> = {
  TODO: "bg-muted text-muted-foreground",
  IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  IN_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  DONE: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <Badge variant="secondary" className={cn("font-medium", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function LabelBadge({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
      style={{ backgroundColor: color }}
    >
      {name}
    </span>
  );
}
