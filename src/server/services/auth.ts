import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { formatDateTime } from "@/lib/datetime";
import { anonymousActor, type Actor } from "@/server/auth/actor";
import {
  burnPasswordVerification,
  hashPassword,
  passwordProblems,
  verifyPassword,
} from "@/server/auth/password";
import { homePathForRole } from "@/server/auth/permissions";
import { consumeRateLimit, enforceRateLimits, RATE_LIMITS } from "@/server/auth/rate-limit";
import type { RequestMeta } from "@/server/auth/request-context";
import {
  createSession,
  invalidateSession,
  invalidateUserSessions,
  markReauthenticated,
  type ValidSession,
} from "@/server/auth/session";
import { randomToken, sha256Hex } from "@/server/crypto";
import { getDb } from "@/server/db/client";
import { members, passwordResetTokens, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { AppError, rateLimited, validationError } from "@/server/errors";
import { normalizeEmail } from "@/server/validation/common";
import { recordAudit } from "./audit";
import { enqueueEmail, supersedeCredentialEmails } from "./email-queue";
import { getSettings } from "./settings";

export const INVALID_LOGIN_MESSAGE =
  "Incorrect email or password. After several failed attempts the account is locked for a short time.";
const RESET_TOKEN_TTL_MINUTES = 30;
const EMAIL_SHAPE = /^[^\s@]{1,100}@[^\s@]{1,100}$/;

export interface LoginResult {
  token: string;
  expiresAt: Date;
  redirectTo: string;
}

function invalidLogin(): AppError {
  return new AppError("UNAUTHENTICATED", INVALID_LOGIN_MESSAGE);
}

async function auditStandalone(actor: Actor, entry: Parameters<typeof recordAudit>[2]): Promise<void> {
  await getDb().transaction(async (tx) => recordAudit(tx, actor, entry));
}

export async function login(emailInput: string, password: string, meta: RequestMeta): Promise<LoginResult> {
  const email = normalizeEmail(emailInput);
  await enforceRateLimits([
    { rule: RATE_LIMITS.loginByIp, identifier: meta.ipAddress },
    { rule: RATE_LIMITS.loginByEmail, identifier: email },
  ]);
  const anon = anonymousActor(meta.ipAddress);
  const db = getDb();
  const settings = await getSettings();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
      tempPasswordExpiresAt: users.tempPasswordExpiresAt,
      failedLoginAttempts: users.failedLoginAttempts,
      lockedUntil: users.lockedUntil,
      memberId: members.id,
      memberApproval: members.approvalStatus,
      memberAccount: members.accountStatus,
      memberDeletedAt: members.deletedAt,
    })
    .from(users)
    .leftJoin(members, eq(members.userId, users.id))
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  if (!user || !user.passwordHash) {
    await burnPasswordVerification(password);
    await auditStandalone(anon, {
      action: "LOGIN_FAILED",
      resourceType: "user",
      summary: "Sign-in failed: unknown account",
      metadata: { attemptedEmail: EMAIL_SHAPE.test(email) ? email : "(invalid input)" },
    });
    throw invalidLogin();
  }

  const actorForUser: Actor = { userId: user.id, role: user.role, label: `${user.fullName} <${user.email}>`, ipAddress: meta.ipAddress };
  const now = new Date();

  if (user.lockedUntil && user.lockedUntil > now) {
    await burnPasswordVerification(password);
    await auditStandalone(actorForUser, {
      action: "LOGIN_BLOCKED_LOCKED",
      resourceType: "user",
      resourceId: user.id,
      summary: "Sign-in attempted while account is locked",
    });
    throw invalidLogin();
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= settings.maxFailedLogins;
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          failedLoginAttempts: shouldLock ? 0 : attempts,
          lockedUntil: shouldLock ? new Date(now.getTime() + settings.lockoutMinutes * 60_000) : user.lockedUntil,
          updatedAt: now,
        })
        .where(eq(users.id, user.id));
      await recordAudit(tx, actorForUser, {
        action: shouldLock ? "ACCOUNT_LOCKED" : "LOGIN_FAILED",
        resourceType: "user",
        resourceId: user.id,
        summary: shouldLock
          ? `Account locked for ${settings.lockoutMinutes} minutes after ${attempts} failed sign-in attempts`
          : "Sign-in failed: wrong password",
        metadata: { failedAttempts: attempts },
      });
    });
    throw invalidLogin();
  }

  // Password is correct from here on: specific messages no longer help an attacker.
  if (user.status !== "ACTIVE") {
    throw new AppError("FORBIDDEN", "Your account is not active. Please contact the election administrator.");
  }
  if (
    user.role === "VOTER" &&
    (!user.memberId || user.memberApproval !== "APPROVED" || user.memberAccount !== "ACTIVE" || user.memberDeletedAt)
  ) {
    throw new AppError(
      "FORBIDDEN",
      "Your membership is not currently approved for voting access. Please contact the election administrator.",
    );
  }
  if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt < now) {
    throw new AppError(
      "FORBIDDEN",
      "Your temporary password has expired. Please ask the election administrator to send you new login details.",
    );
  }

  const session = await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, user.id));
    const created = await createSession(tx, user, meta.userAgent);
    await recordAudit(tx, actorForUser, {
      action: "LOGIN_SUCCESS",
      resourceType: "user",
      resourceId: user.id,
      summary: `${user.role === "VOTER" ? "Member" : "Staff"} signed in`,
      metadata: { role: user.role },
    });
    return created;
  });

  return {
    ...session,
    redirectTo: user.mustChangePassword ? "/change-password" : homePathForRole(user.role),
  };
}

export async function logout(session: ValidSession, actor: Actor): Promise<void> {
  await getDb().transaction(async (tx) => {
    await invalidateSession(session.sessionId, tx);
    await recordAudit(tx, actor, {
      action: "LOGOUT",
      resourceType: "user",
      resourceId: session.user.id,
      summary: "Signed out",
    });
  });
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** Change own password. Revokes every session and returns a fresh one. */
export async function changePassword(
  session: ValidSession,
  actor: Actor,
  input: ChangePasswordInput,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date; redirectTo: string }> {
  if (!(await consumeRateLimit(RATE_LIMITS.stepUpByUser, session.user.id))) throw rateLimited();
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw validationError("Your current password is incorrect.", {
      currentPassword: ["Your current password is incorrect."],
    });
  }
  const problems = passwordProblems(input.newPassword, { email: user.email, fullName: user.fullName });
  if (input.newPassword === input.currentPassword) problems.push("Your new password must be different from the current one.");
  if (problems.length > 0) throw validationError("Please choose a stronger password.", { newPassword: problems });
  if (input.newPassword !== input.confirmPassword) {
    throw validationError("The passwords do not match.", { confirmPassword: ["The passwords do not match."] });
  }

  const passwordHash = await hashPassword(input.newPassword);
  const now = new Date();
  return db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
    await invalidateUserSessions(tx, user.id);
    const fresh = await createSession(tx, user, userAgent);
    if (session.user.memberId) {
      await tx
        .update(members)
        .set({ credentialStatus: "ACTIVATED", updatedAt: now })
        .where(eq(members.id, session.user.memberId));
      await supersedeCredentialEmails(tx, session.user.memberId);
    }
    await enqueueEmail(tx, {
      template: "password_changed",
      to: user.email,
      vars: { recipientName: user.fullName, changedAt: formatDateTime(now) },
      userId: user.id,
      memberId: session.user.memberId,
    });
    await recordAudit(tx, actor, {
      action: user.mustChangePassword ? "TEMPORARY_PASSWORD_REPLACED" : "PASSWORD_CHANGED",
      resourceType: "user",
      resourceId: user.id,
      summary: user.mustChangePassword ? "Replaced temporary password on first sign-in" : "Changed password",
    });
    return { ...fresh, redirectTo: homePathForRole(user.role) };
  });
}

/** Always succeeds from the caller's point of view (no account enumeration). */
export async function requestPasswordReset(emailInput: string, meta: RequestMeta): Promise<void> {
  const email = normalizeEmail(emailInput);
  await enforceRateLimits([
    { rule: RATE_LIMITS.resetByIp, identifier: meta.ipAddress },
    { rule: RATE_LIMITS.resetByEmail, identifier: email },
  ]);
  const db = getDb();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
      passwordHash: users.passwordHash,
      memberId: members.id,
      memberApproval: members.approvalStatus,
      memberAccount: members.accountStatus,
    })
    .from(users)
    .leftJoin(members, eq(members.userId, users.id))
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);
  const isEligible =
    user &&
    user.status === "ACTIVE" &&
    user.passwordHash &&
    (user.role !== "VOTER" || (user.memberApproval === "APPROVED" && user.memberAccount === "ACTIVE"));
  if (!user || !isEligible) return;

  const token = randomToken(32);
  const now = new Date();
  await db.transaction(async (tx) => {
    // Only the newest link works.
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: sha256Hex(token),
      expiresAt: new Date(now.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000),
    });
    await enqueueEmail(tx, {
      template: "password_reset",
      to: user.email,
      vars: { recipientName: user.fullName, expiresInMinutes: String(RESET_TOKEN_TTL_MINUTES) },
      secrets: { resetUrl: `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}` },
      userId: user.id,
      memberId: user.memberId,
    });
    await recordAudit(tx, anonymousActor(meta.ipAddress), {
      action: "PASSWORD_RESET_REQUESTED",
      resourceType: "user",
      resourceId: user.id,
      summary: `Password reset link requested for ${user.email}`,
    });
  });
}

/** Check a reset token without consuming it (to render the form or an error). */
export async function isResetTokenUsable(token: string): Promise<boolean> {
  if (!token || token.length > 100) return false;
  const [row] = await getDb()
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, sha256Hex(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return Boolean(row);
}

const INVALID_RESET = "This password reset link is invalid or has expired. Please request a new one.";

export async function resetPassword(
  token: string,
  newPassword: string,
  confirmPassword: string,
  meta: RequestMeta,
): Promise<void> {
  await enforceRateLimits([{ rule: RATE_LIMITS.resetByIp, identifier: meta.ipAddress }]);
  const db = getDb();
  const [row] = await db
    .select({ tokenId: passwordResetTokens.id, user: users })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, sha256Hex(token)),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || row.user.status !== "ACTIVE") throw validationError(INVALID_RESET);

  const { user } = row;
  const problems = passwordProblems(newPassword, { email: user.email, fullName: user.fullName });
  if (problems.length > 0) throw validationError("Please choose a stronger password.", { newPassword: problems });
  if (newPassword !== confirmPassword) {
    throw validationError("The passwords do not match.", { confirmPassword: ["The passwords do not match."] });
  }
  const passwordHash = await hashPassword(newPassword);
  const now = new Date();

  await db.transaction(async (tx) => {
    const consumed = await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(and(eq(passwordResetTokens.id, row.tokenId), isNull(passwordResetTokens.usedAt)))
      .returning({ id: passwordResetTokens.id });
    if (consumed.length === 0) throw validationError(INVALID_RESET); // used concurrently
    await tx
      .update(users)
      .set({
        passwordHash,
        mustChangePassword: false,
        tempPasswordExpiresAt: null,
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(users.id, user.id));
    await invalidateUserSessions(tx, user.id);
    const [member] = await tx.select({ id: members.id }).from(members).where(eq(members.userId, user.id)).limit(1);
    if (member) {
      await tx.update(members).set({ credentialStatus: "ACTIVATED", updatedAt: now }).where(eq(members.id, member.id));
      await supersedeCredentialEmails(tx, member.id);
    }
    await enqueueEmail(tx, {
      template: "password_changed",
      to: user.email,
      vars: { recipientName: user.fullName, changedAt: formatDateTime(now) },
      userId: user.id,
      memberId: member?.id ?? null,
    });
    await recordAudit(tx, { userId: user.id, role: user.role, label: `${user.fullName} <${user.email}>`, ipAddress: meta.ipAddress }, {
      action: "PASSWORD_RESET_COMPLETED",
      resourceType: "user",
      resourceId: user.id,
      summary: "Password reset via emailed link; all sessions revoked",
    });
  });
}

/** Step-up re-authentication for sensitive actions. */
export async function confirmPassword(session: ValidSession, actor: Actor, password: string): Promise<void> {
  if (!(await consumeRateLimit(RATE_LIMITS.stepUpByUser, session.user.id))) throw rateLimited();
  const [user] = await getDb()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user?.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
    await auditStandalone(actor, {
      action: "STEP_UP_FAILED",
      resourceType: "user",
      resourceId: session.user.id,
      summary: "Password confirmation for a sensitive action failed",
    });
    throw validationError("Incorrect password.", { password: ["Incorrect password."] });
  }
  await markReauthenticated(session.sessionId);
}
