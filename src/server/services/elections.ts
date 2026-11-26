import "server-only";
import { and, asc, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { formatDateTime } from "@/lib/datetime";
import {
  canTransition,
  EMERGENCY_REASON_MIN,
  isBallotLocked,
  votingWindow,
} from "@/lib/election-rules";
import { SYSTEM_ACTOR, type Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import {
  candidates,
  elections,
  electionStatusHistory,
  electionVoters,
  executivePositions,
  members,
  voterParticipation,
} from "@/server/db/schema";
import type { ElectionStatus } from "@/server/db/schema/enums";
import { env } from "@/server/env";
import { businessRule, notFound, reauthRequired, validationError } from "@/server/errors";
import { logger } from "@/server/logger";
import { fieldErrorsOf, reasonField } from "@/server/validation/common";
import { electionInputSchema, zonedDateTime } from "@/server/validation/elections";
import { recordAudit } from "./audit";
import { ballotCount, mixBallots } from "./ballot-box";
import { dbNow } from "./clock";
import { enqueueEmail } from "./email-queue";

export type ElectionRow = typeof elections.$inferSelect;

// ---- Shared helpers (used by positions, candidates, voter roll, voting, results) -----------

export async function lockElection(tx: Transaction, electionId: string): Promise<ElectionRow> {
  if (!z.uuid().safeParse(electionId).success) throw notFound("Election not found.");
  const [election] = await tx.select().from(elections).where(eq(elections.id, electionId)).for("update");
  if (!election) throw notFound("Election not found.");
  return election;
}

/** Throws unless the ballot structure may still be changed (checked against the DB clock). */
export async function assertBallotEditable(tx: Transaction, election: ElectionRow): Promise<void> {
  if (isBallotLocked(election, await dbNow(tx))) {
    throw businessRule(
      "The ballot is locked because voting has started (or the election has ended). Only the documented emergency procedures are available.",
    );
  }
}

async function recordTransition(
  tx: Transaction,
  actor: Actor,
  election: ElectionRow,
  to: ElectionStatus,
  reason: string | null,
  action: string,
  summary: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await tx.insert(electionStatusHistory).values({
    electionId: election.id,
    fromStatus: election.status,
    toStatus: to,
    reason,
    actorUserId: actor.userId,
  });
  await recordAudit(tx, actor, {
    action,
    resourceType: "election",
    resourceId: election.id,
    summary,
    reason,
    metadata: { from: election.status, to, ...metadata },
  });
}

/** Queue one email per member on the voter roll (active accounts only). */
async function notifyVoterRoll(
  tx: Transaction,
  election: ElectionRow,
  template: "election_opening" | "election_closing" | "election_announcement" | "election_reminder",
  extraVars: Record<string, string> = {},
  onlyNonVoters = false,
): Promise<number> {
  const recipients = await tx
    .select({ memberId: members.id, email: members.email, fullName: members.fullName, userId: members.userId })
    .from(electionVoters)
    .innerJoin(members, eq(members.id, electionVoters.memberId))
    .leftJoin(
      voterParticipation,
      and(eq(voterParticipation.electionId, electionVoters.electionId), eq(voterParticipation.memberId, members.id)),
    )
    .where(
      and(
        eq(electionVoters.electionId, election.id),
        eq(members.accountStatus, "ACTIVE"),
        eq(members.approvalStatus, "APPROVED"),
        isNull(members.deletedAt),
        onlyNonVoters ? isNull(voterParticipation.id) : undefined,
      ),
    );
  const electionUrl = `${env().APP_URL}/dashboard/elections/${election.id}`;
  for (const r of recipients) {
    await enqueueEmail(tx, {
      template,
      to: r.email,
      vars: {
        recipientName: r.fullName,
        electionTitle: election.title,
        opensAt: formatDateTime(election.opensAt),
        closesAt: formatDateTime(election.closesAt),
        electionUrl,
        ...extraVars,
      },
      memberId: r.memberId,
      userId: r.userId,
      electionId: election.id,
    });
  }
  return recipients.length;
}

// ---- Queries ---------------------------------------------------------------------------

export async function listElections(executor: Executor = getDb()) {
  return executor
    .select({
      id: elections.id,
      title: elections.title,
      electionYear: elections.electionYear,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      resultsPublishedAt: elections.resultsPublishedAt,
      voters: sql<number>`(SELECT count(*) FROM election_voters v WHERE v.election_id = "elections"."id")`,
      positions: sql<number>`(SELECT count(*) FROM executive_positions p WHERE p.election_id = "elections"."id")`,
      approvedCandidates: sql<number>`(SELECT count(*) FROM candidates c WHERE c.election_id = "elections"."id" AND c.status = 'APPROVED')`,
      voted: sql<number>`(SELECT count(*) FROM voter_participation vp WHERE vp.election_id = "elections"."id")`,
    })
    .from(elections)
    .orderBy(desc(elections.opensAt));
}

export async function getElection(id: string, executor: Executor = getDb()): Promise<ElectionRow | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [election] = await executor.select().from(elections).where(eq(elections.id, id)).limit(1);
  return election ?? null;
}

export async function electionStatusTimeline(electionId: string) {
  return getDb()
    .select()
    .from(electionStatusHistory)
    .where(eq(electionStatusHistory.electionId, electionId))
    .orderBy(asc(electionStatusHistory.createdAt));
}

export interface ElectionCounts {
  positions: number;
  approvedCandidates: number;
  pendingCandidates: number;
  voters: number;
  voted: number;
  ballots: number;
}

export async function electionCounts(electionId: string, executor: Executor = getDb()): Promise<ElectionCounts> {
  const [[p], [c], [v], [vp], ballots] = await Promise.all([
    executor.select({ n: count() }).from(executivePositions).where(eq(executivePositions.electionId, electionId)),
    executor
      .select({
        approved: sql<number>`count(*) filter (where ${candidates.status} = 'APPROVED')`,
        pending: sql<number>`count(*) filter (where ${candidates.status} = 'PENDING')`,
      })
      .from(candidates)
      .where(eq(candidates.electionId, electionId)),
    executor.select({ n: count() }).from(electionVoters).where(eq(electionVoters.electionId, electionId)),
    executor.select({ n: count() }).from(voterParticipation).where(eq(voterParticipation.electionId, electionId)),
    ballotCount(executor, electionId),
  ]);
  return {
    positions: Number(p.n),
    approvedCandidates: Number(c.approved),
    pendingCandidates: Number(c.pending),
    voters: Number(v.n),
    voted: Number(vp.n),
    ballots,
  };
}

/** Problems that block scheduling (empty array = ready). */
export async function readinessProblems(executor: Executor, election: ElectionRow, now: Date): Promise<string[]> {
  const problems: string[] = [];
  const positions = await executor
    .select({
      title: executivePositions.title,
      approved: sql<number>`(SELECT count(*) FROM candidates c WHERE c.position_id = "executive_positions"."id" AND c.status = 'APPROVED')`,
    })
    .from(executivePositions)
    .where(eq(executivePositions.electionId, election.id));
  if (positions.length === 0) problems.push("Add at least one executive position.");
  for (const p of positions) {
    if (Number(p.approved) === 0) problems.push(`“${p.title}” has no approved candidate.`);
  }
  const [{ n: voters }] = await executor
    .select({ n: count() })
    .from(electionVoters)
    .where(eq(electionVoters.electionId, election.id));
  if (Number(voters) === 0) problems.push("The voter roll is empty.");
  if (election.opensAt.getTime() <= now.getTime()) problems.push("The opening time must be in the future.");
  return problems;
}

// ---- Create / edit / delete ------------------------------------------------------------------

function parseElectionInput(input: unknown) {
  const parsed = electionInputSchema.safeParse(input);
  if (!parsed.success) throw validationError("Please correct the highlighted fields.", fieldErrorsOf(parsed.error));
  return {
    ...parsed.data,
    description: parsed.data.description ?? "",
    rules: parsed.data.rules ?? "",
    instructions: parsed.data.instructions ?? "",
  };
}

export async function createElection(actor: Actor, input: unknown): Promise<string> {
  assertCan(actor, "elections.write");
  const data = parseElectionInput(input);
  return getDb().transaction(async (tx) => {
    const [created] = await tx
      .insert(elections)
      .values({ ...data, createdBy: actor.userId })
      .returning({ id: elections.id });
    await tx.insert(electionStatusHistory).values({ electionId: created.id, toStatus: "DRAFT", actorUserId: actor.userId });
    await recordAudit(tx, actor, {
      action: "ELECTION_CREATED",
      resourceType: "election",
      resourceId: created.id,
      summary: `Created election “${data.title}” (${formatDateTime(data.opensAt)} – ${formatDateTime(data.closesAt)})`,
    });
    return created.id;
  });
}

export async function updateElection(actor: Actor, electionId: string, input: unknown): Promise<void> {
  assertCan(actor, "elections.write");
  const data = parseElectionInput(input);
  await getDb().transaction(async (tx) => {
    const before = await lockElection(tx, electionId);
    await assertBallotEditable(tx, before);
    const now = await dbNow(tx);
    if (before.status === "SCHEDULED" && data.opensAt.getTime() <= now.getTime()) {
      throw validationError("A scheduled election must open in the future.", { opensAt: ["Choose a future time."] });
    }
    const keys = Object.keys(data) as Array<keyof typeof data>;
    const changed = keys.filter((k) => {
      const a = before[k as keyof ElectionRow];
      const b = data[k];
      return a instanceof Date && b instanceof Date ? a.getTime() !== b.getTime() : a !== b;
    });
    if (changed.length === 0) return;
    await tx.update(elections).set({ ...data, updatedAt: new Date() }).where(eq(elections.id, electionId));
    await recordAudit(tx, actor, {
      action: "ELECTION_UPDATED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Updated ${changed.join(", ")} of “${data.title}”`,
      metadata: {
        changes: Object.fromEntries(
          changed
            .filter((k) => !["description", "rules", "instructions"].includes(k))
            .map((k) => [k, { from: before[k as keyof ElectionRow], to: data[k] }]),
        ),
      },
    });
  });
}

export async function deleteDraftElection(actor: Actor, electionId: string): Promise<void> {
  assertCan(actor, "elections.write");
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    if (election.status !== "DRAFT") throw businessRule("Only draft elections can be deleted. Cancel it instead.");
    await recordAudit(tx, actor, {
      action: "ELECTION_DELETED",
      resourceType: "election",
      resourceId: electionId,
      summary: `Deleted draft election “${election.title}”`,
    });
    await tx.delete(candidates).where(eq(candidates.electionId, electionId));
    await tx.delete(elections).where(eq(elections.id, electionId));
  });
}

// ---- Lifecycle -----------------------------------------------------------------------------

/** Close voting and mix the ballot box (inside the caller's transaction, election row locked). */
async function closeInTx(tx: Transaction, actor: Actor, election: ElectionRow, reason: string | null): Promise<void> {
  const now = await dbNow(tx);
  const closesAt = election.closesAt.getTime() < now.getTime() ? election.closesAt : now;
  await tx.update(elections).set({ status: "CLOSED", closesAt, updatedAt: new Date() }).where(eq(elections.id, election.id));
  const mixed = await mixBallots(tx, election.id);
  await recordTransition(
    tx,
    actor,
    election,
    "CLOSED",
    reason,
    actor.userId ? "ELECTION_CLOSED" : "ELECTION_CLOSED_AUTOMATICALLY",
    `Voting closed for “${election.title}”; ${mixed} ballots sealed and shuffled`,
    { ballotsSealed: mixed },
  );
  await notifyVoterRoll(tx, { ...election, closesAt }, "election_closing");
}

async function openInTx(tx: Transaction, actor: Actor, election: ElectionRow): Promise<void> {
  const now = await dbNow(tx);
  if (election.closesAt.getTime() <= now.getTime()) throw businessRule("The closing time has already passed. Postpone the election to set new times.");
  const opensAt = election.opensAt.getTime() > now.getTime() ? now : election.opensAt;
  await tx.update(elections).set({ status: "OPEN", opensAt, updatedAt: new Date() }).where(eq(elections.id, election.id));
  await recordTransition(
    tx,
    actor,
    election,
    "OPEN",
    null,
    actor.userId ? "ELECTION_OPENED" : "ELECTION_OPENED_AUTOMATICALLY",
    `Voting opened for “${election.title}”${opensAt !== election.opensAt ? " (opened early by the administrator)" : ""}`,
  );
  await notifyVoterRoll(tx, { ...election, opensAt }, "election_opening");
}

export async function transitionElection(actor: Actor, electionId: string, to: ElectionStatus): Promise<void> {
  assertCan(actor, "elections.transition");
  if (to === "CANCELLED") throw businessRule("Use “Cancel election” and give a reason.");
  if (to === "RESULTS_PUBLISHED") throw businessRule("Use “Publish results” on the results page.");
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    if (!canTransition(election.status, to)) {
      throw businessRule(`An election cannot move from ${election.status} to ${to}.`);
    }
    const now = await dbNow(tx);
    if (to === "OPEN") return openInTx(tx, actor, election);
    if (to === "CLOSED") {
      if (election.status === "RESULTS_PUBLISHED") throw businessRule("Use “Unpublish results” on the results page.");
      return closeInTx(tx, actor, election, null);
    }
    if (election.status === "SCHEDULED" && isBallotLocked(election, now)) {
      throw businessRule("Voting has already started; the schedule can no longer be withdrawn.");
    }
    if (to === "SCHEDULED") {
      const problems = await readinessProblems(tx, election, now);
      if (problems.length > 0) throw businessRule(`The election is not ready to be scheduled: ${problems.join(" ")}`);
    }
    await tx
      .update(elections)
      .set({ status: to, archivedAt: to === "ARCHIVED" ? new Date() : election.archivedAt, updatedAt: new Date() })
      .where(eq(elections.id, electionId));
    await recordTransition(tx, actor, election, to, null, "ELECTION_STATUS_CHANGED", `“${election.title}” moved from ${election.status} to ${to}`);
  });
}

function parseEmergencyReason(input: unknown, min = EMERGENCY_REASON_MIN): string {
  const parsed = reasonField(min).safeParse(input);
  if (!parsed.success) throw validationError("A detailed reason is required.", { reason: parsed.error.issues.map((i) => i.message) });
  return parsed.data;
}

/** Move voting to new dates. Allowed before opening, or while open if nobody has voted yet. */
export async function postponeElection(
  actor: Actor,
  electionId: string,
  input: { opensAt: unknown; closesAt: unknown; reason: unknown },
  hasRecentReauth: boolean,
): Promise<void> {
  assertCan(actor, "elections.transition");
  if (!hasRecentReauth) throw reauthRequired();
  const reason = parseEmergencyReason(input.reason);
  const opens = zonedDateTime("New opening time").safeParse(input.opensAt);
  const closes = zonedDateTime("New closing time").safeParse(input.closesAt);
  if (!opens.success || !closes.success) throw validationError("Enter valid new voting times.");
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    const now = await dbNow(tx);
    if (!["SCHEDULED", "OPEN"].includes(election.status)) throw businessRule("Only scheduled or open elections can be postponed.");
    if (votingWindow(election, now) === "AFTER") throw businessRule("Voting has already ended.");
    const [{ n: voted }] = await tx.select({ n: count() }).from(voterParticipation).where(eq(voterParticipation.electionId, electionId));
    if (Number(voted) > 0) throw businessRule("Ballots have already been cast. Use “Extend voting” or cancel the election instead.");
    if (opens.data.getTime() <= now.getTime()) throw validationError("The new opening time must be in the future.", { opensAt: ["Choose a future time."] });
    if (closes.data.getTime() - opens.data.getTime() < 15 * 60_000) throw validationError("Voting must last at least 15 minutes.", { closesAt: ["Too short."] });
    await tx
      .update(elections)
      .set({ status: "SCHEDULED", opensAt: opens.data, closesAt: closes.data, updatedAt: new Date() })
      .where(eq(elections.id, electionId));
    await recordTransition(
      tx,
      actor,
      election,
      "SCHEDULED",
      reason,
      "ELECTION_POSTPONED",
      `Postponed “${election.title}” to ${formatDateTime(opens.data)} – ${formatDateTime(closes.data)}`,
      { previousOpensAt: election.opensAt, previousClosesAt: election.closesAt },
    );
    await notifyVoterRoll(tx, { ...election, opensAt: opens.data, closesAt: closes.data }, "election_announcement", {
      announcementTitle: `Election postponed: ${election.title}`,
      announcementBody: `Voting has been rescheduled. It will now open on ${formatDateTime(opens.data)} and close on ${formatDateTime(closes.data)}. Reason: ${reason}`,
    });
  });
}

/** EMERGENCY: extend the closing time of an election that is currently accepting votes. */
export async function extendVoting(
  actor: Actor,
  electionId: string,
  input: { closesAt: unknown; reason: unknown },
  hasRecentReauth: boolean,
): Promise<void> {
  assertCan(actor, "elections.transition");
  if (!hasRecentReauth) throw reauthRequired();
  const reason = parseEmergencyReason(input.reason);
  const closes = zonedDateTime("New closing time").safeParse(input.closesAt);
  if (!closes.success) throw validationError("Enter a valid new closing time.", { closesAt: ["Invalid date and time."] });
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    const now = await dbNow(tx);
    if (!["SCHEDULED", "OPEN"].includes(election.status) || votingWindow(election, now) !== "DURING") {
      throw businessRule("Voting can only be extended while it is in progress.");
    }
    if (closes.data.getTime() <= election.closesAt.getTime()) {
      throw validationError("The new closing time must be later than the current one.", { closesAt: ["Must be later."] });
    }
    await tx.update(elections).set({ closesAt: closes.data, updatedAt: new Date() }).where(eq(elections.id, electionId));
    await recordAudit(tx, actor, {
      action: "EMERGENCY_VOTING_EXTENDED",
      resourceType: "election",
      resourceId: electionId,
      summary: `EMERGENCY: extended voting for “${election.title}” from ${formatDateTime(election.closesAt)} to ${formatDateTime(closes.data)}`,
      reason,
    });
    await notifyVoterRoll(tx, { ...election, closesAt: closes.data }, "election_announcement", {
      announcementTitle: `Voting extended: ${election.title}`,
      announcementBody: `Voting will now close on ${formatDateTime(closes.data)}.`,
    }, true);
  });
}

export async function cancelElection(actor: Actor, electionId: string, reasonInput: unknown, hasRecentReauth: boolean): Promise<void> {
  assertCan(actor, "elections.transition");
  if (!hasRecentReauth) throw reauthRequired();
  const reason = parseEmergencyReason(reasonInput);
  await getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    if (["RESULTS_PUBLISHED", "ARCHIVED", "CANCELLED"].includes(election.status)) {
      throw businessRule("This election can no longer be cancelled.");
    }
    const now = await dbNow(tx);
    const isDuringVoting = ["SCHEDULED", "OPEN"].includes(election.status) && votingWindow(election, now) === "DURING";
    await tx.update(elections).set({ status: "CANCELLED", cancelledReason: reason, updatedAt: new Date() }).where(eq(elections.id, electionId));
    await recordTransition(
      tx,
      actor,
      election,
      "CANCELLED",
      reason,
      isDuringVoting ? "EMERGENCY_ELECTION_CANCELLED" : "ELECTION_CANCELLED",
      `${isDuringVoting ? "EMERGENCY: " : ""}Cancelled election “${election.title}”`,
    );
    if (election.status !== "DRAFT") {
      await notifyVoterRoll(tx, election, "election_announcement", {
        announcementTitle: `Election cancelled: ${election.title}`,
        announcementBody: `This election has been cancelled. Reason: ${reason}`,
      });
    }
  });
}

/** Ask members on the roll who have not voted yet to vote (while voting is open). */
export async function sendVotingReminder(actor: Actor, electionId: string): Promise<number> {
  assertCan(actor, "elections.transition");
  return getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    if (votingWindow(election, await dbNow(tx)) !== "DURING" || !["SCHEDULED", "OPEN"].includes(election.status)) {
      throw businessRule("Reminders can only be sent while voting is open.");
    }
    const sent = await notifyVoterRoll(tx, election, "election_reminder", {}, true);
    await recordAudit(tx, actor, {
      action: "VOTING_REMINDER_SENT",
      resourceType: "election",
      resourceId: electionId,
      summary: `Sent a voting reminder to ${sent} members who have not voted in “${election.title}”`,
    });
    return sent;
  });
}

// ---- Scheduler -------------------------------------------------------------------------------

/**
 * Persist time-driven transitions: SCHEDULED → OPEN at the opening time and
 * SCHEDULED/OPEN → CLOSED at the closing time. Safe to call concurrently and repeatedly.
 * Vote acceptance never depends on this having run (it checks the DB clock itself).
 */
export async function syncElectionStatuses(electionIds?: string[]): Promise<{ opened: number; closed: number }> {
  const db = getDb();
  const now = await dbNow(db);
  const due = await db
    .select({ id: elections.id })
    .from(elections)
    .where(
      and(
        inArray(elections.status, ["SCHEDULED", "OPEN"]),
        sql`(${elections.closesAt} <= ${now} OR (${elections.status} = 'SCHEDULED' AND ${elections.opensAt} <= ${now}))`,
        electionIds?.length ? inArray(elections.id, electionIds) : undefined,
      ),
    );
  let opened = 0;
  let closed = 0;
  for (const { id } of due) {
    try {
      await db.transaction(async (tx) => {
        const election = await lockElection(tx, id);
        const txNow = await dbNow(tx);
        const window = votingWindow(election, txNow);
        if (["SCHEDULED", "OPEN"].includes(election.status) && window === "AFTER") {
          await closeInTx(tx, SYSTEM_ACTOR, election, null);
          closed += 1;
        } else if (election.status === "SCHEDULED" && window === "DURING") {
          await openInTx(tx, SYSTEM_ACTOR, election);
          opened += 1;
        }
      });
    } catch (error) {
      logger.error("election status sync failed", error, { electionId: id });
    }
  }
  return { opened, closed };
}

/** Elections whose scheduled times are due — used by pages to sync lazily. */
export async function hasDueTransitions(): Promise<boolean> {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(elections)
    .where(
      and(
        inArray(elections.status, ["SCHEDULED", "OPEN"]),
        sql`(${elections.closesAt} <= now() OR (${elections.status} = 'SCHEDULED' AND ${elections.opensAt} <= now()))`,
      ),
    );
  return Number(n) > 0;
}

export async function syncIfDue(): Promise<void> {
  if (await hasDueTransitions()) await syncElectionStatuses();
}
