import { issueRoute } from "@/lib/api";
import { submitForReview } from "@/lib/services/work";

/** Body: { summary, prUrl?, branch? } */
export const POST = issueRoute((ctx, issueKey, body) => submitForReview(ctx, issueKey, body), { body: true });
