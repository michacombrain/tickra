"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateIssueAction } from "@/lib/actions/issues";
import { clearAgentLimitAction } from "@/lib/actions/work";
import { Button } from "@/components/ui/button";

function useRun() {
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<{ error?: string } | undefined>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result?.error) toast.error(result.error);
      else if (success) toast.success(success);
    });
  }
  return [isPending, run] as const;
}

export function ClearLimitButton({ projectKey, agentId }: { projectKey: string; agentId: string }) {
  const [isPending, run] = useRun();
  return (
    <Button
      size="xs"
      variant="outline"
      disabled={isPending}
      title="Nutzen, wenn das Limit früher zurückgesetzt wurde"
      onClick={() => run(() => clearAgentLimitAction(projectKey, agentId), "Pause aufgehoben")}
    >
      Pause aufheben
    </Button>
  );
}

/** Freigabe-Gate: Nur Menschen setzen ein Ticket auf "Fertig". */
export function ReviewButtons({ projectKey, issueKey }: { projectKey: string; issueKey: string }) {
  const [isPending, run] = useRun();
  return (
    <span className="flex shrink-0 gap-1.5">
      <Button
        size="xs"
        variant="outline"
        disabled={isPending}
        title="Zurück in die Warteschlange – ein Agent bessert nach (vorher Hinweise als Kommentar hinterlassen)"
        onClick={() =>
          run(
            () => updateIssueAction(projectKey, issueKey, { status: "TODO", assigneeId: null }),
            `${issueKey} geht zurück an die Agenten`
          )
        }
      >
        Nachbessern
      </Button>
      <Button
        size="xs"
        disabled={isPending}
        onClick={() => run(() => updateIssueAction(projectKey, issueKey, { status: "DONE" }), `${issueKey} freigegeben`)}
      >
        Freigeben
      </Button>
    </span>
  );
}
