"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  createAgentAction,
  createPersonalKeyAction,
  KeyResult,
  regenerateAgentKeyAction,
  removeAgentAction,
  revokePersonalKeyAction,
} from "@/lib/actions/agents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Origin der laufenden App (für die MCP-URL) – auf dem Server leer. */
function useOrigin() {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );
}

function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-md border bg-muted/50 px-2.5 py-2 font-mono text-xs">
          {value}
        </code>
        <Button
          size="icon-sm"
          variant="outline"
          aria-label={`${label} kopieren`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </Button>
      </div>
    </div>
  );
}

/** Zeigt einen frisch erzeugten Key genau einmal – mit fertigem Befehl für Claude Code. */
function KeyRevealDialog({ token, onClose }: { token: string | null; onClose: () => void }) {
  const origin = useOrigin();
  const command = `claude mcp add --transport http tickra ${origin}/api/mcp --header "Authorization: Bearer ${token}"`;
  return (
    <Dialog open={token !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>API-Key erstellt</DialogTitle>
          <DialogDescription>
            Kopiere den Key jetzt – er wird aus Sicherheitsgründen nicht noch einmal angezeigt.
          </DialogDescription>
        </DialogHeader>
        {token && (
          <div className="space-y-4">
            <CopyField label="API-Key" value={token} />
            <CopyField label="Mit Claude Code verbinden (MCP)" value={command} />
            <p className="text-xs text-muted-foreground">
              REST-API: <code className="font-mono">{origin}/api/v1</code> mit Header{" "}
              <code className="font-mono">Authorization: Bearer …</code>
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useKeyAction() {
  const [token, setToken] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  function run(action: () => Promise<KeyResult>, success?: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(result.error);
      else if (result.token) setToken(result.token);
      else if (success) toast.success(success);
    });
  }
  const dialog = <KeyRevealDialog token={token} onClose={() => setToken(null)} />;
  return { run, isPending, dialog };
}

export function CreateAgentForm({ projectKey }: { projectKey: string }) {
  const [name, setName] = useState("");
  const { run, isPending, dialog } = useKeyAction();
  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createAgentAction(projectKey, name);
            if (!result.error) setName("");
            return result;
          });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name des Agenten, z.B. Claude"
          required
          minLength={2}
          maxLength={40}
          className="h-8"
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending} className="h-8">
          <PlusIcon />
          Agent anlegen
        </Button>
      </form>
      {dialog}
    </>
  );
}

export function AgentKeyButtons({ projectKey, agentId, name }: { projectKey: string; agentId: string; name: string }) {
  const { run, isPending, dialog } = useKeyAction();
  return (
    <>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground"
        disabled={isPending}
        title="Neuen Key erzeugen"
        aria-label={`Neuen Key für ${name} erzeugen`}
        onClick={() => {
          if (!confirm(`Neuen Key für ${name} erzeugen? Der alte Key funktioniert dann nicht mehr.`)) return;
          run(() => regenerateAgentKeyAction(projectKey, agentId));
        }}
      >
        <KeyRoundIcon />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        className="text-muted-foreground hover:text-destructive"
        disabled={isPending}
        title="Agent entfernen"
        aria-label={`${name} entfernen`}
        onClick={() => {
          if (!confirm(`${name} aus dem Projekt entfernen? Seine Tickets werden freigegeben, der Verlauf bleibt erhalten.`)) return;
          run(() => removeAgentAction(projectKey, agentId), `${name} entfernt`);
        }}
      >
        <Trash2Icon />
      </Button>
      {dialog}
    </>
  );
}

export function CreatePersonalKeyForm() {
  const [name, setName] = useState("");
  const { run, isPending, dialog } = useKeyAction();
  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await createPersonalKeyAction(name);
            if (!result.error) setName("");
            return result;
          });
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wofür? z.B. Claude Code Laptop"
          required
          minLength={2}
          maxLength={40}
          className="h-8"
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending} className="h-8">
          Key erstellen
        </Button>
      </form>
      {dialog}
    </>
  );
}

export function RevokeKeyButton({ keyId, name }: { keyId: string; name: string }) {
  const { run, isPending } = useKeyAction();
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground hover:text-destructive"
      disabled={isPending}
      onClick={() => {
        if (!confirm(`Key "${name}" sperren? Verbundene Tools verlieren sofort den Zugriff.`)) return;
        run(() => revokePersonalKeyAction(keyId), "Key gesperrt");
      }}
    >
      Sperren
    </Button>
  );
}
