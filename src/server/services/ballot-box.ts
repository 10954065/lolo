import "server-only";
/**
 * THE ONLY MODULE ALLOWED TO TOUCH THE ANONYMOUS BALLOT TABLES.
 * Enforced by tests/unit/ballot-isolation.test.ts.
 *
 * The application database role can only INSERT into ballots/ballot_selections; every read
 * goes through SECURITY DEFINER functions that return aggregates (see drizzle/0001).
 * Nothing here ever returns an individual ballot.
 */
import { sql } from "drizzle-orm";
import type { Executor } from "@/server/db/client";

/** Re-key and shuffle all ballots of a CLOSED election (breaks storage-order correlation). */
export async function mixBallots(executor: Executor, electionId: string): Promise<number> {
  const result = await executor.execute<{ n: number }>(sql`SELECT mix_ballots(${electionId}::uuid) AS n`);
  return Number(result.rows[0]?.n ?? 0);
}

/** Number of ballots stored for an election (a count only — reveals no choices). */
export async function ballotCount(executor: Executor, electionId: string): Promise<number> {
  const result = await executor.execute<{ n: string }>(sql`SELECT election_ballot_count(${electionId}::uuid) AS n`);
  return Number(result.rows[0]?.n ?? 0);
}
