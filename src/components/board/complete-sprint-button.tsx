"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { completeSprintAction } from "@/lib/actions/sprints";
import { Button } from "@/components/ui/button";

export function CompleteSprintButton({
  projectKey,
  sprintId,
  openCount,
}: {
  projectKey: string;
  sprintId: string;
  openCount: number;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        const message =
          openCount > 0
            ? `Sprint abschließen? ${openCount} offene${openCount === 1 ? "s Ticket wandert" : " Tickets wandern"} zurück ins Backlog.`
            : "Sprint abschließen?";
        if (!confirm(message)) return;
        startTransition(async () => {
          const result = await completeSprintAction(projectKey, sprintId);
          if (result?.error) toast.error(result.error);
          else toast.success("Sprint abgeschlossen");
        });
      }}
    >
      Sprint abschließen
    </Button>
  );
}
