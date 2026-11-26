import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

/** Liveness + database connectivity. Reveals no configuration details. */
export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
