import { revalidatePath } from "next/cache";
import type { AccessProject } from "@/lib/access";

/** Wer handelt, in welchem Projekt, über welchen Kanal. */
export type ServiceContext = {
  user: { id: string; name: string; kind: string };
  project: AccessProject;
  isAdmin: boolean;
  via: "UI" | "API" | "MCP";
};

export type ServiceResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: 400 | 403 | 404 | 409 };

export function ok<T>(data: T): ServiceResult<T> {
  return { ok: true, data };
}

export function fail(error: string, status: 400 | 403 | 404 | 409 = 400): ServiceResult<never> {
  return { ok: false, error, status };
}

/** Alle Ansichten eines Projekts neu rendern (auch wenn ein Agent per API geändert hat). */
export function revalidateProject(projectKey: string) {
  revalidatePath(`/projects/${projectKey}`, "layout");
  revalidatePath("/projects");
  revalidatePath("/my-issues");
}
