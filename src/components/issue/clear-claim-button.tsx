"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { clearClaimAction } from "@/lib/actions/work";
import { Button } from "@/components/ui/button";

export function ClearClaimButton({ projectKey, issueKey }: { projectKey: string; issueKey: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={isPending}
      title="Hebt die Reservierung auf – das Ticket kann dann neu verteilt werden"
      onClick={() =>
        startTransition(async () => {
          const result = await clearClaimAction(projectKey, issueKey);
          if (result?.error) toast.error(result.error);
        })
      }
    >
      Reservierung aufheben
    </Button>
  );
}
