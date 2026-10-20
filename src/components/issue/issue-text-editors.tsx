"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateIssueAction } from "@/lib/actions/issues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function IssueTextEditors({
  projectKey,
  issueKey,
  title,
  description,
}: {
  projectKey: string;
  issueKey: string;
  title: string;
  description: string | null;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [titleDraft, setTitleDraft] = useState(title);
  const [descriptionDraft, setDescriptionDraft] = useState(description ?? "");
  const [isPending, startTransition] = useTransition();

  function save(fields: Record<string, unknown>, done: () => void) {
    startTransition(async () => {
      const result = await updateIssueAction(projectKey, issueKey, fields);
      if (result?.error) {
        toast.error(result.error);
      } else {
        done();
      }
    });
  }

  return (
    <div className="space-y-4">
      {editingTitle ? (
        <div className="flex items-center gap-2">
          <Input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            className="h-auto py-1 text-xl font-semibold md:text-xl"
            maxLength={200}
            autoFocus
            onBlur={() => {
              const next = titleDraft.trim();
              if (next && next !== title) save({ title: next }, () => setEditingTitle(false));
              else setEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && titleDraft.trim()) {
                save({ title: titleDraft.trim() }, () => setEditingTitle(false));
              }
              if (e.key === "Escape") {
                e.stopPropagation();
                setTitleDraft(title);
                setEditingTitle(false);
              }
            }}
          />
        </div>
      ) : (
        <h1
          className="-mx-1 cursor-text rounded-md px-1 py-1 text-xl font-semibold tracking-tight hover:bg-accent/60"
          title="Klicken zum Bearbeiten"
          onClick={() => {
            setTitleDraft(title);
            setEditingTitle(true);
          }}
        >
          {title}
        </h1>
      )}

      <div>
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          Beschreibung
        </div>
        {editingDescription ? (
          <div className="space-y-2">
            <Textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              rows={6}
              maxLength={10000}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  save({ description: descriptionDraft.trim() || null }, () => setEditingDescription(false));
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setEditingDescription(false);
                }
              }}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  save({ description: descriptionDraft.trim() || null }, () =>
                    setEditingDescription(false)
                  )
                }
              >
                Speichern
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingDescription(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="-mx-2 min-h-10 cursor-text whitespace-pre-wrap break-words rounded-md p-2 text-sm leading-relaxed hover:bg-accent/60"
            title="Klicken zum Bearbeiten"
            onClick={() => {
              setDescriptionDraft(description ?? "");
              setEditingDescription(true);
            }}
          >
            {description || (
              <span className="text-muted-foreground">Beschreibung hinzufügen…</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
