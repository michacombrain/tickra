import { issueRoute } from "@/lib/api";
import { heartbeat } from "@/lib/services/work";

export const POST = issueRoute((ctx, issueKey) => heartbeat(ctx, issueKey));
