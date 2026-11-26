/**
 * Member onboarding end to end: registration → approval → credential issuing →
 * email delivery → first login → forced password change → normal login.
 * Plus lockout, expiry, password reset and audit-chain integrity.
 */
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { validateSessionToken } from "@/server/auth/session";
import { closeDb, getDb } from "@/server/db/client";
import { emailJobs, members, users } from "@/server/db/schema";
import { setEmailTransportForTests } from "@/server/email/transport";
import { verifyAuditChain } from "@/server/services/audit";
import { changePassword, login, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { issueCredentials, regenerateCredentials } from "@/server/services/credentials";
import { dispatchDueEmails, retryEmailJob } from "@/server/services/email-queue";
import {
  approveMembers,
  createMember,
  getMember,
  reactivateMember,
  rejectMember,
  suspendMember,
} from "@/server/services/members";
import {
  createStaff,
  extractResetToken,
  extractTemporaryPassword,
  MemoryTransport,
  resetDatabase,
  testMeta,
  type TestStaff,
} from "../support/db";

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
  mail.clear();
  mail.shouldFail = false;
  admin = await createStaff("SYSTEM_ADMIN");
  committee = await createStaff("ELECTORAL_COMMITTEE");
});

async function onboard(email = "kwesi.mensah@example.com") {
  const memberId = await createMember(admin.actor, { fullName: "Kwesi Mensah", email, membershipNumber: "MOB-17-001" });
  await approveMembers(admin.actor, [memberId], false);
  await issueCredentials(admin.actor, [memberId]);
  await dispatchDueEmails();
  const tempPassword = extractTemporaryPassword(mail.lastTo(email)!);
  return { memberId, tempPassword, email };
}

describe("member registration", () => {
  it("registers members as PENDING and rejects duplicate email / membership number", async () => {
    const id = await createMember(admin.actor, { fullName: "Ama Owusu", email: "AMA@Example.com ", membershipNumber: "M-1" });
    const record = await getMember(id);
    expect(record?.member.email).toBe("ama@example.com");
    expect(record?.member.approvalStatus).toBe("PENDING");

    await expect(createMember(admin.actor, { fullName: "Other", email: "ama@example.com" })).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { email: ["A member with this email already exists."] },
    });
    await expect(createMember(admin.actor, { fullName: "Other", email: "x@example.com", membershipNumber: "m-1" })).rejects.toMatchObject({
      fieldErrors: { membershipNumber: ["This membership number is already registered."] },
    });
  });

  it("validates input", async () => {
    await expect(createMember(admin.actor, { fullName: "A", email: "not-an-email" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("forbids the Electoral Committee from registering, approving or issuing credentials", async () => {
    const id = await createMember(admin.actor, { fullName: "Yaw Boateng", email: "yaw@example.com" });
    await expect(createMember(committee.actor, { fullName: "X Y", email: "xy@example.com" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(approveMembers(committee.actor, [id])).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(issueCredentials(committee.actor, "ALL_ELIGIBLE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(suspendMember(committee.actor, id, "testing reason")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("credential issuing and first login", () => {
  it("only issues credentials to approved members and never re-issues silently", async () => {
    const pendingId = await createMember(admin.actor, { fullName: "Pending Person", email: "pending@example.com" });
    const first = await issueCredentials(admin.actor, [pendingId]);
    expect(first.issued).toBe(0);
    expect(first.skipped[0].reason).toMatch(/not approved/);

    await approveMembers(admin.actor, [pendingId], false);
    expect((await issueCredentials(admin.actor, "ALL_ELIGIBLE")).issued).toBe(1);
    const again = await issueCredentials(admin.actor, "ALL_ELIGIBLE");
    expect(again.issued).toBe(0);
    const direct = await issueCredentials(admin.actor, [pendingId]);
    expect(direct.skipped[0].reason).toMatch(/already issued/);
  });

  it("emails a temporary password, stores only a hash, erases the ciphertext after delivery", async () => {
    const { memberId, tempPassword, email } = await onboard();
    const [user] = await getDb().select().from(users).where(eq(users.email, email));
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(tempPassword);
    expect(user.mustChangePassword).toBe(true);
    const jobs = await getDb().select().from(emailJobs).where(eq(emailJobs.memberId, memberId));
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe("SENT");
    expect(jobs[0].encryptedSecret).toBeNull();
    expect(JSON.stringify(jobs[0].payload)).not.toContain(tempPassword);
    expect((await getMember(memberId))?.member.credentialStatus).toBe("SENT");
  });

  it("requires a password change on first login, then allows normal login", async () => {
    const { memberId, tempPassword, email } = await onboard();
    const first = await login(email, tempPassword, testMeta);
    expect(first.redirectTo).toBe("/change-password");
    const session = await validateSessionToken(first.token);
    expect(session?.user.mustChangePassword).toBe(true);

    const actor = { userId: session!.user.id, role: session!.user.role, label: email };
    await expect(
      changePassword(session!, actor, { currentPassword: tempPassword, newPassword: "short", confirmPassword: "short" }, null),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const changed = await changePassword(
      session!,
      actor,
      { currentPassword: tempPassword, newPassword: "Cape-Coast-Lighthouse-9", confirmPassword: "Cape-Coast-Lighthouse-9" },
      null,
    );
    expect(changed.redirectTo).toBe("/dashboard");
    expect(await validateSessionToken(first.token)).toBeNull(); // old session revoked
    expect(await validateSessionToken(changed.token)).not.toBeNull();
    expect((await getMember(memberId))?.member.credentialStatus).toBe("ACTIVATED");

    await expect(login(email, tempPassword, testMeta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await login(email, "Cape-Coast-Lighthouse-9", testMeta)).redirectTo).toBe("/dashboard");
  });

  it("rejects an expired temporary password", async () => {
    const { tempPassword, email } = await onboard();
    await getDb().update(users).set({ tempPasswordExpiresAt: new Date(Date.now() - 1000) }).where(eq(users.email, email));
    await expect(login(email, tempPassword, testMeta)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/temporary password has expired/),
    });
  });

  it("blocks suspended and rejected members and revokes their sessions", async () => {
    const { memberId, tempPassword, email } = await onboard();
    const { token } = await login(email, tempPassword, testMeta);
    await suspendMember(admin.actor, memberId, "Dues dispute under review");
    expect(await validateSessionToken(token)).toBeNull();
    await expect(login(email, tempPassword, testMeta)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await reactivateMember(admin.actor, memberId);
    await rejectMember(admin.actor, memberId, "Not a 2017 year-group member");
    await expect(login(email, tempPassword, testMeta)).rejects.toMatchObject({
      message: expect.stringMatching(/not currently approved/),
    });
  });

  it("regenerating credentials requires step-up and revokes the old password", async () => {
    const { memberId, tempPassword, email } = await onboard();
    await expect(regenerateCredentials(admin.actor, memberId, "Member lost the email", false)).rejects.toMatchObject({
      code: "REAUTH_REQUIRED",
    });
    await regenerateCredentials(admin.actor, memberId, "Member lost the email", true);
    await dispatchDueEmails();
    const fresh = extractTemporaryPassword(mail.lastTo(email)!);
    expect(fresh).not.toBe(tempPassword);
    await expect(login(email, tempPassword, testMeta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await login(email, fresh, testMeta)).redirectTo).toBe("/change-password");
  });
});

describe("account protection", () => {
  it("gives the same message for unknown accounts and wrong passwords", async () => {
    const { email } = await onboard();
    const unknown = await login("nobody@example.com", "whatever-123", testMeta).catch((e: Error) => e.message);
    const wrong = await login(email, "whatever-123", testMeta).catch((e: Error) => e.message);
    expect(unknown).toBe(wrong);
  });

  it("locks the account after repeated failures, even for the correct password", async () => {
    const { tempPassword, email } = await onboard();
    for (let i = 0; i < 5; i += 1) {
      await expect(login(email, `wrong-password-${i}`, testMeta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
    await expect(login(email, tempPassword, testMeta)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const [user] = await getDb().select().from(users).where(eq(users.email, email));
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("rate-limits repeated attempts for one email", async () => {
    for (let i = 0; i < 10; i += 1) {
      await login("ratelimit@example.com", "x-wrong-pass", testMeta).catch(() => undefined);
    }
    await expect(login("ratelimit@example.com", "x-wrong-pass", testMeta)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("password reset", () => {
  it("emails a single-use link and never reveals whether an account exists", async () => {
    const { email } = await onboard();
    await expect(requestPasswordReset("nobody@example.com", testMeta)).resolves.toBeUndefined();
    await requestPasswordReset(email, testMeta);
    await dispatchDueEmails();
    const token = extractResetToken(mail.lastTo(email)!);
    const [job] = await getDb().select().from(emailJobs).where(eq(emailJobs.template, "password_reset"));
    expect(JSON.stringify(job.payload)).not.toContain(token);

    await resetPassword(token, "Elmina-Castle-Gate-77", "Elmina-Castle-Gate-77", testMeta);
    await expect(resetPassword(token, "Another-Strong-Pass-1", "Another-Strong-Pass-1", testMeta)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await login(email, "Elmina-Castle-Gate-77", testMeta)).redirectTo).toBe("/dashboard");
  });
});

describe("email delivery failures", () => {
  it("retries with backoff, marks FAILED, and can be re-queued without regenerating credentials", async () => {
    const memberId = await createMember(admin.actor, { fullName: "Efua Sam", email: "efua@example.com" });
    await approveMembers(admin.actor, [memberId], false);
    await issueCredentials(admin.actor, [memberId]);
    mail.shouldFail = true;
    for (let i = 0; i < 5; i += 1) {
      await getDb().update(emailJobs).set({ nextAttemptAt: new Date(0) }).where(eq(emailJobs.memberId, memberId));
      await dispatchDueEmails();
    }
    const [job] = await getDb().select().from(emailJobs).where(eq(emailJobs.memberId, memberId));
    expect(job.status).toBe("FAILED");
    expect(job.encryptedSecret).not.toBeNull();
    expect((await getMember(memberId))?.member.credentialStatus).toBe("FAILED");
    const [{ hash: hashBefore }] = await getDb().select({ hash: users.passwordHash }).from(users).where(eq(users.email, "efua@example.com"));

    await expect(retryEmailJob(committee.actor, job.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await retryEmailJob(admin.actor, job.id);
    mail.shouldFail = false;
    await dispatchDueEmails();
    const [after] = await getDb().select().from(emailJobs).where(eq(emailJobs.id, job.id));
    expect(after.status).toBe("SENT");
    const [{ hash: hashAfter }] = await getDb().select({ hash: users.passwordHash }).from(users).where(eq(users.email, "efua@example.com"));
    expect(hashAfter).toBe(hashBefore);
    const password = extractTemporaryPassword(mail.lastTo("efua@example.com")!);
    expect((await login("efua@example.com", password, testMeta)).redirectTo).toBe("/change-password");
  });
});

describe("audit trail", () => {
  it("records onboarding actions in a verifiable hash chain without secrets", async () => {
    const { tempPassword } = await onboard();
    const result = await verifyAuditChain();
    expect(result.isValid).toBe(true);
    expect(result.checked).toBeGreaterThanOrEqual(3);
    const rows = await getDb().execute<{ blob: string }>(
      sql`SELECT string_agg(summary || coalesce(reason, '') || metadata::text, ' ') AS blob FROM audit_logs`,
    );
    expect(rows.rows[0].blob).not.toContain(tempPassword);
  });
});

describe("members table integrity", () => {
  it("keeps member and login email in sync", async () => {
    const { memberId } = await onboard();
    const [m] = await getDb().select().from(members).where(eq(members.id, memberId));
    const [u] = await getDb().select().from(users).where(eq(users.id, m.userId!));
    expect(u.email).toBe(m.email);
    expect(u.role).toBe("VOTER");
  });
});
