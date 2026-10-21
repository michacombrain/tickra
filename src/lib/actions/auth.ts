"use server";

import { AuthError } from "next-auth";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export type AuthFormState = { error?: string; success?: boolean } | undefined;

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

const nameSchema = z.string().trim().min(2, "Name muss mindestens 2 Zeichen haben.").max(60);
const passwordSchema = z
  .string()
  .min(8, "Passwort muss mindestens 8 Zeichen haben.")
  .max(100, "Passwort ist zu lang.");

const registerSchema = z.object({
  name: nameSchema,
  email: z.string().trim().toLowerCase().email("Bitte eine gültige E-Mail-Adresse angeben."),
  password: passwordSchema,
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

export async function updateProfileAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const user = await requireUser();
  const name = nameSchema.safeParse(formData.get("name"));
  if (!name.success) return { error: name.error.issues[0].message };

  const color = z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .safeParse(formData.get("avatarColor"));

  await db.user.update({
    where: { id: user.id },
    data: { name: name.data, ...(color.success ? { avatarColor: color.data } : {}) },
  });
  revalidatePath("/", "layout");
  return { success: true };
}

export async function changePasswordAction(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const sessionUser = await requireUser();
  const current = String(formData.get("currentPassword") ?? "");
  const next = passwordSchema.safeParse(formData.get("newPassword"));
  if (!next.success) return { error: next.error.issues[0].message };
  if (next.data !== formData.get("confirmPassword")) {
    return { error: "Die neuen Passwörter stimmen nicht überein." };
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: sessionUser.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    return { error: "Das aktuelle Passwort ist falsch." };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next.data, 10) },
  });
  return { success: true };
}
