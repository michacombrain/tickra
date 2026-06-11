"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";

export type AuthFormState = { error?: string } | undefined;

const AVATAR_COLORS = [
  "#2563eb", "#16a34a", "#d97706", "#dc2626",
  "#9333ea", "#0891b2", "#db2777", "#65a30d",
];

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/projects",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "E-Mail oder Passwort ist falsch." };
    }
    throw error;
  }
}

const registerSchema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen haben."),
  email: z.string().email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: z.string().min(8, "Passwort muss mindestens 8 Zeichen haben."),
});

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const existing = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return { error: "Diese E-Mail-Adresse ist bereits registriert." };
  }

  await db.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      avatarColor: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
    },
  });

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/projects",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Konto erstellt, aber Anmeldung fehlgeschlagen. Bitte einloggen." };
    }
    throw error;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
