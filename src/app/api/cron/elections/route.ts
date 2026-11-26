import { env } from "@/server/env";
import { handleRoute, hasBearerSecret } from "@/server/http";
import { syncElectionStatuses } from "@/server/services/elections";

export const maxDuration = 300;

/** Vercel Cron: persist scheduled opening/closing transitions (votes never depend on this). */
export async function GET(request: Request): Promise<Response> {
  if (!hasBearerSecret(request, env().CRON_SECRET)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleRoute("cronElections", async () => Response.json(await syncElectionStatuses()));
}
