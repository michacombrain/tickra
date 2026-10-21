"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { AuthFormState, changePasswordAction, updateProfileAction } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = [
  "#171717", "#525252", "#2563eb", "#16a34a",
  "#d97706", "#dc2626", "#9333ea", "#0891b2",
];

export function ProfileForm({ name, avatarColor }: { name: string; avatarColor: string }) {
  const [color, setColor] = useState(avatarColor);
  const [preview, setPreview] = useState(name);
  const [state, formAction, pending] = useActionState(
    async (prev: AuthFormState, formData: FormData) => {
      const result = await updateProfileAction(prev, formData);
      if (result?.success) toast.success("Profil gespeichert");
      return result;
    },
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex items-center gap-3">
        <UserAvatar name={preview || "?"} color={color} className="size-10 text-sm" />
        <div className="flex gap-1.5" role="radiogroup" aria-label="Avatar-Farbe">
          {AVATAR_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={color === option}
              aria-label={option}
              onClick={() => setColor(option)}
              className={cn(
                "size-5 rounded-full ring-offset-2 ring-offset-background",
                color === option && "ring-2 ring-foreground"
              )}
              style={{ backgroundColor: option }}
            />
          ))}
        </div>
        <input type="hidden" name="avatarColor" value={color} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          name="name"
          defaultValue={name}
          required
          minLength={2}
          maxLength={60}
          onChange={(e) => setPreview(e.target.value)}
        />
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Wird gespeichert…" : "Speichern"}
      </Button>
    </form>
  );
}

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(
    async (prev: AuthFormState, formData: FormData) => {
      const result = await changePasswordAction(prev, formData);
      if (result?.success) toast.success("Passwort geändert");
      return result;
    },
    undefined
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current-password">Aktuelles Passwort</Label>
        <Input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-password">Neues Passwort</Label>
          <Input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Wiederholen</Label>
          <Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required />
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Wird geändert…" : "Passwort ändern"}
      </Button>
    </form>
  );
}
