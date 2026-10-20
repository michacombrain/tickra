"use client";

import { useActionState, useRef } from "react";
import { addCommentAction, FormState } from "@/lib/actions/issues";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CommentForm({
  projectKey,
  issueKey,
}: {
  projectKey: string;
  issueKey: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, pending] = useActionState(
    async (prev: FormState, formData: FormData) => {
      const result = await addCommentAction(projectKey, issueKey, prev, formData);
      if (!result?.error) formRef.current?.reset();
      return result;
    },
    undefined
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <Textarea
        name="body"
        placeholder="Kommentar schreiben…"
        rows={3}
        required
        maxLength={5000}
        onKeyDown={(e) => {
          // Cmd/Strg + Enter sendet ab
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Wird gespeichert…" : "Kommentieren"}
        </Button>
        <span className="text-xs text-muted-foreground">⌘/Strg + Enter</span>
      </div>
    </form>
  );
}
