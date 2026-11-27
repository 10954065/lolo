import "server-only";
import { and, asc, count, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { formatDateTime } from "@/lib/datetime";
import type { Actor } from "@/server/auth/actor";
import { assertCan, can } from "@/server/auth/permissions";
import type { ValidSession } from "@/server/auth/session";
import { sha256Hex } from "@/server/crypto";
import { getDb, type Executor } from "@/server/db/client";
import {
  candidates,
  electionResults,
  elections,
  electionStatusHistory,
  electionVoters,
  executivePositions,
  members,
  tieResolutions,
  voterParticipation,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { businessRule, notFound, reauthRequired, validationError } from "@/server/errors";
import { reasonField } from "@/server/validation/common";
import { recordAudit } from "./audit";
import { ballotCount, tallyElection } from "./ballot-box";
import { enqueueEmail } from "./email-queue";
import { lockElection, type ElectionRow } from "./elections";

export const TALLY_STATUSES = ["CLOSED", "RESULTS_PUBLISHED", "ARCHIVED"] as const;

export interface CandidateResult {
  candidateId: string;
  fullName: string;
  status: string;
  votes: number;
  /** Share of ballots cast, 0–100, one decimal. */
  percent: number;
  isWinner: boolean;
  isTied: boolean;
}

export interface PositionResult {
  positionId: string;
  title: string;
  seats: number;
  abstentions: number;
  abstentionPercent: number;
  candidates: CandidateResult[];
  hasTie: boolean;
  isUnopposed: boolean;
  /** Seats not filled because of a tie (or no votes). */
  unfilledSeats: number;
}

export interface ResultsSnapshot {
  version: 1;
  electionId: string;
  electionTitle: string;
  opensAt: string;
  closesAt: string;
  eligibleVoters: number;
  ballotsCast: number;
  participationRecords: number;
  turnoutPercent: number;
  invalidBallots: 0;
  isConsistent: boolean;
  tieBreakProcedure: string;
  generatedAt: string;
  positions: PositionResult[];
}

const pct = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

/**
 * Plurality with ties flagged, never broken. Withdrawn/deactivated candidates are reported with
 * their votes but cannot be declared winners. Pure function — unit tested.
 */
export function decideWinners(
  rows: Array<{ candidateId: string; fullName: string; status: string; votes: number }>,
  seats: number,
  ballotsCast: number,
): { candidates: CandidateResult[]; hasTie: boolean; unfilledSeats: number } {
  const sorted = [...rows].sort((a, b) => b.votes - a.votes || a.fullName.localeCompare(b.fullName));
  const eligible = sorted.filter((r) => r.status === "APPROVED" && r.votes > 0);
  const winners = new Set<string>();
  const tied = new Set<string>();
  if (eligible.length > 0) {
    const boundary = eligible[Math.min(seats, eligible.length) - 1].votes;
    const above = eligible.filter((r) => r.votes > boundary);
    const atBoundary = eligible.filter((r) => r.votes === boundary);
    const seatsLeft = seats - above.length;
    above.forEach((r) => winners.add(r.candidateId));
    if (atBoundary.length <= seatsLeft) atBoundary.forEach((r) => winners.add(r.candidateId));
    else atBoundary.forEach((r) => tied.add(r.candidateId));
  }
  return {
    candidates: sorted.map((r) => ({
      ...r,
      percent: pct(r.votes, ballotsCast),
      isWinner: winners.has(r.candidateId),
      isTied: tied.has(r.candidateId),
    })),
    hasTie: tied.size > 0,
    unfilledSeats: seats - winners.size,
  };
}

/** Compute results from the anonymous ballot box (refused by the database before closing). */
export async function computeResults(executor: Executor, election: ElectionRow): Promise<ResultsSnapshot> {
  if (!(TALLY_STATUSES as readonly string[]).includes(election.status)) {
    throw businessRule("Results are only available after voting has closed.");
  }
  const [tally, positions, allCandidates, [{ eligible }], [{ voted }], ballots] = await Promise.all([
    tallyElection(executor, election.id),
    executor
      .select()
      .from(executivePositions)
      .where(eq(executivePositions.electionId, election.id))
      .orderBy(asc(executivePositions.displayOrder), asc(executivePositions.title)),
    executor
      .select({ id: candidates.id, positionId: candidates.positionId, fullName: candidates.fullName, status: candidates.status })
      .from(candidates)
      .where(and(eq(candidates.electionId, election.id), inArray(candidates.status, ["APPROVED", "WITHDRAWN"]))),
    executor.select({ eligible: count() }).from(electionVoters).where(eq(electionVoters.electionId, election.id)),
    executor.select({ voted: count() }).from(voterParticipation).where(eq(voterParticipation.electionId, election.id)),
    ballotCount(executor, election.id),
  ]);
  const votesFor = (positionId: string, candidateId: string | null) =>
    tally.find((t) => t.positionId === positionId && t.candidateId === candidateId)?.votes ?? 0;

  const positionResults: PositionResult[] = positions.map((p) => {
    const inPosition = allCandidates.filter((c) => c.positionId === p.id);
    // Withdrawn candidates appear only if they received votes before withdrawing.
    const rows = inPosition
      .map((c) => ({ candidateId: c.id, fullName: c.fullName, status: c.status, votes: votesFor(p.id, c.id) }))
      .filter((r) => r.status === "APPROVED" || r.votes > 0);
    const decided = decideWinners(rows, p.maxSelections, ballots);
    const abstentions = votesFor(p.id, null);
    return {
      positionId: p.id,
      title: p.title,
      seats: p.maxSelections,
      abstentions,
      abstentionPercent: pct(abstentions, ballots),
      candidates: decided.candidates,
      hasTie: decided.hasTie,
      isUnopposed: rows.filter((r) => r.status === "APPROVED").length <= p.maxSelections,
      unfilledSeats: decided.unfilledSeats,
    };
  });

  return {
    version: 1,
    electionId: election.id,
    electionTitle: election.title,
    opensAt: election.opensAt.toISOString(),
    closesAt: election.closesAt.toISOString(),
    eligibleVoters: Number(eligible),
    ballotsCast: ballots,
    participationRecords: Number(voted),
    turnoutPercent: pct(ballots, Number(eligible)),
    invalidBallots: 0,
    isConsistent: ballots === Number(voted),
    tieBreakProcedure: election.tieBreakProcedure,
    generatedAt: new Date().toISOString(),
    positions: positionResults,
  };
}

// ---- Reading results --------------------------------------------------------------------------

export async function getElectionOr404(electionId: string): Promise<ElectionRow> {
  if (!z.uuid().safeParse(electionId).success) throw notFound("Election not found.");
  const [e] = await getDb().select().from(elections).where(eq(elections.id, electionId)).limit(1);
  if (!e) throw notFound("Election not found.");
  return e;
}

/** Provisional (unpublished) results: System Administrator only, after closing. */
export async function provisionalResults(actor: Actor, electionId: string): Promise<ResultsSnapshot> {
  assertCan(actor, "results.read.unpublished");
  return computeResults(getDb(), await getElectionOr404(electionId));
}

export async function publishedSnapshot(electionId: string): Promise<{ snapshot: ResultsSnapshot; sha256: string; publishedAt: Date } | null> {
  if (!z.uuid().safeParse(electionId).success) return null;
  const [row] = await getDb().select().from(electionResults).where(eq(electionResults.electionId, electionId)).limit(1);
  return row ? { snapshot: row.snapshot as ResultsSnapshot, sha256: row.sha256, publishedAt: row.publishedAt } : null;
}

/** Whether this viewer may see the PUBLISHED results of the election (visibility rules). */
export async function canViewPublishedResults(session: ValidSession | null, election: ElectionRow): Promise<boolean> {
  if (!["RESULTS_PUBLISHED", "ARCHIVED"].includes(election.status)) return false;
  if (election.resultsVisibility === "PUBLIC") return true;
  if (!session) return false;
  if (can({ role: session.user.role }, "results.read.published")) return true;
  if (session.user.role !== "VOTER" || !session.user.memberId) return false;
  if (election.resultsVisibility === "ALL_MEMBERS") return true;
  const [onRoll] = await getDb()
    .select({ memberId: electionVoters.memberId })
    .from(electionVoters)
    .where(and(eq(electionVoters.electionId, election.id), eq(electionVoters.memberId, session.user.memberId)))
    .limit(1);
  return Boolean(onRoll);
}

export async function listTieResolutions(electionId: string) {
  return getDb()
    .select({ resolution: tieResolutions, candidateName: candidates.fullName })
    .from(tieResolutions)
    .innerJoin(candidates, eq(candidates.id, tieResolutions.winnerCandidateId))
    .where(eq(tieResolutions.electionId, electionId));
}

// ---- Publication -------------------------------------------------------------------------------

function canonicalJson(snapshot: ResultsSnapshot): string {
  return JSON.stringify(snapshot);
}

export async function publishResults(actor: Actor, electionId: string, hasRecentReauth: boolean): Promise<void> {
  assertCan(actor, "results.publish");
  if (!hasRecentReauth) throw reauthRequired();
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    if (election.status !== "CLOSED") throw businessRule("Results can only be published after voting has closed.");
    const snapshot = await computeResults(tx, election);
    if (!snapshot.isConsistent) {
      throw businessRule("Integrity check failed: ballots and participation records differ. Investigate before publishing.");
    }
    const json = canonicalJson(snapshot);
    const hash = sha256Hex(json);
    const now = new Date();
    await tx.insert(electionResults).values({ electionId, snapshot: JSON.parse(json), sha256: hash, publishedBy: actor.userId, publishedAt: now });
    await tx
      .update(elections)
      .set({ status: "RESULTS_PUBLISHED", resultsPublishedAt: now, resultsPublishedBy: actor.userId, updatedAt: now })
      .where(eq(elections.id, electionId));
    await tx.insert(electionStatusHistory).values({ electionId, fromStatus: "CLOSED", toStatus: "RESULTS_PUBLISHED", actorUserId: actor.userId });
    await recordAudit(tx, actor, {
      action: "RESULTS_PUBLISHED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Published results of “${election.title}” (turnout ${snapshot.turnoutPercent}%, ${snapshot.ballotsCast} ballots)`,
      metadata: { resultsSha256: hash, ties: snapshot.positions.filter((p) => p.hasTie).map((p) => p.title) },
    });
    await notifyResults(tx, election);
  });
}

async function notifyResults(tx: Executor, election: ElectionRow): Promise<void> {
  const recipients =
    election.resultsVisibility === "ELIGIBLE_VOTERS"
      ? await tx
          .select({ id: members.id, email: members.email, fullName: members.fullName })
          .from(electionVoters)
          .innerJoin(members, eq(members.id, electionVoters.memberId))
          .where(and(eq(electionVoters.electionId, election.id), eq(members.accountStatus, "ACTIVE"), isNull(members.deletedAt)))
      : await tx
          .select({ id: members.id, email: members.email, fullName: members.fullName })
          .from(members)
          .where(and(eq(members.approvalStatus, "APPROVED"), eq(members.accountStatus, "ACTIVE"), isNull(members.deletedAt)));
  for (const r of recipients) {
    await enqueueEmail(tx, {
      template: "results_published",
      to: r.email,
      vars: { recipientName: r.fullName, electionTitle: election.title, resultsUrl: `${env().APP_URL}/dashboard/results/${election.id}` },
      memberId: r.id,
      electionId: election.id,
      dedupeKey: `results:${election.id}:${r.id}:${Date.now()}`,
    });
  }
}

export async function unpublishResults(actor: Actor, electionId: string, reasonInput: unknown, hasRecentReauth: boolean): Promise<void> {
  assertCan(actor, "results.publish");
  if (!hasRecentReauth) throw reauthRequired();
  const reason = reasonField(20).safeParse(reasonInput);
  if (!reason.success) throw validationError("A detailed reason is required.", { reason: reason.error.issues.map((i) => i.message) });
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    if (election.status !== "RESULTS_PUBLISHED") throw businessRule("These results are not published.");
    await tx.delete(electionResults).where(eq(electionResults.electionId, electionId));
    await tx
      .update(elections)
      .set({ status: "CLOSED", resultsPublishedAt: null, resultsPublishedBy: null, updatedAt: new Date() })
      .where(eq(elections.id, electionId));
    await tx.insert(electionStatusHistory).values({ electionId, fromStatus: "RESULTS_PUBLISHED", toStatus: "CLOSED", reason: reason.data, actorUserId: actor.userId });
    await recordAudit(tx, actor, {
      action: "RESULTS_UNPUBLISHED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Withdrew publication of the results of “${election.title}”`,
      reason: reason.data,
    });
  });
}

/**
 * Record the outcome of MOBA's approved tie-break procedure. Never alters vote counts; the
 * resolution is shown alongside the tied result.
 */
export async function recordTieResolution(
  actor: Actor,
  electionId: string,
  input: { positionId: unknown; winnerCandidateId: unknown; method: unknown; notes: unknown },
  hasRecentReauth: boolean,
): Promise<void> {
  assertCan(actor, "results.publish");
  if (!hasRecentReauth) throw reauthRequired();
  const parsed = z
    .object({
      positionId: z.uuid(),
      winnerCandidateId: z.uuid("Choose the candidate declared the winner."),
      method: z.string().trim().min(5, "Describe how the tie was broken.").max(300),
      notes: z.string().trim().max(2000).optional().default(""),
    })
    .safeParse(input);
  if (!parsed.success) {
    throw validationError("Please complete the form.", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), [i.message]])));
  }
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    const results = await computeResults(tx, election);
    const position = results.positions.find((p) => p.positionId === parsed.data.positionId);
    if (!position?.hasTie) throw businessRule("There is no tie to resolve for this position.");
    const candidate = position.candidates.find((c) => c.candidateId === parsed.data.winnerCandidateId);
    if (!candidate?.isTied) throw businessRule("The declared winner must be one of the tied candidates.");
    await tx
      .insert(tieResolutions)
      .values({ electionId, ...parsed.data, recordedBy: actor.userId })
      .onConflictDoUpdate({
        target: [tieResolutions.electionId, tieResolutions.positionId],
        set: { winnerCandidateId: parsed.data.winnerCandidateId, method: parsed.data.method, notes: parsed.data.notes, recordedBy: actor.userId, recordedAt: new Date() },
      });
    await recordAudit(tx, actor, {
      action: "TIE_RESOLUTION_RECORDED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Recorded tie-break outcome for ${position.title} in “${election.title}”: ${candidate.fullName}`,
      reason: `${parsed.data.method}${parsed.data.notes ? ` — ${parsed.data.notes}` : ""}`,
    });
  });
}

export function resultsPublishedLabel(publishedAt: Date | null): string {
  return publishedAt ? `Published ${formatDateTime(publishedAt)}` : "Not published";
}
