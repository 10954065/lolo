import "server-only";
import { and, asc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { formatDateTime } from "@/lib/datetime";
import { acceptsVotes, effectiveStatus, votingWindow } from "@/lib/election-rules";
import type { Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { consumeRateLimit, RATE_LIMITS } from "@/server/auth/rate-limit";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import {
  candidates,
  elections,
  electionVoters,
  executivePositions,
  members,
  users,
  voterParticipation,
} from "@/server/db/schema";
import {
  AppError,
  businessRule,
  conflict,
  forbidden,
  isUniqueViolation,
  notFound,
  rateLimited,
  validationError,
} from "@/server/errors";
import { type AnonymousSelection, findReceiptElection, generateReceipt, insertAnonymousBallot } from "./ballot-box";
import { dbNow, dbWallClock } from "./clock";
import { enqueueEmail } from "./email-queue";

export const ABSTAIN = "ABSTAIN";
const BALLOT_RATE_LIMIT = { scope: "ballot:member", limit: 20, windowSeconds: 15 * 60 } as const;

export type SubmittedSelections = Record<string, string[]>;

export interface BallotReceipt {
  receipt: string;
  votedAt: Date;
  electionTitle: string;
}

// ---- Reading the ballot (voter view) ---------------------------------------------------------

export async function participationFor(executor: Executor, electionId: string, memberId: string) {
  const [row] = await executor
    .select({ votedAt: voterParticipation.votedAt })
    .from(voterParticipation)
    .where(and(eq(voterParticipation.electionId, electionId), eq(voterParticipation.memberId, memberId)))
    .limit(1);
  return row ?? null;
}

/** Elections whose voter roll includes this member (drafts hidden). */
export async function electionsForMember(memberId: string) {
  return getDb()
    .select({ election: elections, votedAt: voterParticipation.votedAt })
    .from(electionVoters)
    .innerJoin(elections, eq(elections.id, electionVoters.electionId))
    .leftJoin(
      voterParticipation,
      and(
        eq(voterParticipation.electionId, electionVoters.electionId),
        eq(voterParticipation.memberId, electionVoters.memberId),
      ),
    )
    .where(and(eq(electionVoters.memberId, memberId), ne(elections.status, "DRAFT")))
    .orderBy(sql`${elections.opensAt} DESC`);
}

export interface BallotPosition {
  id: string;
  title: string;
  description: string;
  maxSelections: number;
  allowAbstain: boolean;
  candidates: Array<{
    id: string;
    fullName: string;
    biography: string;
    manifesto: string;
    hasPhoto: boolean;
    photoVersion: string | null;
  }>;
}

/** Positions with their currently approved candidates, in ballot order. */
export async function ballotPositions(executor: Executor, electionId: string): Promise<BallotPosition[]> {
  const positions = await executor
    .select()
    .from(executivePositions)
    .where(eq(executivePositions.electionId, electionId))
    .orderBy(asc(executivePositions.displayOrder), asc(executivePositions.title));
  const approved = await executor
    .select({
      id: candidates.id,
      positionId: candidates.positionId,
      fullName: candidates.fullName,
      biography: candidates.biography,
      manifesto: candidates.manifesto,
      hasPhoto: sql<boolean>`EXISTS (SELECT 1 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
      photoVersion: sql<string | null>`(SELECT cp.sha256 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
    })
    .from(candidates)
    .where(and(eq(candidates.electionId, electionId), eq(candidates.status, "APPROVED")))
    .orderBy(asc(candidates.ballotOrder), asc(candidates.fullName));
  return positions.map((p) => ({
    id: p.id,
    title: p.title,
    description: p.description,
    maxSelections: p.maxSelections,
    allowAbstain: p.allowAbstain,
    candidates: approved
      .filter((c) => c.positionId === p.id)
      .map((c) => ({
        id: c.id,
        fullName: c.fullName,
        biography: c.biography,
        manifesto: c.manifesto,
        hasPhoto: c.hasPhoto,
        photoVersion: c.photoVersion,
      })),
  }));
}

export interface VoterElectionView {
  election: typeof elections.$inferSelect;
  status: ReturnType<typeof effectiveStatus>;
  canVoteNow: boolean;
  votedAt: Date | null;
  positions: BallotPosition[];
}

/** Everything a member needs to see an election they are eligible for (null if not on the roll). */
export async function voterElectionView(memberId: string, electionId: string): Promise<VoterElectionView | null> {
  if (!z.uuid().safeParse(electionId).success) return null;
  const db = getDb();
  const [row] = await db
    .select({ election: elections })
    .from(electionVoters)
    .innerJoin(elections, eq(elections.id, electionVoters.electionId))
    .where(and(eq(electionVoters.electionId, electionId), eq(electionVoters.memberId, memberId)))
    .limit(1);
  if (!row || row.election.status === "DRAFT") return null;
  const now = await dbNow(db);
  const [participation, positions] = await Promise.all([
    participationFor(db, electionId, memberId),
    ballotPositions(db, electionId),
  ]);
  return {
    election: row.election,
    status: effectiveStatus(row.election, now),
    canVoteNow: acceptsVotes(row.election, now) && !participation,
    votedAt: participation?.votedAt ?? null,
    positions,
  };
}

// ---- Validating and casting a ballot ----------------------------------------------------------

/** Pure validation of a submission against the frozen ballot. Returns the anonymous selections. */
export function validateSelections(
  positions: readonly BallotPosition[],
  submitted: SubmittedSelections,
): AnonymousSelection[] {
  const errors: Record<string, string[]> = {};
  const result: AnonymousSelection[] = [];
  const known = new Set(positions.map((p) => p.id));
  if (Object.keys(submitted).some((key) => !known.has(key))) {
    errors._form = ["The ballot contains a position that is not part of this election."];
  }
  for (const position of positions) {
    const values = [...new Set(submitted[position.id] ?? [])];
    const allowed = new Set(position.candidates.map((c) => c.id));
    if (position.candidates.length === 0) {
      // Every candidate withdrew during voting (emergency): the only possible entry is an abstention.
      result.push({ positionId: position.id, candidateId: null });
      continue;
    }
    if (values.length === 0) {
      errors[position.id] = [
        `Make a choice for ${position.title}${position.allowAbstain ? " (or choose to abstain)" : ""}.`,
      ];
      continue;
    }
    if (values.includes(ABSTAIN)) {
      if (values.length > 1) errors[position.id] = [`You cannot abstain and choose candidates for ${position.title}.`];
      else if (!position.allowAbstain) errors[position.id] = [`Abstaining is not allowed for ${position.title}.`];
      else result.push({ positionId: position.id, candidateId: null });
      continue;
    }
    if (values.length > position.maxSelections) {
      errors[position.id] = [`Choose at most ${position.maxSelections} candidate(s) for ${position.title}.`];
      continue;
    }
    if (values.some((v) => !allowed.has(v))) {
      errors[position.id] = [`One of your choices for ${position.title} is not a candidate on this ballot.`];
      continue;
    }
    for (const candidateId of values) result.push({ positionId: position.id, candidateId });
  }
  if (Object.keys(errors).length > 0) throw validationError("Please review your ballot.", errors);
  return result;
}

function alreadyVoted(votedAt: Date): AppError {
  return conflict(
    `You have already voted in this election. Your ballot was recorded on ${formatDateTime(votedAt)} and cannot be changed.`,
  );
}

function votingClosedError(election: typeof elections.$inferSelect, now: Date): AppError {
  if (election.status === "CANCELLED") return businessRule("This election has been cancelled.");
  const isPreparing = ["DRAFT", "REGISTRATION", "NOMINATION", "CANDIDATE_APPROVAL"].includes(election.status);
  if (isPreparing || votingWindow(election, now) === "BEFORE") {
    return businessRule(`Voting has not started. It opens on ${formatDateTime(election.opensAt)}.`);
  }
  return businessRule(
    `Voting has ended. It closed on ${formatDateTime(election.closesAt)}. No further ballots can be accepted.`,
  );
}

async function assertEligible(tx: Transaction, memberId: string, userId: string | null): Promise<void> {
  const [m] = await tx
    .select({
      approval: members.approvalStatus,
      account: members.accountStatus,
      deletedAt: members.deletedAt,
      userId: members.userId,
      userStatus: users.status,
      mustChangePassword: users.mustChangePassword,
    })
    .from(members)
    .leftJoin(users, eq(users.id, members.userId))
    .where(eq(members.id, memberId))
    .limit(1);
  if (!m || m.approval !== "APPROVED" || m.account !== "ACTIVE" || m.deletedAt || m.userStatus !== "ACTIVE") {
    throw forbidden("Your membership is not currently eligible to vote. Please contact the election administrator.");
  }
  if (userId && m.userId !== userId) throw forbidden();
  if (m.mustChangePassword) throw forbidden("Please change your temporary password before voting.");
}

export interface CastBallotOptions {
  /** Tests only: override receipt generation (e.g. to force a failure after partial writes). */
  receiptFactory?: () => string;
}

/**
 * Cast a ballot — one atomic transaction. Either participation AND the anonymous ballot are
 * recorded, or nothing is. Concurrent submissions by the same member serialize on the voter
 * roll row, and the unique participation constraint guarantees at most one ballot.
 * Deliberately NOT audit-logged and NOT application-logged (secret ballot).
 */
export async function castBallot(
  actor: Actor,
  memberId: string,
  electionId: string,
  submitted: SubmittedSelections,
  options: CastBallotOptions = {},
): Promise<BallotReceipt> {
  assertCan(actor, "ballot.cast");
  if (!z.uuid().safeParse(electionId).success) throw notFound("Election not found.");
  if (!(await consumeRateLimit(BALLOT_RATE_LIMIT, memberId))) throw rateLimited();

  try {
    return await getDb().transaction(async (tx) => {
      // 1. Election state on the database clock. FOR SHARE conflicts with the FOR UPDATE taken
      //    when voting is closed, so a ballot is either fully before the close or rejected.
      const [election] = await tx.select().from(elections).where(eq(elections.id, electionId)).for("share");
      if (!election) throw notFound("Election not found.");

      // 2. Serialize concurrent submissions (double clicks, several tabs/devices) for this voter.
      const [rollEntry] = await tx
        .select({ memberId: electionVoters.memberId })
        .from(electionVoters)
        .where(and(eq(electionVoters.electionId, electionId), eq(electionVoters.memberId, memberId)))
        .for("update");
      if (!rollEntry) throw forbidden("You are not on the voter roll for this election.");

      // Wall-clock time AFTER both locks are held — lock waits cannot extend the window.
      const now = await dbWallClock(tx);
      if (!acceptsVotes(election, now)) throw votingClosedError(election, now);

      // 3. Eligibility is re-checked at the moment of voting.
      await assertEligible(tx, memberId, actor.userId);

      // 4. One ballot per member.
      const existing = await participationFor(tx, electionId, memberId);
      if (existing) throw alreadyVoted(existing.votedAt);

      // 5. Validate against the frozen ballot (approved candidates only).
      const selections = validateSelections(await ballotPositions(tx, electionId), submitted);

      // 6. Record participation (unique constraint = hard stop) and the anonymous ballot.
      const [participation] = await tx
        .insert(voterParticipation)
        .values({ electionId, memberId })
        .returning({ votedAt: voterParticipation.votedAt });
      const receipt = (options.receiptFactory ?? generateReceipt)();
      try {
        await insertAnonymousBallot(tx, electionId, selections, receipt);
      } catch {
        // Driver errors embed the SQL parameters (candidate ids). Replace them entirely so a
        // failure can never write a voter's choices to the logs. The transaction rolls back.
        throw new Error("Ballot storage failed; nothing was recorded.");
      }

      // 7. Confirmation email states only THAT the member voted — never choices or receipt.
      const [member] = await tx
        .select({ email: members.email, fullName: members.fullName })
        .from(members)
        .where(eq(members.id, memberId));
      await enqueueEmail(tx, {
        template: "vote_confirmation",
        to: member.email,
        vars: {
          recipientName: member.fullName,
          electionTitle: election.title,
          votedAt: formatDateTime(participation.votedAt),
        },
        memberId,
        electionId,
        dedupeKey: `vote_confirmation:${electionId}:${memberId}`,
      });
      return { receipt, votedAt: participation.votedAt, electionTitle: election.title };
    });
  } catch (error) {
    if (isUniqueViolation(error, "voter_participation_election_member_unique")) {
      const existing = await participationFor(getDb(), electionId, memberId);
      throw alreadyVoted(existing?.votedAt ?? new Date());
    }
    throw error;
  }
}

/** Parse ballot form data: fields named "position:<uuid>" holding candidate ids or ABSTAIN. */
export function selectionsFromFormData(formData: FormData): SubmittedSelections {
  const out: SubmittedSelections = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("position:") || typeof value !== "string") continue;
    const positionId = key.slice("position:".length);
    if (!z.uuid().safeParse(positionId).success) continue;
    if (value !== ABSTAIN && !z.uuid().safeParse(value).success) continue;
    (out[positionId] ??= []).push(value);
  }
  return out;
}

// ---- Receipt verification (public) --------------------------------------------------------------

export async function verifyReceipt(
  receipt: string,
  ipAddress: string | null,
): Promise<{ isFound: boolean; electionTitle?: string }> {
  if (!(await consumeRateLimit(RATE_LIMITS.receiptByIp, ipAddress ?? "unknown-client"))) throw rateLimited();
  const db = getDb();
  const electionId = await findReceiptElection(db, receipt);
  if (!electionId) return { isFound: false };
  const [e] = await db.select({ title: elections.title }).from(elections).where(eq(elections.id, electionId));
  return { isFound: true, electionTitle: e?.title };
}

/** Members on the roll who have not voted (count only). */
export async function remainingVoters(electionId: string): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)` })
    .from(electionVoters)
    .leftJoin(
      voterParticipation,
      and(
        eq(voterParticipation.electionId, electionVoters.electionId),
        eq(voterParticipation.memberId, electionVoters.memberId),
      ),
    )
    .where(and(eq(electionVoters.electionId, electionId), isNull(voterParticipation.id)));
  return Number(n);
}
