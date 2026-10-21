"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCommentAction, updateCommentAction } from "@/lib/actions/issues";
import { relativeTime } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";

export function CommentItem({
  projectKey,
  comment,
  canEdit,
  canDelete,
}: {
  projectKey: string;
  comment: {
    id: string;
    body: string;
    createdAt: string;
    edited: boolean;
    author: { name: string; avatarColor: string };
  };
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateCommentAction(projectKey, comment.id, draft);
      if (result?.error) toast.error(result.error);
      else setEditing(false);
    });
  }

  return (
    <li className="group flex gap-3">
      <UserAvatar name={comment.author.name} color={comment.author.avatarColor} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-medium">{comment.author.name}</span>
          <time
            className="text-xs text-muted-foreground"
            dateTime={comment.createdAt}
            title={new Date(comment.createdAt).toLocaleString("de-DE")}
            suppressHydrationWarning
          >
            {relativeTime(comment.createdAt)}
          </time>
          {comment.edited && <span className="text-xs text-muted-foreground">(bearbeitet)</span>}
          {!editing && (canEdit || canDelete) && (
            <span className="ml-auto flex gap-2 text-xs text-muted-foreground transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
              {canEdit && (
                <button
                  className="hover:text-foreground"
                  onClick={() => {
                    setDraft(comment.body);
                    setEditing(true);
                  }}
                >
                  Bearbeiten
                </button>
              )}
              {canDelete && (
                <button
                  className="hover:text-destructive"
                  disabled={isPending}
                  onClick={() => {
                    if (!confirm("Kommentar löschen?")) return;
                    startTransition(async () => {
                      const result = await deleteCommentAction(projectKey, comment.id);
                      if (result?.error) toast.error(result.error);
                    });
                  }}
                >
                  Löschen
                </button>
              )}
            </span>
          )}
        </div>
        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && draft.trim()) save();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={isPending || !draft.trim()}>
                Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed">{comment.body}</p>
        )}
      </div>
    </li>
  );
}
