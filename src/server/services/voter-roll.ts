import "server-only";
import { and, asc, count, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { electionVoters, members, voterParticipation } from "@/server/db/schema";
import { businessRule, validationError } from "@/server/errors";
import { escapeLike } from "@/server/validation/common";
import { recordAudit } from "./audit";
import { assertBallotEditable, lockElection } from "./elections";

export const ROLL_PAGE_SIZE = 50;

export interface RollFilters {
  q?: string;
  voted?: "yes" | "no";
  page: number;
}

/**
 * Voter roll with participation status (WHO voted and WHEN — never WHAT).
 */
export async function listVoterRoll(electionId: string, filters: RollFilters, pageSize = ROLL_PAGE_SIZE) {
  const conditions: SQL[] = [eq(electionVoters.electionId, electionId)];
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(members.fullName, pattern), ilike(members.email, pattern), ilike(members.membershipNumber, pattern)) as SQL);
  }
  if (filters.voted === "yes") conditions.push(sql`${voterParticipation.id} IS NOT NULL`);
  if (filters.voted === "no") conditions.push(isNull(voterParticipation.id));
  const where = and(...conditions);
  const base = () =>
    getDb()
      .select({
        memberId: members.id,
        fullName: members.fullName,
        email: members.email,
        membershipNumber: members.membershipNumber,
        approvalStatus: members.approvalStatus,
        accountStatus: members.accountStatus,
        credentialStatus: members.credentialStatus,
        votedAt: voterParticipation.votedAt,
      })
      .from(electionVoters)
      .innerJoin(members, eq(members.id, electionVoters.memberId))
      .leftJoin(
        voterParticipation,
        and(eq(voterParticipation.electionId, electionVoters.electionId), eq(voterParticipation.memberId, electionVoters.memberId)),
      )
      .where(where);
  const [rows, [{ total }]] = await Promise.all([
    base().orderBy(asc(members.fullName)).limit(pageSize).offset((filters.page - 1) * pageSize),
    getDb()
      .select({ total: count() })
      .from(electionVoters)
      .innerJoin(members, eq(members.id, electionVoters.memberId))
      .leftJoin(
        voterParticipation,
        and(eq(voterParticipation.electionId, electionVoters.electionId), eq(voterParticipation.memberId, electionVoters.memberId)),
      )
      .where(where),
  ]);
  return { rows, total: Number(total), page: filters.page, pageSize };
}

/** Complete roll for exports (who voted and when). */
export async function exportVoterRoll(electionId: string) {
  return getDb()
    .select({
      fullName: members.fullName,
      email: members.email,
      membershipNumber: members.membershipNumber,
      accountStatus: members.accountStatus,
      credentialStatus: members.credentialStatus,
      votedAt: voterParticipation.votedAt,
    })
    .from(electionVoters)
    .innerJoin(members, eq(members.id, electionVoters.memberId))
    .leftJoin(
      voterParticipation,
      and(eq(voterParticipation.electionId, electionVoters.electionId), eq(voterParticipation.memberId, electionVoters.memberId)),
    )
    .where(eq(electionVoters.electionId, electionId))
    .orderBy(asc(members.fullName));
}

const eligibleMember = and(eq(members.approvalStatus, "APPROVED"), eq(members.accountStatus, "ACTIVE"), isNull(members.deletedAt));

/** Add every approved, active member who is not yet on the roll. */
export async function addAllEligibleToRoll(actor: Actor, electionId: string): Promise<number> {
  assertCan(actor, "voters.write");
  return getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    await assertBallotEditable(tx, election);
    const result = await tx.execute(sql`
      INSERT INTO election_voters (election_id, member_id, added_by)
      SELECT ${electionId}::uuid, m.id, ${actor.userId}::uuid FROM members m
      WHERE m.approval_status = 'APPROVED' AND m.account_status = 'ACTIVE' AND m.deleted_at IS NULL
      ON CONFLICT DO NOTHING
    `);
    const added = result.rowCount ?? 0;
    await recordAudit(tx, actor, {
      action: "VOTER_ROLL_UPDATED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Added ${added} approved members to the voter roll of “${election.title}”`,
      metadata: { added },
    });
    return added;
  });
}

export async function addMembersToRoll(actor: Actor, electionId: string, memberIds: string[]): Promise<number> {
  assertCan(actor, "voters.write");
  const ids = [...new Set(memberIds)].filter((id) => z.uuid().safeParse(id).success);
  if (ids.length === 0) throw validationError("Select at least one member.");
  return getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    await assertBallotEditable(tx, election);
    const eligible = await tx.select({ id: members.id }).from(members).where(and(inArray(members.id, ids), eligibleMember));
    if (eligible.length === 0) throw businessRule("Only approved, active members can be added to the voter roll.");
    const inserted = await tx
      .insert(electionVoters)
      .values(eligible.map((m) => ({ electionId, memberId: m.id, addedBy: actor.userId })))
      .onConflictDoNothing()
      .returning({ memberId: electionVoters.memberId });
    await recordAudit(tx, actor, {
      action: "VOTER_ROLL_UPDATED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Added ${inserted.length} member(s) to the voter roll of “${election.title}”`,
      metadata: { added: inserted.length },
    });
    return inserted.length;
  });
}

export async function removeFromRoll(actor: Actor, electionId: string, memberId: string, reasonInput: unknown): Promise<void> {
  assertCan(actor, "voters.write");
  const reason = z.string().trim().min(5, "Please give a reason of at least 5 characters.").max(500).safeParse(reasonInput);
  if (!reason.success) throw validationError("A reason is required.", { reason: reason.error.issues.map((i) => i.message) });
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    await assertBallotEditable(tx, election);
    const removed = await tx
      .delete(electionVoters)
      .where(and(eq(electionVoters.electionId, electionId), eq(electionVoters.memberId, memberId)))
      .returning({ memberId: electionVoters.memberId });
    if (removed.length === 0) throw businessRule("This member is not on the voter roll.");
    const [m] = await tx.select({ fullName: members.fullName }).from(members).where(eq(members.id, memberId));
    await recordAudit(tx, actor, {
      action: "VOTER_ROLL_UPDATED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Removed ${m?.fullName ?? "a member"} from the voter roll of “${election.title}”`,
      reason: reason.data,
    });
  });
}

/** Approved, active members who are not yet on the roll (for the "add members" picker). */
export async function membersNotOnRoll(electionId: string, q: string | undefined, limit = 50) {
  const pattern = q ? `%${escapeLike(q)}%` : undefined;
  return getDb()
    .select({ id: members.id, fullName: members.fullName, email: members.email, membershipNumber: members.membershipNumber })
    .from(members)
    .where(
      and(
        eligibleMember,
        sql`NOT EXISTS (SELECT 1 FROM election_voters v WHERE v.election_id = ${electionId}::uuid AND v.member_id = "members"."id")`,
        pattern ? (or(ilike(members.fullName, pattern), ilike(members.email, pattern), ilike(members.membershipNumber, pattern)) as SQL) : undefined,
      ),
    )
    .orderBy(asc(members.fullName))
    .limit(limit);
}

export async function isOnRoll(electionId: string, memberId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ memberId: electionVoters.memberId })
    .from(electionVoters)
    .where(and(eq(electionVoters.electionId, electionId), eq(electionVoters.memberId, memberId)))
    .limit(1);
  return Boolean(row);
}
