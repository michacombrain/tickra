import { requireUser } from "@/lib/session";
import { PasswordForm, ProfileForm } from "@/components/account-forms";
import { CreatePersonalKeyForm, RevokeKeyButton } from "@/components/agent-forms";
import { db } from "@/lib/db";
import { relativeTime } from "@/lib/format";

export const metadata = { title: "Konto – Tickra" };

export default async function AccountPage() {
  const user = await requireUser();
  const keys = await db.apiKey.findMany({
    where: { userId: user.id, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto w-full max-w-2xl p-4 sm:p-6">
      <div className="mb-8">
        <h1 className="text-lg font-semibold tracking-tight">Konto</h1>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <section className="grid gap-4 pb-8 md:grid-cols-[160px_1fr]">
        <h2 className="text-sm font-semibold">Profil</h2>
        <ProfileForm name={user.name} avatarColor={user.avatarColor} />
      </section>
      <section className="grid gap-4 border-t pt-8 md:grid-cols-[160px_1fr]">
        <h2 className="text-sm font-semibold">Passwort</h2>
        <PasswordForm />
      </section>
      <section className="grid gap-4 border-t pt-8 mt-8 md:grid-cols-[160px_1fr]">
        <div>
          <h2 className="text-sm font-semibold">API-Keys</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Für API und MCP in deinem Namen. Eigene KI-Agenten legst du in den Projekteinstellungen an.
          </p>
        </div>
        <div className="space-y-4">
          {keys.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{key.name}</div>
                    <div className="truncate text-xs text-muted-foreground" suppressHydrationWarning>
                      <span className="font-mono">{key.prefix}_…</span> ·{" "}
                      {key.lastUsedAt ? `zuletzt benutzt ${relativeTime(key.lastUsedAt)}` : "noch nie benutzt"}
                    </div>
                  </div>
                  <RevokeKeyButton keyId={key.id} name={key.name} />
                </li>
              ))}
            </ul>
          )}
          <CreatePersonalKeyForm />
        </div>
      </section>
    </main>
  );
}
