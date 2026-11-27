/**
 * Secure voting engine — acceptance tests for eligibility, timing, one-ballot-per-member,
 * concurrency, atomicity and secrecy.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Actor } from "@/server/auth/actor";
import { closeDb, getDb } from "@/server/db/client";
import { emailJobs, members, users, voterParticipation } from "@/server/db/schema";
import { setEmailTransportForTests } from "@/server/email/transport";
import { ballotCount } from "@/server/services/ballot-box";
import { createCandidate, withdrawCandidate } from "@/server/services/candidates";
import { issueCredentials } from "@/server/services/credentials";
import { createElection, transitionElection } from "@/server/services/elections";
import { createMember, suspendMember } from "@/server/services/members";
import { createPosition } from "@/server/services/positions";
import { addAllEligibleToRoll } from "@/server/services/voter-roll";
import { ABSTAIN, castBallot, verifyReceipt, voterElectionView } from "@/server/services/voting";
import { asOwner, createStaff, MemoryTransport, resetDatabase, type TestStaff } from "../support/db";
import { approvedMembers, electionInput, setWindow } from "../support/elections";

const mail = new MemoryTransport();
let admin: TestStaff;

interface Voter {
  memberId: string;
  actor: Actor;
}

export interface VotingSetup {
  electionId: string;
  president: string;
  treasurer: string;
  cands: { pA: string; pB: string; tA: string; tB: string };
  voters: Voter[];
}

beforeAll(() => setEmailTransportForTests(mail));
afterAll(async () => {
  setEmailTransportForTests(null);
  await closeDb();
});
beforeEach(async () => {
  await resetDatabase();
  admin = await createStaff("SYSTEM_ADMIN");
});

/** Election with 2 positions × 2 candidates and `voterCount` activated voters, voting open. */
async function openElection(voterCount = 5, options: { allowAbstainTreasurer?: boolean } = {}): Promise<VotingSetup> {
  const electionId = await createElection(admin.actor, electionInput());
  const president = await createPosition(admin.actor, electionId, { title: "President", maxSelections: "1", allowAbstain: "on" });
  const treasurer = await createPosition(admin.actor, electionId, {
    title: "Treasurer",
    maxSelections: "1",
    allowAbstain: options.allowAbstainTreasurer === false ? "" : "on",
  });
  const approve = { approve: true };
  const cands = {
    pA: await createCandidate(admin.actor, electionId, { positionId: president, fullName: "President A" }, approve),
    pB: await createCandidate(admin.actor, electionId, { positionId: president, fullName: "President B" }, approve),
    tA: await createCandidate(admin.actor, electionId, { positionId: treasurer, fullName: "Treasurer A" }, approve),
    tB: await createCandidate(admin.actor, electionId, { positionId: treasurer, fullName: "Treasurer B" }, approve),
  };
  const memberIds = await approvedMembers(admin.actor, voterCount);
  await issueCredentials(admin.actor, memberIds);
  await getDb().update(users).set({ mustChangePassword: false }).where(sql`${users.role} = 'VOTER'`);
  await addAllEligibleToRoll(admin.actor, electionId);
  await transitionElection(admin.actor, electionId, "SCHEDULED");
  await setWindow(electionId, -1, 60);
  const rows = await getDb().select({ id: members.id, userId: members.userId }).from(members);
  const voters = memberIds.map((memberId) => ({
    memberId,
    actor: { userId: rows.find((r) => r.id === memberId)!.userId!, role: "VOTER" as const, label: "voter" },
  }));
  return { electionId, president, treasurer, cands, voters };
}

function ballot(s: VotingSetup, president: string, treasurer: string) {
  return { [s.president]: [president], [s.treasurer]: [treasurer] };
}

async function participationCount(electionId: string): Promise<number> {
  return (await getDb().select().from(voterParticipation).where(eq(voterParticipation.electionId, electionId))).length;
}

describe("eligibility", () => {
  it("rejects members who are not approved or not on the roll", async () => {
    const s = await openElection(1);
    const outsider = await createMember(admin.actor, { fullName: "Not Approved", email: "pending@example.com" });
    const anon: Actor = { userId: null, role: "VOTER", label: "x" };
    await expect(castBallot(anon, outsider, s.electionId, ballot(s, s.cands.pA, s.cands.tA))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("re-checks eligibility at the moment of voting (suspended after the roll froze)", async () => {
    const s = await openElection(2);
    const v = s.voters[0];
    await suspendMember(admin.actor, v.memberId, "Suspended pending investigation");
    await expect(castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects staff accounts outright", async () => {
    const s = await openElection(1);
    await expect(
      castBallot(admin.actor, s.voters[0].memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA)),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("voting window (database clock)", () => {
  it("rejects ballots before opening and after closing", async () => {
    const s = await openElection(1);
    const v = s.voters[0];
    await setWindow(s.electionId, 30, 90);
    await expect(castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA))).rejects.toMatchObject({
      message: expect.stringMatching(/not started/),
    });
    await setWindow(s.electionId, -90, -1);
    await expect(castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA))).rejects.toMatchObject({
      message: expect.stringMatching(/Voting has ended/),
    });
    expect(await participationCount(s.electionId)).toBe(0);
  });

  it("rejects new ballots once the administrator closes the election", async () => {
    const s = await openElection(2);
    await castBallot(s.voters[0].actor, s.voters[0].memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA));
    await transitionElection(admin.actor, s.electionId, "CLOSED");
    await expect(
      castBallot(s.voters[1].actor, s.voters[1].memberId, s.electionId, ballot(s, s.cands.pB, s.cands.tB)),
    ).rejects.toMatchObject({ message: expect.stringMatching(/Voting has ended/) });
  });
});

describe("casting a ballot", () => {
  it("records participation and an anonymous ballot, and returns a verifiable receipt", async () => {
    const s = await openElection(2);
    const v = s.voters[0];
    const result = await castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA));
    expect(result.receipt).toMatch(/^MOBA(-[0-9A-Z]{5}){5}$/);
    expect(await participationCount(s.electionId)).toBe(1);
    expect(await ballotCount(getDb(), s.electionId)).toBe(1);
    expect(await verifyReceipt(result.receipt.toLowerCase(), null)).toEqual({
      isFound: true,
      electionTitle: "MOBA 2017 Executive Elections",
    });
    expect((await verifyReceipt("MOBA-AAAAA-AAAAA-AAAAA-AAAAA-AAAAA", null)).isFound).toBe(false);
    const view = await voterElectionView(v.memberId, s.electionId);
    expect(view?.votedAt).not.toBeNull();
    expect(view?.canVoteNow).toBe(false);
  });

  it("supports abstention only where allowed", async () => {
    const s = await openElection(2, { allowAbstainTreasurer: false });
    await castBallot(s.voters[0].actor, s.voters[0].memberId, s.electionId, {
      [s.president]: [ABSTAIN],
      [s.treasurer]: [s.cands.tA],
    });
    await expect(
      castBallot(s.voters[1].actor, s.voters[1].memberId, s.electionId, {
        [s.president]: [s.cands.pA],
        [s.treasurer]: [ABSTAIN],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it.each([
    ["missing position", (s: VotingSetup) => ({ [s.president]: [s.cands.pA] })],
    ["candidate from another position", (s: VotingSetup) => ballot(s, s.cands.tA, s.cands.tB)],
    ["too many choices", (s: VotingSetup) => ({ [s.president]: [s.cands.pA, s.cands.pB], [s.treasurer]: [s.cands.tA] })],
    ["abstain plus a candidate", (s: VotingSetup) => ({ [s.president]: [ABSTAIN, s.cands.pA], [s.treasurer]: [s.cands.tA] })],
    [
      "unknown position",
      (s: VotingSetup) => ({ ...ballot(s, s.cands.pA, s.cands.tA), "00000000-0000-4000-8000-000000000000": [s.cands.pA] }),
    ],
  ])("rejects an invalid ballot (%s) and records nothing", async (_name, build) => {
    const s = await openElection(1);
    await expect(castBallot(s.voters[0].actor, s.voters[0].memberId, s.electionId, build(s))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await participationCount(s.electionId)).toBe(0);
    expect(await ballotCount(getDb(), s.electionId)).toBe(0);
  });

  it("does not accept votes for a candidate withdrawn during voting", async () => {
    const s = await openElection(1);
    await withdrawCandidate(admin.actor, s.cands.pB, "Candidate withdrew in writing to the committee", true);
    await expect(
      castBallot(s.voters[0].actor, s.voters[0].memberId, s.electionId, ballot(s, s.cands.pB, s.cands.tA)),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("one ballot per member", () => {
  it("rejects a second ballot and leaves the first unchanged", async () => {
    const s = await openElection(1);
    const v = s.voters[0];
    await castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA));
    await expect(castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pB, s.cands.tB))).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringMatching(/already voted/),
    });
    expect(await ballotCount(getDb(), s.electionId)).toBe(1);
  });

  it("records exactly one ballot when the same member submits concurrently (double click / many tabs)", async () => {
    const s = await openElection(1);
    const v = s.voters[0];
    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        castBallot(v.actor, v.memberId, s.electionId, ballot(s, i % 2 ? s.cands.pA : s.cands.pB, s.cands.tA)),
      ),
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.filter((a): a is PromiseRejectedResult => a.status === "rejected");
    expect(rejected.every((a) => a.reason.code === "CONFLICT")).toBe(true);
    expect(await participationCount(s.electionId)).toBe(1);
    expect(await ballotCount(getDb(), s.electionId)).toBe(1);
  });

  it("accepts many different voters concurrently with matching counts", async () => {
    const s = await openElection(20);
    const results = await Promise.allSettled(
      s.voters.map((v, i) => castBallot(v.actor, v.memberId, s.electionId, ballot(s, i % 3 ? s.cands.pA : s.cands.pB, s.cands.tB))),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await participationCount(s.electionId)).toBe(20);
    expect(await ballotCount(getDb(), s.electionId)).toBe(20);
  });
});

describe("atomicity", () => {
  it("leaves no participation and no partial ballot when the transaction fails midway", async () => {
    const s = await openElection(2);
    const fixed = "MOBA-00000-00000-00000-00000-00000";
    await castBallot(s.voters[0].actor, s.voters[0].memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA), {
      receiptFactory: () => fixed,
    });
    // Same receipt → the ballot insert fails AFTER participation was inserted in the same transaction.
    await expect(
      castBallot(s.voters[1].actor, s.voters[1].memberId, s.electionId, ballot(s, s.cands.pB, s.cands.tB), {
        receiptFactory: () => fixed,
      }),
    ).rejects.toThrow();
    expect(await participationCount(s.electionId)).toBe(1);
    expect(await ballotCount(getDb(), s.electionId)).toBe(1);
    const selections = await asOwner((c) =>
      c.query<{ n: number }>("SELECT count(*)::int AS n FROM ballot_selections WHERE election_id = $1", [s.electionId]),
    );
    expect(selections.rows[0].n).toBe(2);
    // The voter whose transaction failed can still vote.
    await castBallot(s.voters[1].actor, s.voters[1].memberId, s.electionId, ballot(s, s.cands.pB, s.cands.tB));
  });
});

describe("closing while ballots are being cast", () => {
  it("keeps ballots equal to participation and refuses ballots after the close", async () => {
    const s = await openElection(15);
    const votes = s.voters.map((v) =>
      castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA)).then(
        () => "ok",
        () => "rejected",
      ),
    );
    await Promise.all([...votes, transitionElection(admin.actor, s.electionId, "CLOSED")]);
    expect(await participationCount(s.electionId)).toBe(await ballotCount(getDb(), s.electionId));
    // After the close every member — whether or not they got in before it — is refused.
    for (const v of s.voters.slice(0, 3)) {
      await expect(castBallot(v.actor, v.memberId, s.electionId, ballot(s, s.cands.pB, s.cands.tB))).rejects.toMatchObject({
        code: expect.stringMatching(/BUSINESS_RULE|CONFLICT/),
      });
    }
    expect(await participationCount(s.electionId)).toBe(await ballotCount(getDb(), s.electionId));
  });
});

describe("secrecy", () => {
  it("stores no voter reference, timestamp or readable receipt on the ballot side", async () => {
    const s = await openElection(1);
    const { receipt } = await castBallot(s.voters[0].actor, s.voters[0].memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA));
    const columns = await asOwner((c) =>
      c.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name IN ('ballots','ballot_selections')",
      ),
    );
    const identifying = /member|user|voter|time|_at$|^ip_|address|agent|device|session/;
    expect(columns.rows.map((r) => r.column_name).filter((n) => identifying.test(n))).toEqual([]);
    const stored = await asOwner((c) => c.query("SELECT receipt_hash FROM ballots"));
    expect(JSON.stringify(stored.rows)).not.toContain(receipt.replace(/-/g, "").slice(4));
  });

  it("the confirmation email reveals neither choices nor the receipt", async () => {
    const s = await openElection(1);
    const { receipt } = await castBallot(s.voters[0].actor, s.voters[0].memberId, s.electionId, ballot(s, s.cands.pA, s.cands.tA));
    const [job] = await getDb().select().from(emailJobs).where(eq(emailJobs.template, "vote_confirmation"));
    const blob = JSON.stringify(job);
    expect(blob).not.toContain(receipt);
    expect(blob).not.toContain("President A");
    expect(blob).not.toContain(s.cands.pA);
  });

  it("the application cannot tally while voting is open", async () => {
    const s = await openElection(1);
    await expect(getDb().execute(sql`SELECT * FROM election_tally(${s.electionId}::uuid)`)).rejects.toThrow();
  });
});
