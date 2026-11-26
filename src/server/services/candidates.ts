import "server-only";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { EMERGENCY_REASON_MIN, isBallotLocked, votingWindow } from "@/lib/election-rules";
import type { Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { getDb, type Transaction } from "@/server/db/client";
import { candidatePhotos, candidates, executivePositions, members } from "@/server/db/schema";
import { businessRule, isUniqueViolation, notFound, reauthRequired, validationError } from "@/server/errors";
import { fieldErrorsOf, reasonField } from "@/server/validation/common";
import { candidateInputSchema } from "@/server/validation/elections";
import { recordAudit } from "./audit";
import { dbNow } from "./clock";
import { assertBallotEditable, lockElection } from "./elections";
import { processCandidatePhoto } from "./photos";

type CandidateRow = typeof candidates.$inferSelect;
const INACTIVE = ["REJECTED", "WITHDRAWN", "DEACTIVATED"] as const;

export async function listCandidates(electionId: string, statuses?: CandidateRow["status"][]) {
  return getDb()
    .select({
      candidate: candidates,
      positionTitle: executivePositions.title,
      positionOrder: executivePositions.displayOrder,
      hasPhoto: sql<boolean>`EXISTS (SELECT 1 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
      photoVersion: sql<string | null>`(SELECT cp.sha256 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
    })
    .from(candidates)
    .innerJoin(executivePositions, eq(executivePositions.id, candidates.positionId))
    .where(and(eq(candidates.electionId, electionId), statuses?.length ? inArray(candidates.status, statuses) : undefined))
    .orderBy(asc(executivePositions.displayOrder), asc(candidates.ballotOrder), asc(candidates.fullName));
}

export async function getCandidate(candidateId: string) {
  if (!z.uuid().safeParse(candidateId).success) return null;
  const [row] = await getDb()
    .select({
      candidate: candidates,
      positionTitle: executivePositions.title,
      hasPhoto: sql<boolean>`EXISTS (SELECT 1 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
      photoVersion: sql<string | null>`(SELECT cp.sha256 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
    })
    .from(candidates)
    .innerJoin(executivePositions, eq(executivePositions.id, candidates.positionId))
    .where(eq(candidates.id, candidateId))
    .limit(1);
  return row ?? null;
}

function parse(input: unknown) {
  const parsed = candidateInputSchema.safeParse(input);
  if (!parsed.success) throw validationError("Please correct the highlighted fields.", fieldErrorsOf(parsed.error));
  return parsed.data;
}

async function lockCandidate(tx: Transaction, candidateId: string): Promise<CandidateRow> {
  if (!z.uuid().safeParse(candidateId).success) throw notFound("Candidate not found.");
  const [c] = await tx.select().from(candidates).where(eq(candidates.id, candidateId)).for("update");
  if (!c) throw notFound("Candidate not found.");
  return c;
}

/** Resolve the optional member link and enforce one active candidacy per member per election. */
async function resolveMember(tx: Transaction, electionId: string, memberEmail: string | undefined, excludeCandidateId?: string) {
  if (!memberEmail) return null;
  const [member] = await tx
    .select({ id: members.id, approvalStatus: members.approvalStatus, deletedAt: members.deletedAt })
    .from(members)
    .where(sql`lower(${members.email}) = ${memberEmail}`)
    .limit(1);
  if (!member || member.deletedAt) {
    throw validationError("No registered member has this email.", { memberEmail: ["No registered member has this email."] });
  }
  if (member.approvalStatus !== "APPROVED") {
    throw validationError("This member is not approved.", { memberEmail: ["Only approved members can stand as candidates."] });
  }
  const [{ n }] = await tx
    .select({ n: count() })
    .from(candidates)
    .where(
      and(
        eq(candidates.electionId, electionId),
        eq(candidates.memberId, member.id),
        sql`${candidates.status} NOT IN ('REJECTED', 'WITHDRAWN', 'DEACTIVATED')`,
        excludeCandidateId ? ne(candidates.id, excludeCandidateId) : undefined,
      ),
    );
  if (Number(n) > 0) {
    throw validationError("This member is already a candidate in this election.", {
      memberEmail: ["Already standing for a position in this election."],
    });
  }
  return member.id;
}

async function assertPositionInElection(tx: Transaction, positionId: string, electionId: string) {
  const [position] = await tx
    .select()
    .from(executivePositions)
    .where(and(eq(executivePositions.id, positionId), eq(executivePositions.electionId, electionId)))
    .limit(1);
  if (!position) throw validationError("Choose a position from this election.", { positionId: ["Invalid position."] });
  return position;
}

export interface CandidateOptions {
  approve?: boolean;
  photo?: Buffer | null;
}

export async function createCandidate(actor: Actor, electionId: string, input: unknown, options: CandidateOptions = {}): Promise<string> {
  assertCan(actor, "candidates.write");
  const data = parse(input);
  const photo = options.photo?.length ? await processCandidatePhoto(options.photo) : null;
  try {
    return await getDb().transaction(async (tx) => {
      const election = await lockElection(tx, electionId);
      await assertBallotEditable(tx, election);
      const position = await assertPositionInElection(tx, data.positionId, electionId);
      const memberId = await resolveMember(tx, electionId, data.memberEmail);
      if (options.approve) await assertSeatAvailable(tx, position);
      const [created] = await tx
        .insert(candidates)
        .values({
          electionId,
          positionId: data.positionId,
          memberId,
          fullName: data.fullName,
          membershipNumber: data.membershipNumber ?? null,
          biography: data.biography ?? "",
          manifesto: data.manifesto ?? "",
          status: options.approve ? "APPROVED" : "PENDING",
          decidedBy: options.approve ? actor.userId : null,
          decidedAt: options.approve ? new Date() : null,
        })
        .returning({ id: candidates.id });
      if (photo) await tx.insert(candidatePhotos).values({ candidateId: created.id, ...photo });
      await recordAudit(tx, actor, {
        action: "CANDIDATE_REGISTERED",
        resourceType: "candidate",
        resourceId: created.id,
        summary: `Registered ${data.fullName} as a candidate for ${position.title} in “${election.title}”${options.approve ? " (approved)" : ""}`,
      });
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error, "candidates_position_member_unique")) {
      throw validationError("This member is already a candidate for this position.", { memberEmail: ["Already a candidate."] });
    }
    throw error;
  }
}

export async function updateCandidate(actor: Actor, candidateId: string, input: unknown, photo?: Buffer | null): Promise<void> {
  assertCan(actor, "candidates.write");
  const data = parse(input);
  const processed = photo?.length ? await processCandidatePhoto(photo) : null;
  await getDb().transaction(async (tx) => {
    const before = await lockCandidate(tx, candidateId);
    const election = await lockElection(tx, before.electionId);
    await assertBallotEditable(tx, election);
    const position = await assertPositionInElection(tx, data.positionId, before.electionId);
    const memberId = await resolveMember(tx, before.electionId, data.memberEmail, candidateId);
    if (before.status === "APPROVED" && before.positionId !== data.positionId) await assertSeatAvailable(tx, position);
    await tx
      .update(candidates)
      .set({
        positionId: data.positionId,
        memberId,
        fullName: data.fullName,
        membershipNumber: data.membershipNumber ?? null,
        biography: data.biography ?? "",
        manifesto: data.manifesto ?? "",
        updatedAt: new Date(),
      })
      .where(eq(candidates.id, candidateId));
    if (processed) {
      await tx
        .insert(candidatePhotos)
        .values({ candidateId, ...processed })
        .onConflictDoUpdate({ target: candidatePhotos.candidateId, set: { ...processed, updatedAt: new Date() } });
    }
    await recordAudit(tx, actor, {
      action: "CANDIDATE_UPDATED",
      resourceType: "candidate",
      resourceId: candidateId,
      summary: `Updated candidate ${data.fullName} (${position.title}) in “${election.title}”${processed ? "; photo replaced" : ""}`,
    });
  });
}

export async function removeCandidatePhoto(actor: Actor, candidateId: string): Promise<void> {
  assertCan(actor, "candidates.write");
  await getDb().transaction(async (tx) => {
    const c = await lockCandidate(tx, candidateId);
    const election = await lockElection(tx, c.electionId);
    await assertBallotEditable(tx, election);
    await tx.delete(candidatePhotos).where(eq(candidatePhotos.candidateId, candidateId));
    await recordAudit(tx, actor, {
      action: "CANDIDATE_UPDATED",
      resourceType: "candidate",
      resourceId: candidateId,
      summary: `Removed the photo of candidate ${c.fullName}`,
    });
  });
}

async function assertSeatAvailable(tx: Transaction, position: typeof executivePositions.$inferSelect): Promise<void> {
  if (!position.maxCandidates) return;
  const [{ n }] = await tx
    .select({ n: count() })
    .from(candidates)
    .where(and(eq(candidates.positionId, position.id), eq(candidates.status, "APPROVED")));
  if (Number(n) >= position.maxCandidates) {
    throw businessRule(`“${position.title}” already has the maximum of ${position.maxCandidates} approved candidates.`);
  }
}

/** Approve or reject a candidate before voting starts. */
export async function decideCandidate(actor: Actor, candidateId: string, decision: "APPROVED" | "REJECTED", reasonInput?: unknown): Promise<void> {
  assertCan(actor, "candidates.write");
  let reason: string | null = null;
  if (decision === "REJECTED") {
    const parsed = reasonField(5).safeParse(reasonInput);
    if (!parsed.success) throw validationError("A reason is required.", { reason: parsed.error.issues.map((i) => i.message) });
    reason = parsed.data;
  }
  await getDb().transaction(async (tx) => {
    const c = await lockCandidate(tx, candidateId);
    const election = await lockElection(tx, c.electionId);
    await assertBallotEditable(tx, election);
    if (c.status === decision) throw businessRule(`The candidate is already ${decision.toLowerCase()}.`);
    if (!["PENDING", "REJECTED", "APPROVED"].includes(c.status)) throw businessRule("Withdrawn or deactivated candidates cannot be re-decided.");
    const [position] = await tx.select().from(executivePositions).where(eq(executivePositions.id, c.positionId));
    if (decision === "APPROVED") await assertSeatAvailable(tx, position);
    await tx
      .update(candidates)
      .set({ status: decision, statusReason: reason, decidedBy: actor.userId, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    await recordAudit(tx, actor, {
      action: decision === "APPROVED" ? "CANDIDATE_APPROVED" : "CANDIDATE_REJECTED",
      resourceType: "candidate",
      resourceId: candidateId,
      summary: `${decision === "APPROVED" ? "Approved" : "Rejected"} candidate ${c.fullName} for ${position.title} in “${election.title}”`,
      reason,
    });
  });
}

/**
 * Withdraw a candidate. Before voting: normal, audited change. During voting: EMERGENCY
 * procedure requiring step-up and a detailed reason — the candidate disappears from new
 * ballots; votes already cast for them are preserved and reported.
 */
export async function withdrawCandidate(actor: Actor, candidateId: string, reasonInput: unknown, hasRecentReauth: boolean): Promise<void> {
  assertCan(actor, "candidates.write");
  await getDb().transaction(async (tx) => {
    const c = await lockCandidate(tx, candidateId);
    const election = await lockElection(tx, c.electionId);
    const now = await dbNow(tx);
    const isLocked = isBallotLocked(election, now);
    const isVoting = ["SCHEDULED", "OPEN"].includes(election.status) && votingWindow(election, now) === "DURING";
    if (isLocked && !isVoting) throw businessRule("Voting has ended; the candidate list can no longer change.");
    if (isLocked && !hasRecentReauth) throw reauthRequired();
    const parsed = reasonField(isLocked ? EMERGENCY_REASON_MIN : 5).safeParse(reasonInput);
    if (!parsed.success) throw validationError("A reason is required.", { reason: parsed.error.issues.map((i) => i.message) });
    if ((INACTIVE as readonly string[]).includes(c.status)) throw businessRule("This candidate is not active.");
    if (isLocked && c.status !== "APPROVED") throw businessRule("Only approved candidates appear on the ballot.");
    await tx
      .update(candidates)
      .set({ status: "WITHDRAWN", statusReason: parsed.data, decidedBy: actor.userId, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    await recordAudit(tx, actor, {
      action: isLocked ? "EMERGENCY_CANDIDATE_WITHDRAWN" : "CANDIDATE_WITHDRAWN",
      resourceType: "candidate",
      resourceId: candidateId,
      summary: `${isLocked ? "EMERGENCY: " : ""}Withdrew candidate ${c.fullName} from “${election.title}”`,
      reason: parsed.data,
    });
  });
}

export async function deactivateCandidate(actor: Actor, candidateId: string, reasonInput: unknown): Promise<void> {
  assertCan(actor, "candidates.write");
  const parsed = reasonField(5).safeParse(reasonInput);
  if (!parsed.success) throw validationError("A reason is required.", { reason: parsed.error.issues.map((i) => i.message) });
  await getDb().transaction(async (tx) => {
    const c = await lockCandidate(tx, candidateId);
    const election = await lockElection(tx, c.electionId);
    await assertBallotEditable(tx, election);
    if (c.status === "DEACTIVATED") throw businessRule("The candidate is already deactivated.");
    await tx
      .update(candidates)
      .set({ status: "DEACTIVATED", statusReason: parsed.data, decidedBy: actor.userId, decidedAt: new Date(), updatedAt: new Date() })
      .where(eq(candidates.id, candidateId));
    await recordAudit(tx, actor, {
      action: "CANDIDATE_DEACTIVATED",
      resourceType: "candidate",
      resourceId: candidateId,
      summary: `Deactivated candidate ${c.fullName} in “${election.title}”`,
      reason: parsed.data,
    });
  });
}

export async function getCandidatePhoto(candidateId: string) {
  if (!z.uuid().safeParse(candidateId).success) return null;
  const [row] = await getDb()
    .select({ photo: candidatePhotos, status: candidates.status, electionId: candidates.electionId })
    .from(candidatePhotos)
    .innerJoin(candidates, eq(candidates.id, candidatePhotos.candidateId))
    .where(eq(candidatePhotos.candidateId, candidateId))
    .limit(1);
  return row ?? null;
}
