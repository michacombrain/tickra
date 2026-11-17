"use client";

import { useOptimistic, useState, useTransition } from "react";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import {
  addChecklistItemAction,
  deleteChecklistItemAction,
  setChecklistItemAction,
} from "@/lib/actions/work";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

type Item = { id: string; text: string; done: boolean };

export function Checklist({
  projectKey,
  issueKey,
  items,
}: {
  projectKey: string;
  issueKey: string;
  items: Item[];
}) {
  const [text, setText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [optimistic, toggleOptimistic] = useOptimistic(items, (state, id: string) =>
    state.map((item) => (item.id === id ? { ...item, done: !item.done } : item))
  );
  const doneCount = optimistic.filter((item) => item.done).length;

  function run(action: () => Promise<{ error?: string } | undefined>, before?: () => void) {
    startTransition(async () => {
      before?.();
      const result = await action();
      if (result?.error) toast.error(result.error);
    });
  }

  function add() {
    const value = text.trim();
    if (!value || isPending) return;
    setText("");
    run(() => addChecklistItemAction(projectKey, issueKey, value));
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold">Akzeptanzkriterien</h3>
        {optimistic.length > 0 && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {doneCount}/{optimistic.length}
          </span>
        )}
      </div>
      {optimistic.length > 0 && (
        <ul className="mb-2 space-y-0.5">
          {optimistic.map((item) => (
            <li key={item.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-muted/50">
              <input
                type="checkbox"
                checked={item.done}
                onChange={() =>
                  run(
                    () => setChecklistItemAction(projectKey, issueKey, item.id, !item.done),
                    () => toggleOptimistic(item.id)
                  )
                }
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-foreground"
                aria-label={item.text}
              />
              <span className={cn("min-w-0 flex-1 text-sm", item.done && "text-muted-foreground line-through")}>
                {item.text}
              </span>
              <button
                className="shrink-0 text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
                aria-label={`Kriterium "${item.text}" löschen`}
                onClick={() => run(() => deleteChecklistItemAction(projectKey, issueKey, item.id))}
              >
                <XIcon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2 px-1">
        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
          placeholder={optimistic.length ? "Kriterium hinzufügen…" : "Woran erkennt man, dass es fertig ist?"}
          maxLength={300}
          className="h-7 border-transparent bg-transparent px-1 text-sm shadow-none focus-visible:border-input dark:bg-transparent"
        />
      </div>
    </div>
  );
}
