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

/**
 * The database wall clock at this instant (clock_timestamp), not the transaction start time.
 * The vote path uses this AFTER acquiring its locks, so time spent waiting for a lock can
 * never let a ballot in after the closing time.
 */
export async function dbWallClock(executor: Executor): Promise<Date> {
  const result = await executor.execute<{ now: Date | string }>(sql`SELECT clock_timestamp() AS now`);
  const value = result.rows[0].now;
  return value instanceof Date ? value : new Date(value);
}
