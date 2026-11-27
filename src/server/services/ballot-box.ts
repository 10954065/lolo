import "server-only";
/**
 * THE ONLY MODULE ALLOWED TO TOUCH THE ANONYMOUS BALLOT TABLES.
 * Enforced by tests/unit/ballot-isolation.test.ts.
 *
 * The application database role can only INSERT into ballots/ballot_selections; every read
 * goes through SECURITY DEFINER functions that return aggregates (see drizzle/0001).
 * Nothing here ever returns an individual ballot, and nothing here logs anything.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { sha256Hex } from "@/server/crypto";
import type { Executor, Transaction } from "@/server/db/client";
import { ballots, ballotSelections } from "@/server/db/schema/ballots";

// ---- Receipts -------------------------------------------------------------------------------

/** Crockford base32 (no I, L, O, U) — easy to read aloud and type. */
const RECEIPT_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECEIPT_CHARS = 25; // 125 bits of entropy

/** A random, non-identifying receipt, e.g. MOBA-7K2QF-…  (shown to the voter once). */
export function generateReceipt(): string {
  const bytes = randomBytes(RECEIPT_CHARS);
  const chars = Array.from(bytes, (b) => RECEIPT_ALPHABET[b & 31]).join("");
  return `MOBA-${chars.match(/.{5}/g)!.join("-")}`;
}

/** Canonical form: upper-case, no separators, no MOBA prefix; common look-alikes mapped. */
export function normalizeReceipt(input: string): string | null {
  const cleaned = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/^MOBA/, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  return new RegExp(`^[${RECEIPT_ALPHABET}]{${RECEIPT_CHARS}}$`).test(cleaned) ? cleaned : null;
}

export function hashReceipt(normalized: string): string {
  return sha256Hex(`moba-ballot-receipt:${normalized}`);
}

// ---- Writing a ballot -------------------------------------------------------------------------

export interface AnonymousSelection {
  positionId: string;
  /** null = abstention for the position */
  candidateId: string | null;
}

/**
 * Insert one anonymous ballot inside the caller's vote transaction. Identifiers are random
 * UUID v4 (never time-ordered); there is no voter reference and no timestamp.
 */
export async function insertAnonymousBallot(
  tx: Transaction,
  electionId: string,
  selections: readonly AnonymousSelection[],
  receipt: string,
): Promise<void> {
  const normalized = normalizeReceipt(receipt);
  if (!normalized) throw new Error("Invalid receipt format");
  const ballotId = randomUUID();
  await tx.insert(ballots).values({ id: ballotId, electionId, receiptHash: hashReceipt(normalized) });
  await tx.insert(ballotSelections).values(
    selections.map((s) => ({
      id: randomUUID(),
      ballotId,
      electionId,
      positionId: s.positionId,
      candidateId: s.candidateId,
    })),
  );
}

// ---- Aggregate reads (via SECURITY DEFINER functions) -----------------------------------------

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

/** Which election (if any) holds a ballot with this receipt. Proves inclusion, never content. */
export async function findReceiptElection(executor: Executor, receipt: string): Promise<string | null> {
  const normalized = normalizeReceipt(receipt);
  if (!normalized) return null;
  const result = await executor.execute<{ election_id: string | null }>(
    sql`SELECT verify_receipt(${hashReceipt(normalized)}) AS election_id`,
  );
  return result.rows[0]?.election_id ?? null;
}

export interface TallyRow {
  positionId: string;
  candidateId: string | null;
  votes: number;
}

/** Aggregate counts per position/candidate. The database refuses this until voting has closed. */
export async function tallyElection(executor: Executor, electionId: string): Promise<TallyRow[]> {
  const result = await executor.execute<{ position_id: string; candidate_id: string | null; votes: string }>(
    sql`SELECT position_id, candidate_id, votes FROM election_tally(${electionId}::uuid)`,
  );
  return result.rows.map((r) => ({ positionId: r.position_id, candidateId: r.candidate_id, votes: Number(r.votes) }));
}
