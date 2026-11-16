import { issueRoute } from "@/lib/api";
import { saveCheckpoint } from "@/lib/services/work";

/** Body: { summary, nextSteps?, sessionId?, branch?, kind? } */
export const POST = issueRoute((ctx, issueKey, body) => saveCheckpoint(ctx, issueKey, body), {
  body: true,
  status: 201,
});
