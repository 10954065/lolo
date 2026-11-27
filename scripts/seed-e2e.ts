/**
 * Seed the dedicated END-TO-END test database (never a real one). Creates staff and voter
 * accounts with random per-run passwords and an open election, then writes the fixture to
 * test-results/e2e-fixture.json (git-ignored). Refuses unless the database name ends in "_e2e".
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";

const dbName = new URL(process.env.DATABASE_URL ?? "postgres://x/none").pathname.slice(1);
if (!dbName.endsWith("_e2e")) {
  console.error(`Refusing to seed "${dbName}": the E2E seed only runs against *_e2e databases.`);
  process.exit(1);
}

const pw = () => `E2e-${randomBytes(9).toString("base64url")}`;

async function main(): Promise<void> {
  const { getDb, closeDb } = await import("@/server/db/client");
  const { users, elections } = await import("@/server/db/schema");
  const { hashPassword } = await import("@/server/auth/password");
  const { createMember, approveMembers, rejectMember } = await import("@/server/services/members");
  const { issueCredentials } = await import("@/server/services/credentials");
  const { createElection, transitionElection } = await import("@/server/services/elections");
  const { createPosition } = await import("@/server/services/positions");
  const { createCandidate } = await import("@/server/services/candidates");
  const { addAllEligibleToRoll } = await import("@/server/services/voter-roll");
  const { toZonedInputValue } = await import("@/lib/datetime");
  const db = getDb();

  const staff = async (role: "SYSTEM_ADMIN" | "ELECTORAL_COMMITTEE", email: string) => {
    const password = pw();
    const [u] = await db
      .insert(users)
      .values({
        email,
        fullName: role === "SYSTEM_ADMIN" ? "E2E Administrator" : "E2E Committee",
        role,
        passwordHash: await hashPassword(password),
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    return { email, password, actor: { userId: u.id, role, label: email } };
  };
  const admin = await staff("SYSTEM_ADMIN", "admin@e2e.test");
  const committee = await staff("ELECTORAL_COMMITTEE", "committee@e2e.test");

  const voterEmails = ["voter1@e2e.test", "voter2@e2e.test", "voter3@e2e.test", "temp@e2e.test", "rejected@e2e.test"];
  const memberIds: string[] = [];
  for (const [i, email] of voterEmails.entries()) {
    memberIds.push(await createMember(admin.actor, { fullName: `E2E Member ${i + 1}`, email }));
  }
  await approveMembers(admin.actor, memberIds, false);
  await issueCredentials(admin.actor, memberIds);
  const passwords: Record<string, string> = {};
  for (const email of voterEmails) {
    passwords[email] = pw();
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(passwords[email]),
        mustChangePassword: email === "temp@e2e.test",
        tempPasswordExpiresAt: new Date(Date.now() + 86_400_000),
      })
      .where(sql`lower(${users.email}) = ${email}`);
  }

  const electionId = await createElection(admin.actor, {
    title: "E2E Executive Elections",
    description: "End-to-end test election",
    electionYear: "2026",
    opensAt: toZonedInputValue(new Date(Date.now() + 3_600_000)),
    closesAt: toZonedInputValue(new Date(Date.now() + 8 * 3_600_000)),
    rules: "One member, one vote.",
    instructions: "Choose one candidate per position.",
    resultsVisibility: "ELIGIBLE_VOTERS",
    tieBreakProcedure: "Run-off between tied candidates.",
  });
  const ballot = [
    ["President", ["Kwame Mensah", "Kofi Asare"]],
    ["General Secretary", ["Yaw Boateng", "Ekow Sam"]],
  ] as const;
  // One candidate gets a real photograph so the E2E suite can check images render.
  const { default: sharp } = await import("sharp");
  const photo = await sharp({ create: { width: 320, height: 320, channels: 3, background: "#b3001b" } }).png().toBuffer();
  for (const [title, names] of ballot) {
    const positionId = await createPosition(admin.actor, electionId, { title, maxSelections: "1", allowAbstain: "on" });
    for (const fullName of names) {
      await createCandidate(
        admin.actor,
        electionId,
        { positionId, fullName, biography: `${fullName} biography.` },
        { approve: true, ...(fullName === "Kwame Mensah" ? { photo } : {}) },
      );
    }
  }
  await addAllEligibleToRoll(admin.actor, electionId);
  await transitionElection(admin.actor, electionId, "SCHEDULED");
  await db.update(elections).set({ opensAt: new Date(Date.now() - 60_000) }).where(sql`${elections.id} = ${electionId}::uuid`);
  await rejectMember(admin.actor, memberIds[4], "E2E rejected member");

  mkdirSync("test-results", { recursive: true });
  const fixture = {
    electionId,
    admin: { email: admin.email, password: admin.password },
    committee: { email: committee.email, password: committee.password },
    passwords,
  };
  writeFileSync("test-results/e2e-fixture.json", JSON.stringify(fixture, null, 2));
  await closeDb();
  console.log("E2E fixture seeded.");
}

main().catch((error: unknown) => {
  console.error("Seeding failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
