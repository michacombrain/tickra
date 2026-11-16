import { issueRoute } from "@/lib/api";
import { fail } from "@/lib/services/context";
import { addChecklistItem, setChecklistItem } from "@/lib/services/work";

/** Kriterium hinzufügen. Body: { text } */
export const POST = issueRoute(
  (ctx, issueKey, body) => addChecklistItem(ctx, issueKey, (body as { text?: unknown } | null)?.text),
  { body: true, status: 201 }
);

/** Kriterium abhaken. Body: { item: ID | Position | Text, done: boolean } */
export const PATCH = issueRoute(
  async (ctx, issueKey, body) => {
    const { item, done } = (body ?? {}) as { item?: unknown; done?: unknown };
    if ((typeof item !== "string" && typeof item !== "number") || typeof done !== "boolean") {
      return fail("Erwartet: { item: string | number, done: boolean }");
    }
    return setChecklistItem(ctx, issueKey, item, done);
  },
  { body: true }
);
