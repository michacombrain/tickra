import { userRoute } from "@/lib/api";
import { agentStatus } from "@/lib/services/work";

/** Eigener Status: Limit, reservierte Tickets. */
export const GET = userRoute((user) => agentStatus(user));
