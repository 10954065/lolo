import "server-only";
import { sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";

/**
 * The database clock. Every time-sensitive decision (ballot lock, voting window) uses this
 * single clock so application servers with skewed clocks cannot disagree.
 */
export async function dbNow(executor: Executor): Promise<Date> {
  const result = await executor.execute<{ now: Date | string }>(sql`SELECT now() AS now`);
  const value = result.rows[0].now;
  return value instanceof Date ? value : new Date(value);
}
