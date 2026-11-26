import { purgeRateLimits } from "@/server/auth/rate-limit";
import { purgeExpiredSessions } from "@/server/auth/session";
import { env } from "@/server/env";
import { handleRoute, hasBearerSecret } from "@/server/http";
import { dispatchDueEmails } from "@/server/services/email-queue";

export const maxDuration = 300;

/** Vercel Cron: send queued/retrying emails and purge expired sessions and rate-limit windows. */
export async function GET(request: Request): Promise<Response> {
  if (!hasBearerSecret(request, env().CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleRoute("cronEmails", async () => {
    const emails = await dispatchDueEmails(200);
    const [sessions, rateLimits] = await Promise.all([purgeExpiredSessions(), purgeRateLimits()]);
    return Response.json({ emails, purged: { sessions, rateLimits } });
  });
}
