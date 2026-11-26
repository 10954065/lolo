import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { formatDateTime } from "@/lib/datetime";
import type { Actor } from "@/server/auth/actor";
import { generateTemporaryPassword, hashPassword } from "@/server/auth/password";
import { assertCan } from "@/server/auth/permissions";
import { invalidateUserSessions } from "@/server/auth/session";
import { getDb, type Transaction } from "@/server/db/client";
import { members, users } from "@/server/db/schema";
import { env } from "@/server/env";
import { businessRule, notFound, reauthRequired, validationError } from "@/server/errors";
import { reasonField } from "@/server/validation/common";
import { recordAudit } from "./audit";
import { enqueueEmail, supersedeCredentialEmails } from "./email-queue";
import { getSettings } from "./settings";

type MemberRow = typeof members.$inferSelect;

export interface IssueResult {
  issued: number;
  skipped: Array<{ memberId: string; name: string; reason: string }>;
}

function skipReason(m: MemberRow): string | null {
  if (m.deletedAt || m.accountStatus === "DEACTIVATED") return "Member is deactivated";
  if (m.approvalStatus !== "APPROVED") return "Member is not approved";
  if (m.accountStatus !== "ACTIVE") return "Member account is suspended";
  if (m.credentialStatus !== "NOT_ISSUED") {
    return "Credentials were already issued (use retry or regenerate on the member page)";
  }
  return null;
}

/**
 * Create (or refresh) the voter login for one member, hash a new temporary password and
 * queue the credentials email with the password encrypted until delivery.
 */
async function provisionCredentials(tx: Transaction, actor: Actor, m: MemberRow, validityDays: number): Promise<void> {
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  let userId = m.userId;
  if (userId) {
    await tx
      .update(users)
      .set({
        email: m.email,
        fullName: m.fullName,
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: expiresAt,
        status: "ACTIVE",
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedAt: now,
      })
      .where(eq(users.id, userId));
    await invalidateUserSessions(tx, userId);
  } else {
    const [existing] = await tx
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${m.email.toLowerCase()}`)
      .limit(1);
    if (existing) throw businessRule(`The email ${m.email} already belongs to a staff account.`);
    const [created] = await tx
      .insert(users)
      .values({
        email: m.email,
        fullName: m.fullName,
        role: "VOTER",
        passwordHash,
        mustChangePassword: true,
        tempPasswordExpiresAt: expiresAt,
        createdBy: actor.userId,
      })
      .returning({ id: users.id });
    userId = created.id;
  }

  await tx
    .update(members)
    .set({ userId, credentialStatus: "QUEUED", credentialIssuedAt: now, updatedAt: now })
    .where(eq(members.id, m.id));
  await enqueueEmail(tx, {
    template: "credentials",
    to: m.email,
    vars: {
      recipientName: m.fullName,
      loginEmail: m.email,
      loginUrl: `${env().APP_URL}/login`,
      expiresAt: formatDateTime(expiresAt),
    },
    secrets: { temporaryPassword },
    memberId: m.id,
    userId,
  });
}

/**
 * Issue credentials to approved, active members who have none yet. Members that already
 * received credentials are skipped — re-sending never silently generates new passwords.
 */
export async function issueCredentials(actor: Actor, memberIds: string[] | "ALL_ELIGIBLE"): Promise<IssueResult> {
  assertCan(actor, "credentials.send");
  const db = getDb();
  let targets: MemberRow[];
  if (memberIds === "ALL_ELIGIBLE") {
    targets = await db
      .select()
      .from(members)
      .where(
        and(
          isNull(members.deletedAt),
          eq(members.approvalStatus, "APPROVED"),
          eq(members.accountStatus, "ACTIVE"),
          eq(members.credentialStatus, "NOT_ISSUED"),
        ),
      );
  } else {
    const ids = [...new Set(memberIds)].filter((id) => z.uuid().safeParse(id).success);
    if (ids.length === 0) throw validationError("Select at least one member.");
    targets = await db.select().from(members).where(inArray(members.id, ids));
  }

  const { tempPasswordValidityDays } = await getSettings();
  const result: IssueResult = { issued: 0, skipped: [] };
  for (const candidate of targets) {
    try {
      // One short transaction per member: a problem with one member never blocks the rest.
      await db.transaction(async (tx) => {
        const [m] = await tx.select().from(members).where(eq(members.id, candidate.id)).for("update");
        const reason = m ? skipReason(m) : "Member not found";
        if (reason || !m) throw businessRule(reason ?? "Member not found");
        await provisionCredentials(tx, actor, m, tempPasswordValidityDays);
        await recordAudit(tx, actor, {
          action: "CREDENTIALS_ISSUED",
          resourceType: "member",
          resourceId: m.id,
          summary: `Issued login credentials to ${m.fullName} <${m.email}>`,
        });
      });
      result.issued += 1;
    } catch (error) {
      result.skipped.push({
        memberId: candidate.id,
        name: candidate.fullName,
        reason: error instanceof Error ? error.message : "Unexpected error",
      });
    }
  }
  return result;
}

/**
 * Explicitly generate NEW credentials (e.g. member never received or lost the email).
 * Requires step-up re-authentication and a reason; the old password stops working.
 */
export async function regenerateCredentials(
  actor: Actor,
  memberId: string,
  reasonInput: unknown,
  hasRecentReauth: boolean,
): Promise<void> {
  assertCan(actor, "credentials.send");
  if (!hasRecentReauth) throw reauthRequired();
  const reason = reasonField(5).safeParse(reasonInput);
  if (!reason.success) {
    throw validationError("A reason is required.", { reason: reason.error.issues.map((i) => i.message) });
  }
  const { tempPasswordValidityDays } = await getSettings();
  await getDb().transaction(async (tx) => {
    const [m] = await tx.select().from(members).where(eq(members.id, memberId)).for("update");
    if (!m) throw notFound("Member not found.");
    if (m.deletedAt || m.approvalStatus !== "APPROVED" || m.accountStatus !== "ACTIVE") {
      throw businessRule("Credentials can only be issued to approved, active members.");
    }
    await supersedeCredentialEmails(tx, m.id);
    await provisionCredentials(tx, actor, m, tempPasswordValidityDays);
    await recordAudit(tx, actor, {
      action: "CREDENTIALS_REGENERATED",
      resourceType: "member",
      resourceId: m.id,
      summary: `Generated new login credentials for ${m.fullName} <${m.email}>; previous password revoked`,
      reason: reason.data,
    });
  });
}
