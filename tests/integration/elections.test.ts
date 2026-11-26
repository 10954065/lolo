/**
 * Election lifecycle, ballot configuration, ballot freeze and emergency procedures.
 */
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/server/db/client";
import { candidatePhotos, elections, emailJobs } from "@/server/db/schema";
import { setEmailTransportForTests } from "@/server/email/transport";
import { verifyAuditChain } from "@/server/services/audit";
import { addStandardPositions, createPosition, deletePosition, listPositions, updatePosition } from "@/server/services/positions";
import { createCandidate, decideCandidate, getCandidatePhoto, updateCandidate, withdrawCandidate } from "@/server/services/candidates";
import {
  cancelElection,
  createElection,
  deleteDraftElection,
  extendVoting,
  getElection,
  postponeElection,
  syncElectionStatuses,
  transitionElection,
  updateElection,
} from "@/server/services/elections";
import { suspendMember } from "@/server/services/members";
import { addAllEligibleToRoll, listVoterRoll } from "@/server/services/voter-roll";
import { toZonedInputValue } from "@/lib/datetime";
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

/** A fully configured election ready to be scheduled: 1 position, 2 approved candidates, 3 voters. */
async function readyElection() {
  const electionId = await createElection(admin.actor, electionInput());
  const positionId = await createPosition(admin.actor, electionId, { title: "President", maxSelections: "1", allowAbstain: "on" });
  const a = await createCandidate(admin.actor, electionId, { positionId, fullName: "Candidate A" }, { approve: true });
  const b = await createCandidate(admin.actor, electionId, { positionId, fullName: "Candidate B" }, { approve: true });
  await approvedMembers(admin.actor, 3);
  await addAllEligibleToRoll(admin.actor, electionId);
  return { electionId, positionId, candidateIds: [a, b] };
}

describe("election creation", () => {
  it("creates a draft and validates the voting window", async () => {
    const id = await createElection(admin.actor, electionInput());
    expect((await getElection(id))?.status).toBe("DRAFT");
    const opens = new Date(Date.now() + 3_600_000);
    await expect(
      createElection(admin.actor, electionInput({ opensAt: toZonedInputValue(opens), closesAt: toZonedInputValue(opens) })),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { closesAt: [expect.stringMatching(/at least 15 minutes/)] } });
  });

  it("only deletes draft elections", async () => {
    const { electionId } = await readyElection();
    await transitionElection(admin.actor, electionId, "SCHEDULED");
    await expect(deleteDraftElection(admin.actor, electionId)).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    const draft = await createElection(admin.actor, electionInput({ title: "Draft to delete" }));
    await deleteDraftElection(admin.actor, draft);
    expect(await getElection(draft)).toBeNull();
  });
});

describe("positions and candidates", () => {
  it("adds the standard MOBA positions once, without duplicates", async () => {
    const id = await createElection(admin.actor, electionInput());
    expect(await addStandardPositions(admin.actor, id)).toBe(8);
    expect(await addStandardPositions(admin.actor, id)).toBe(0);
    await expect(createPosition(admin.actor, id, { title: "president", maxSelections: "1" })).rejects.toMatchObject({
      fieldErrors: { title: ["Already exists."] },
    });
    expect((await listPositions(id)).map((p) => p.position.title)[0]).toBe("President");
  });

  it("enforces one active candidacy per member and the maximum number of candidates", async () => {
    const id = await createElection(admin.actor, electionInput());
    const president = await createPosition(admin.actor, id, { title: "President", maxSelections: "1", maxCandidates: "1" });
    const treasurer = await createPosition(admin.actor, id, { title: "Treasurer", maxSelections: "1" });
    await approvedMembers(admin.actor, 1, "cand");
    await createCandidate(admin.actor, id, { positionId: president, fullName: "Cand Member 1", memberEmail: "cand1@example.com" }, { approve: true });
    await expect(
      createCandidate(admin.actor, id, { positionId: treasurer, fullName: "Cand Member 1", memberEmail: "cand1@example.com" }),
    ).rejects.toMatchObject({ fieldErrors: { memberEmail: ["Already standing for a position in this election."] } });
    const second = await createCandidate(admin.actor, id, { positionId: president, fullName: "Second Person" });
    await expect(decideCandidate(admin.actor, second, "APPROVED")).rejects.toMatchObject({ code: "BUSINESS_RULE" });
  });

  it("re-encodes candidate photos and rejects non-images", async () => {
    const id = await createElection(admin.actor, electionInput());
    const positionId = await createPosition(admin.actor, id, { title: "President", maxSelections: "1" });
    const png = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#B5171E" } }).png().toBuffer();
    const cid = await createCandidate(admin.actor, id, { positionId, fullName: "Photo Person" }, { photo: png });
    const stored = await getCandidatePhoto(cid);
    expect(stored?.photo.mimeType).toBe("image/webp");
    const meta = await sharp(stored!.photo.data).metadata();
    expect([meta.width, meta.height]).toEqual([600, 600]);
    await expect(
      updateCandidate(admin.actor, cid, { positionId, fullName: "Photo Person" }, Buffer.from("<svg onload=alert(1)>")),
    ).rejects.toMatchObject({ fieldErrors: { photo: ["Only JPEG, PNG or WebP images are accepted."] } });
    expect((await getDb().select().from(candidatePhotos)).length).toBe(1);
  });
});

describe("voter roll", () => {
  it("contains only approved, active members", async () => {
    const id = await createElection(admin.actor, electionInput());
    const [m1] = await approvedMembers(admin.actor, 2);
    await suspendMember(admin.actor, m1, "Under review by committee");
    expect(await addAllEligibleToRoll(admin.actor, id)).toBe(1);
    expect((await listVoterRoll(id, { page: 1 })).total).toBe(1);
  });
});

describe("scheduling and the ballot freeze", () => {
  it("refuses to schedule an incomplete election", async () => {
    const id = await createElection(admin.actor, electionInput());
    await expect(transitionElection(admin.actor, id, "SCHEDULED")).rejects.toMatchObject({
      message: expect.stringMatching(/Add at least one executive position.*voter roll is empty/),
    });
  });

  it("allows edits while scheduled, then locks everything once the opening time passes", async () => {
    const { electionId, positionId, candidateIds } = await readyElection();
    await transitionElection(admin.actor, electionId, "SCHEDULED");
    await updatePosition(admin.actor, positionId, { title: "President", maxSelections: "1", allowAbstain: "on" });

    await setWindow(electionId, -1, 120);
    await expect(updatePosition(admin.actor, positionId, { title: "Chairman", maxSelections: "1" })).rejects.toMatchObject({
      message: expect.stringMatching(/ballot is locked/),
    });
    await expect(createPosition(admin.actor, electionId, { title: "New", maxSelections: "1" })).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    await expect(deletePosition(admin.actor, positionId)).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    await expect(decideCandidate(admin.actor, candidateIds[0], "REJECTED", "changed my mind")).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    await expect(addAllEligibleToRoll(admin.actor, electionId)).rejects.toMatchObject({ code: "BUSINESS_RULE" });
    await expect(updateElection(admin.actor, electionId, electionInput({ title: "Renamed during voting" }))).rejects.toMatchObject({
      code: "BUSINESS_RULE",
    });
  });

  it("opens and closes automatically on the database clock and notifies voters", async () => {
    const { electionId } = await readyElection();
    await transitionElection(admin.actor, electionId, "SCHEDULED");
    await setWindow(electionId, -1, 60);
    expect(await syncElectionStatuses()).toEqual({ opened: 1, closed: 0 });
    expect((await getElection(electionId))?.status).toBe("OPEN");
    const opening = await getDb().select().from(emailJobs).where(eq(emailJobs.template, "election_opening"));
    expect(opening).toHaveLength(3);

    await setWindow(electionId, -120, -1);
    expect(await syncElectionStatuses()).toEqual({ opened: 0, closed: 1 });
    const closed = await getElection(electionId);
    expect(closed?.status).toBe("CLOSED");
    expect(closed?.ballotsMixedAt).not.toBeNull();
    expect((await verifyAuditChain()).isValid).toBe(true);
  });

  it("lets the administrator open early and close early", async () => {
    const { electionId } = await readyElection();
    await transitionElection(admin.actor, electionId, "SCHEDULED");
    await transitionElection(admin.actor, electionId, "OPEN");
    const opened = await getElection(electionId);
    expect(opened?.status).toBe("OPEN");
    expect(opened!.opensAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    await transitionElection(admin.actor, electionId, "CLOSED");
    const closed = await getElection(electionId);
    expect(closed?.status).toBe("CLOSED");
    expect(closed!.closesAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    await expect(transitionElection(admin.actor, electionId, "OPEN")).rejects.toMatchObject({ code: "BUSINESS_RULE" });
  });
});

describe("emergency procedures during voting", () => {
  it("withdraws a candidate only with step-up and a detailed reason", async () => {
    const { electionId, candidateIds } = await readyElection();
    await transitionElection(admin.actor, electionId, "SCHEDULED");
    await setWindow(electionId, -1, 60);
    await expect(withdrawCandidate(admin.actor, candidateIds[0], "Candidate passed away suddenly", false)).rejects.toMatchObject({
      code: "REAUTH_REQUIRED",
    });
    await expect(withdrawCandidate(admin.actor, candidateIds[0], "too short", true)).rejects.toMatchObject({ code: "VALIDATION" });
    await withdrawCandidate(admin.actor, candidateIds[0], "Candidate formally withdrew in writing to the committee", true);
  });

  it("extends voting and cancels with recorded reasons", async () => {
    const { electionId } = await readyElection();
    await transitionElection(admin.actor, electionId, "SCHEDULED");
    await setWindow(electionId, -1, 30);
    const newClose = toZonedInputValue(new Date(Date.now() + 90 * 60_000));
    await extendVoting(admin.actor, electionId, { closesAt: newClose, reason: "Nationwide network outage reported by members" }, true);
    expect((await getElection(electionId))!.closesAt.getTime()).toBeGreaterThan(Date.now() + 60 * 60_000);
    await cancelElection(admin.actor, electionId, "Serious irregularities reported to the committee", true);
    const cancelled = await getElection(electionId);
    expect(cancelled?.status).toBe("CANCELLED");
    expect(cancelled?.cancelledReason).toMatch(/irregularities/);
  });

  it("postpones a scheduled election before any vote", async () => {
    const { electionId } = await readyElection();
    await transitionElection(admin.actor, electionId, "SCHEDULED");
    const opens = toZonedInputValue(new Date(Date.now() + 2 * 24 * 3_600_000));
    const closes = toZonedInputValue(new Date(Date.now() + 2 * 24 * 3_600_000 + 8 * 3_600_000));
    await postponeElection(admin.actor, electionId, { opensAt: opens, closesAt: closes, reason: "Venue and network issues on the day" }, true);
    const [row] = await getDb().select().from(elections).where(eq(elections.id, electionId));
    expect(row.status).toBe("SCHEDULED");
    expect(row.opensAt.getTime()).toBeGreaterThan(Date.now() + 24 * 3_600_000);
  });
});

describe("Electoral Committee cannot manage elections", () => {
  it("is rejected by every election operation", async () => {
    const { electionId, positionId, candidateIds } = await readyElection();
    const c = committee.actor;
    const attempts = [
      () => createElection(c, electionInput()),
      () => updateElection(c, electionId, electionInput()),
      () => transitionElection(c, electionId, "SCHEDULED"),
      () => cancelElection(c, electionId, "Committee tries to cancel the election", true),
      () => createPosition(c, electionId, { title: "X", maxSelections: "1" }),
      () => updatePosition(c, positionId, { title: "X", maxSelections: "1" }),
      () => deletePosition(c, positionId),
      () => createCandidate(c, electionId, { positionId, fullName: "Sneaky" }),
      () => decideCandidate(c, candidateIds[0], "REJECTED", "no reason"),
      () => withdrawCandidate(c, candidateIds[0], "Committee tries to withdraw a candidate", true),
      () => addAllEligibleToRoll(c, electionId),
      () => deleteDraftElection(c, electionId),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
