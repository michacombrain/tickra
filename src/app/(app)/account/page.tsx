import { requireUser } from "@/lib/session";
import { PasswordForm, ProfileForm } from "@/components/account-forms";

export const metadata = { title: "Konto – Tickra" };

export default async function AccountPage() {
  const user = await requireUser();

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
    </main>
  );
}
