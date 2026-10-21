"use client";

import { useDroppable } from "@dnd-kit/core";
import { IssueStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { StatusIcon } from "@/components/issue-badges";

export function BoardColumn({
  status,
  label,
  count,
  children,
  footer,
}: {
  status: IssueStatus;
  label: string;
  count: number;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[240px] flex-col rounded-xl bg-muted/50 p-2 transition-colors",
        isOver && "bg-muted ring-1 ring-foreground/15"
      )}
    >
      <div className="mb-2 flex items-center gap-2 px-1.5 py-1 text-xs font-medium text-muted-foreground">
        <StatusIcon status={status} />
        <span className="text-foreground">{label}</span>
        <span className="tabular-nums">{count}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {children}
        {count === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed p-4 text-xs text-muted-foreground">
            Hierher ziehen
          </div>
        )}
      </div>
      {footer}
    </div>
  );
}
