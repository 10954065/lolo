/**
 * Results: accurate counts from anonymous ballots, sealed until close, publication snapshot,
 * visibility rules, ties never auto-resolved, reports never link voters to choices.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb, getDb } from "@/server/db/client";
import { electionResults, members, users } from "@/server/db/schema";
import { setEmailTransportForTests } from "@/server/email/transport";
import { createCandidate } from "@/server/services/candidates";
import { issueCredentials } from "@/server/services/credentials";
import { createElection, getElection, transitionElection } from "@/server/services/elections";
import { createPosition } from "@/server/services/positions";
import {
  canViewPublishedResults,
  provisionalResults,
  publishedSnapshot,
  publishResults,
  recordTieResolution,
  unpublishResults,
} from "@/server/services/results";
import { addAllEligibleToRoll, exportVoterRoll } from "@/server/services/voter-roll";
import { ABSTAIN, castBallot } from "@/server/services/voting";
import type { ValidSession } from "@/server/auth/session";
import { createStaff, MemoryTransport, resetDatabase, type TestStaff } from "../support/db";
import { approvedMembers, electionInput, setWindow } from "../support/elections";

const mail = new MemoryTransport();
let admin: TestStaff;
let committee: TestStaff;

beforeAll(() => setEmailTransportForTests(mail));
afterAll(async () => {
  setEmailTransportForTests(null);
  await closeDb();
});
beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("SYSTEM_ADMIN");
  committee = await createStaff("ELECTORAL_COMMITTEE");
});

/** 6 voters: President A×4, B×1, abstain×1; Treasurer A×3, B×3 (tie). */
async function votedElection() {
  const electionId = await createElection(admin.actor, electionInput());
  const president = await createPosition(admin.actor, electionId, { title: "President", maxSelections: "1", allowAbstain: "on" });
  const treasurer = await createPosition(admin.actor, electionId, { title: "Treasurer", maxSelections: "1", allowAbstain: "on" });
  const ok = { approve: true };
  const pA = await createCandidate(admin.actor, electionId, { positionId: president, fullName: "President A" }, ok);
  const pB = await createCandidate(admin.actor, electionId, { positionId: president, fullName: "President B" }, ok);
  const tA = await createCandidate(admin.actor, electionId, { positionId: treasurer, fullName: "Treasurer A" }, ok);
  const tB = await createCandidate(admin.actor, electionId, { positionId: treasurer, fullName: "Treasurer B" }, ok);
  const memberIds = await approvedMembers(admin.actor, 6);
  const outsider = (await approvedMembers(admin.actor, 1, "outsider"))[0];
  await issueCredentials(admin.actor, [...memberIds, outsider]);
  await getDb().update(users).set({ mustChangePassword: false }).where(sql`${users.role} = 'VOTER'`);
  await addAllEligibleToRoll(admin.actor, electionId);
  await getDb().execute(sql`DELETE FROM election_voters WHERE member_id = ${outsider}::uuid`);
  await transitionElection(admin.actor, electionId, "SCHEDULED");
  await setWindow(electionId, -1, 60);
  const rows = await getDb().select({ id: members.id, userId: members.userId }).from(members);
  const actorFor = (m: string): Actor => ({ userId: rows.find((r) => r.id === m)!.userId!, role: "VOTER", label: "v" });
  const plan: Array<[string, string]> = [
    [pA, tA],
    [pA, tA],
    [pA, tA],
    [pA, tB],
    [pB, tB],
    [ABSTAIN, tB],
  ];
  for (const [i, [p, t]] of plan.entries()) {
    await castBallot(actorFor(memberIds[i]), memberIds[i], electionId, { [president]: [p], [treasurer]: [t] });
  }
  const session = (memberId: string): ValidSession => ({
    sessionId: "s",
    expiresAt: new Date(Date.now() + 60_000),
    reauthenticatedAt: null,
    user: { id: actorFor(memberId).userId!, email: "x", fullName: "x", role: "VOTER", status: "ACTIVE", mustChangePassword: false, memberId },
  });
  return { electionId, president, treasurer, pA, pB, tA, tB, voterSession: session(memberIds[0]), outsiderSession: session(outsider) };
}

describe("results", () => {
  it("are sealed while voting is open", async () => {
    const e = await votedElection();
    await expect(provisionalResults(admin.actor, e.electionId)).rejects.toMatchObject({ code: "BUSINESS_RULE" });
  });

  it("are counted exactly from the anonymous ballots after closing", async () => {
    const e = await votedElection();
    await transitionElection(admin.actor, e.electionId, "CLOSED");
    const r = await provisionalResults(admin.actor, e.electionId);
    expect(r.eligibleVoters).toBe(6);
    expect(r.ballotsCast).toBe(6);
    expect(r.turnoutPercent).toBe(100);
    expect(r.isConsistent).toBe(true);
    const president = r.positions.find((p) => p.title === "President")!;
    expect(president.candidates.map((c) => [c.fullName, c.votes, c.percent, c.isWinner])).toEqual([
      ["President A", 4, 66.7, true],
      ["President B", 1, 16.7, false],
    ]);
    expect(president.abstentions).toBe(1);
    const treasurer = r.positions.find((p) => p.title === "Treasurer")!;
    expect(treasurer.hasTie).toBe(true);
    expect(treasurer.candidates.every((c) => c.isTied && !c.isWinner)).toBe(true);
  });

  it("are never visible to the committee before publication and need step-up to publish", async () => {
    const e = await votedElection();
    await transitionElection(admin.actor, e.electionId, "CLOSED");
    await expect(provisionalResults(committee.actor, e.electionId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(publishResults(committee.actor, e.electionId, true)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(publishResults(admin.actor, e.electionId, false)).rejects.toMatchObject({ code: "REAUTH_REQUIRED" });
    const election = await getElection(e.electionId);
    expect(await canViewPublishedResults(e.voterSession, election!)).toBe(false);
  });

  it("publishes a hashed snapshot visible to eligible voters only (default visibility)", async () => {
    const e = await votedElection();
    await transitionElection(admin.actor, e.electionId, "CLOSED");
    await publishResults(admin.actor, e.electionId, true);
    const published = await publishedSnapshot(e.electionId);
    expect(published?.sha256).toMatch(/^[0-9a-f]{64}$/);
    const election = await getElection(e.electionId);
    expect(election?.status).toBe("RESULTS_PUBLISHED");
    expect(await canViewPublishedResults(e.voterSession, election!)).toBe(true);
    expect(await canViewPublishedResults(e.outsiderSession, election!)).toBe(false);
    expect(await canViewPublishedResults(null, election!)).toBe(false);
    await unpublishResults(admin.actor, e.electionId, "Correction requested by the Electoral Committee", true);
    expect(await getDb().select().from(electionResults).where(eq(electionResults.electionId, e.electionId))).toHaveLength(0);
  });

  it("records a tie-break outcome without changing any count", async () => {
    const e = await votedElection();
    await transitionElection(admin.actor, e.electionId, "CLOSED");
    const input = { positionId: e.treasurer, winnerCandidateId: e.tA, method: "Run-off vote held on 12 Dec", notes: "" };
    await expect(recordTieResolution(admin.actor, e.electionId, { ...input, positionId: e.president, winnerCandidateId: e.pB }, true)).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });
    await recordTieResolution(admin.actor, e.electionId, input, true);
    const r = await provisionalResults(admin.actor, e.electionId);
    expect(r.positions.find((p) => p.title === "Treasurer")!.candidates.map((c) => c.votes)).toEqual([3, 3]);
  });

  it("participation reports contain who and when, never choices", async () => {
    const e = await votedElection();
    const roll = await exportVoterRoll(e.electionId);
    expect(Object.keys(roll[0]).sort()).toEqual(["accountStatus", "credentialStatus", "email", "fullName", "membershipNumber", "votedAt"]);
  });
});
