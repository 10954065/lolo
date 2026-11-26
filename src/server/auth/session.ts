import "server-only";
import { and, eq, lt, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { sessionCookieName } from "@/lib/session-cookie";
import { randomToken, sha256Hex } from "@/server/crypto";
import { getDb, type Executor } from "@/server/db/client";
import { members, sessions, users } from "@/server/db/schema";
import type { UserRole, UserStatus } from "@/server/db/schema/enums";
import { isProduction } from "@/server/env";

const HOUR_MS = 60 * 60 * 1000;
export const VOTER_SESSION_MS = 12 * HOUR_MS;
export const STAFF_SESSION_MS = 8 * HOUR_MS;
export const STAFF_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const STEP_UP_WINDOW_MS = 10 * 60 * 1000;
const TOUCH_INTERVAL_MS = 60 * 1000;
const SESSION_TOKEN_BYTES = 20; // 160 bits

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  memberId: string | null;
}

export interface ValidSession {
  sessionId: string;
  expiresAt: Date;
  reauthenticatedAt: Date | null;
  user: SessionUser;
}

const isStaff = (role: UserRole): boolean => role !== "VOTER";

export async function createSession(
  executor: Executor,
  user: { id: string; role: UserRole },
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(SESSION_TOKEN_BYTES);
  const now = Date.now();
  const expiresAt = new Date(now + (isStaff(user.role) ? STAFF_SESSION_MS : VOTER_SESSION_MS));
  await executor.insert(sessions).values({
    id: sha256Hex(token),
    userId: user.id,
    expiresAt,
    lastSeenAt: new Date(now),
    // Signing in counts as a fresh authentication for step-up purposes.
    reauthenticatedAt: new Date(now),
    userAgent,
  });
  return { token, expiresAt };
}

/** Validate a raw cookie token. Returns null (and cleans up) for any invalid session. */
export async function validateSessionToken(token: string, executor: Executor = getDb()): Promise<ValidSession | null> {
  if (!token || token.length > 64) return null;
  const sessionId = sha256Hex(token);
  const [row] = await executor
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastSeenAt: sessions.lastSeenAt,
      reauthenticatedAt: sessions.reauthenticatedAt,
      userId: users.id,
      email: users.email,
      fullName: users.fullName,
      role: users.role,
      status: users.status,
      mustChangePassword: users.mustChangePassword,
      memberId: members.id,
      memberApproval: members.approvalStatus,
      memberAccount: members.accountStatus,
      memberDeletedAt: members.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(members, eq(members.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) return null;

  const now = Date.now();
  const isExpired = row.expiresAt.getTime() <= now;
  const isIdle = isStaff(row.role) && now - row.lastSeenAt.getTime() > STAFF_IDLE_TIMEOUT_MS;
  const isVoterInactive =
    row.role === "VOTER" &&
    (!row.memberId ||
      row.memberApproval !== "APPROVED" ||
      row.memberAccount !== "ACTIVE" ||
      row.memberDeletedAt !== null);
  if (isExpired || isIdle || row.status !== "ACTIVE" || isVoterInactive) {
    await executor.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }

  if (now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await executor.update(sessions).set({ lastSeenAt: new Date(now) }).where(eq(sessions.id, sessionId));
  }

  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    reauthenticatedAt: row.reauthenticatedAt,
    user: {
      id: row.userId,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      status: row.status,
      mustChangePassword: row.mustChangePassword,
      memberId: row.memberId,
    },
  };
}

export async function invalidateSession(sessionId: string, executor: Executor = getDb()): Promise<void> {
  await executor.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Revoke every session of a user (password change/reset, suspension, role change). */
export async function invalidateUserSessions(
  executor: Executor,
  userId: string,
  exceptSessionId?: string,
): Promise<void> {
  await executor
    .delete(sessions)
    .where(
      exceptSessionId ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId)) : eq(sessions.userId, userId),
    );
}

export async function markReauthenticated(sessionId: string, executor: Executor = getDb()): Promise<void> {
  await executor.update(sessions).set({ reauthenticatedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export function hasRecentReauthentication(
  session: Pick<ValidSession, "reauthenticatedAt">,
  now = Date.now(),
): boolean {
  return session.reauthenticatedAt !== null && now - session.reauthenticatedAt.getTime() <= STEP_UP_WINDOW_MS;
}

export async function purgeExpiredSessions(executor: Executor = getDb()): Promise<number> {
  const result = await executor.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  return result.rowCount ?? 0;
}

// ---- Cookie helpers (request context only) -------------------------------------------

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(sessionCookieName(), "", {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** The current request's validated session (memoized per request). */
export const getCurrentSession = cache(async (): Promise<ValidSession | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token) return null;
  return validateSessionToken(token);
});
