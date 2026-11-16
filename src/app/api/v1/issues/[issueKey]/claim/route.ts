import { issueRoute } from "@/lib/api";
import { claimIssue } from "@/lib/services/work";

export const POST = issueRoute((ctx, issueKey) => claimIssue(ctx, issueKey));
