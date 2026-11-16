import { userRoute } from "@/lib/api";
import { nextTask } from "@/lib/services/work";

/** Nächste Aufgabe holen und reservieren. Body (optional): { takeover?: boolean, projects?: string[] } */
export const POST = userRoute((user, body) => nextTask(user, body, "API"), { body: true });
