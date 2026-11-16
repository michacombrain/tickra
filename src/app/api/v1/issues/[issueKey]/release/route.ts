import { issueRoute } from "@/lib/api";
import { releaseIssue } from "@/lib/services/work";

/** Body: { reason, needsHuman? } */
export const POST = issueRoute((ctx, issueKey, body) => releaseIssue(ctx, issueKey, body), { body: true });
