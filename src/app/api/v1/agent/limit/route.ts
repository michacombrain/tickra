import { userRoute } from "@/lib/api";
import { clearLimit, reportLimit } from "@/lib/services/work";

/** Nutzungslimit melden. Body: { resetAt?: ISO, resetInMinutes?: number, note?, sessionId? } */
export const POST = userRoute((user, body) => reportLimit(user, body), { body: true });

/** Limit vorzeitig aufheben. */
export const DELETE = userRoute((user) => clearLimit(user.id));
