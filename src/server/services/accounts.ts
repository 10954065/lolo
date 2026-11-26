import "server-only";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { formatDateTime } from "@/lib/datetime";
import type { Actor } from "@/server/auth/actor";
import { generateTemporaryPassword, hashPassword } from "@/server/auth/password";
import { assertCan } from "@/server/auth/permissions";
import { invalidateUserSessions } from "@/server/auth/session";
import { getDb, type Transaction } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { env } from "@/server/env";
import { businessRule, notFound, reauthRequired, validationError } from "@/server/errors";
import { emailField, fieldErrorsOf, reasonField, requiredText } from "@/server/validation/common";
import { recordAudit } from "./audit";
import { enqueueEmail } from "./email-queue";

export const STAFF_ROLES = ["SYSTEM_ADMIN", "ELECTORAL_COMMITTEE"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];
const STAFF_TEMP_PASSWORD_HOURS = 48;

export const ROLE_LABELS: Record<StaffRole, string> = {
  SYSTEM_ADMIN: "System Administrator",
  ELECTORAL_COMMITTEE: "Electoral Committee",
};

const staffInputSchema = z.object({
  fullName: requiredText("Full name", 2, 120),
  email: emailField,
  role: z.enum(STAFF_ROLES, { error: "Choose a role." }),
});

function requireStepUp(hasRecentReauth: boolean): void {
  if (!hasRecentReauth) throw reauthRequired();
}

async function lockStaff(tx: Transaction, id: string) {
  if (!z.uuid().safeParse(id).success) throw notFound("Account not found.");
  const [user] = await tx.select().from(users).where(eq(users.id, id)).for("update");
  if (!user || user.role === "VOTER") throw notFound("Account not found.");
  return user;
}

/** Ensure at least one other active System Administrator remains. */
async function assertAnotherActiveAdmin(tx: Transaction, excludingId: string): Promise<void> {
  const [{ n }] = await tx
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, "SYSTEM_ADMIN"), eq(users.status, "ACTIVE"), ne(users.id, excludingId)));
  if (Number(n) === 0) throw businessRule("At least one active System Administrator must remain.");
}

export async function listStaffAccounts() {
  return getDb()
    .select({
      id: users.id,
      fullName: users.fullName,
      email: users.email,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil,
      createdAt: users.createdAt,
      // Fully qualified: drizzle renders columns unqualified in single-table selects.
      activeSessions: sql<number>`(SELECT count(*) FROM sessions s WHERE s.user_id = "users"."id" AND s.expires_at > now())`,
    })
    .from(users)
    .where(ne(users.role, "VOTER"))
    .orderBy(asc(users.role), asc(users.fullName));
}

async function sendStaffCredentials(tx: Transaction, user: { id: string; email: string; fullName: string }, role: StaffRole) {
  const temporaryPassword = generateTemporaryPassword(16);
  const expiresAt = new Date(Date.now() + STAFF_TEMP_PASSWORD_HOURS * 60 * 60 * 1000);
  await tx
    .update(users)
    .set({
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      tempPasswordExpiresAt: expiresAt,
      failedLoginAttempts: 0,
      lockedUntil: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  await enqueueEmail(tx, {
    template: "credentials",
    to: user.email,
    vars: {
      recipientName: user.fullName,
      loginEmail: user.email,
      loginUrl: `${env().APP_URL}/login`,
      expiresAt: `${formatDateTime(expiresAt)} (${ROLE_LABELS[role]} account)`,
    },
    secrets: { temporaryPassword },
    userId: user.id,
  });
}

export async function createStaffAccount(actor: Actor, input: unknown, hasRecentReauth: boolean): Promise<string> {
  assertCan(actor, "accounts.manage");
  requireStepUp(hasRecentReauth);
  const parsed = staffInputSchema.safeParse(input);
  if (!parsed.success) throw validationError("Please correct the highlighted fields.", fieldErrorsOf(parsed.error));
  const data = parsed.data;
  return getDb().transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${data.email}`).limit(1);
    if (existing) throw validationError("An account with this email already exists.", { email: ["An account with this email already exists."] });
    const [created] = await tx
      .insert(users)
      .values({ email: data.email, fullName: data.fullName, role: data.role, createdBy: actor.userId })
      .returning({ id: users.id, email: users.email, fullName: users.fullName });
    await sendStaffCredentials(tx, created, data.role);
    await recordAudit(tx, actor, {
      action: "STAFF_ACCOUNT_CREATED",
      resourceType: "user",
      resourceId: created.id,
      summary: `Created ${ROLE_LABELS[data.role]} account for ${data.fullName} <${data.email}>`,
      metadata: { role: data.role },
    });
    return created.id;
  });
}

export async function changeStaffRole(actor: Actor, id: string, roleInput: unknown, reasonInput: unknown, hasRecentReauth: boolean): Promise<void> {
  assertCan(actor, "accounts.manage");
  requireStepUp(hasRecentReauth);
  const role = z.enum(STAFF_ROLES).safeParse(roleInput);
  if (!role.success) throw validationError("Choose a valid role.");
  const reason = reasonField(5).safeParse(reasonInput);
  if (!reason.success) throw validationError("A reason is required.", { reason: reason.error.issues.map((i) => i.message) });
  if (id === actor.userId) throw businessRule("You cannot change your own role.");
  await getDb().transaction(async (tx) => {
    const user = await lockStaff(tx, id);
    if (user.role === role.data) throw businessRule("The account already has this role.");
    if (user.role === "SYSTEM_ADMIN") await assertAnotherActiveAdmin(tx, id);
    await tx.update(users).set({ role: role.data, updatedAt: new Date() }).where(eq(users.id, id));
    await invalidateUserSessions(tx, id);
    await recordAudit(tx, actor, {
      action: "PERMISSIONS_CHANGED",
      resourceType: "user",
      resourceId: id,
      summary: `Changed role of ${user.fullName} from ${ROLE_LABELS[user.role as StaffRole]} to ${ROLE_LABELS[role.data]}`,
      reason: reason.data,
      metadata: { from: user.role, to: role.data },
    });
  });
}

export async function setStaffStatus(
  actor: Actor,
  id: string,
  next: "ACTIVE" | "SUSPENDED",
  reasonInput: unknown,
  hasRecentReauth: boolean,
): Promise<void> {
  assertCan(actor, "accounts.manage");
  requireStepUp(hasRecentReauth);
  if (id === actor.userId) throw businessRule("You cannot change the status of your own account.");
  let reason: string | null = null;
  if (next === "SUSPENDED") {
    const parsed = reasonField(5).safeParse(reasonInput);
    if (!parsed.success) throw validationError("A reason is required.", { reason: parsed.error.issues.map((i) => i.message) });
    reason = parsed.data;
  }
  await getDb().transaction(async (tx) => {
    const user = await lockStaff(tx, id);
    if (user.status === next) throw businessRule(`The account is already ${next.toLowerCase()}.`);
    if (next === "SUSPENDED" && user.role === "SYSTEM_ADMIN") await assertAnotherActiveAdmin(tx, id);
    await tx.update(users).set({ status: next, updatedAt: new Date() }).where(eq(users.id, id));
    if (next === "SUSPENDED") await invalidateUserSessions(tx, id);
    await recordAudit(tx, actor, {
      action: next === "SUSPENDED" ? "STAFF_ACCOUNT_SUSPENDED" : "STAFF_ACCOUNT_REACTIVATED",
      resourceType: "user",
      resourceId: id,
      summary: `${next === "SUSPENDED" ? "Suspended" : "Reactivated"} ${ROLE_LABELS[user.role as StaffRole]} account ${user.fullName} <${user.email}>`,
      reason,
    });
  });
}

export async function resetStaffCredentials(actor: Actor, id: string, reasonInput: unknown, hasRecentReauth: boolean): Promise<void> {
  assertCan(actor, "accounts.manage");
  requireStepUp(hasRecentReauth);
  if (id === actor.userId) throw businessRule("Use “Change password” to change your own password.");
  const reason = reasonField(5).safeParse(reasonInput);
  if (!reason.success) throw validationError("A reason is required.", { reason: reason.error.issues.map((i) => i.message) });
  await getDb().transaction(async (tx) => {
    const user = await lockStaff(tx, id);
    if (user.status !== "ACTIVE") throw businessRule("Reactivate the account first.");
    await sendStaffCredentials(tx, user, user.role as StaffRole);
    await invalidateUserSessions(tx, id);
    await recordAudit(tx, actor, {
      action: "STAFF_CREDENTIALS_RESET",
      resourceType: "user",
      resourceId: id,
      summary: `Issued new temporary credentials to ${user.fullName} <${user.email}>`,
      reason: reason.data,
    });
  });
}

/** "Sign out everywhere": revoke all sessions of a staff account (or all other sessions of yourself). */
export async function revokeStaffSessions(actor: Actor, id: string, currentSessionId: string): Promise<void> {
  if (id !== actor.userId) assertCan(actor, "accounts.manage");
  await getDb().transaction(async (tx) => {
    const user = await lockStaff(tx, id);
    await invalidateUserSessions(tx, id, id === actor.userId ? currentSessionId : undefined);
    await recordAudit(tx, actor, {
      action: "SESSIONS_REVOKED",
      resourceType: "user",
      resourceId: id,
      summary: id === actor.userId ? "Signed out of all other devices" : `Signed ${user.fullName} out of all devices`,
    });
  });
}
