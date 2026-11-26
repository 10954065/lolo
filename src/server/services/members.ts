import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { invalidateUserSessions } from "@/server/auth/session";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import { auditLogs, members, users } from "@/server/db/schema";
import { businessRule, isUniqueViolation, notFound, validationError } from "@/server/errors";
import { escapeLike, fieldErrorsOf, reasonField } from "@/server/validation/common";
import { memberInputSchema, type MemberInput, type MemberListFilters } from "@/server/validation/members";
import { recordAudit } from "./audit";
import { enqueueEmail } from "./email-queue";

export const MEMBERS_PAGE_SIZE = 25;
type MemberRow = typeof members.$inferSelect;

function parseMemberInput(input: unknown): MemberInput {
  const parsed = memberInputSchema.safeParse(input);
  if (!parsed.success) throw validationError("Please correct the highlighted fields.", fieldErrorsOf(parsed.error));
  return parsed.data;
}

function toColumns(input: MemberInput) {
  return {
    fullName: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    membershipNumber: input.membershipNumber ?? null,
    gender: input.gender ?? null,
    notes: input.notes ?? null,
  };
}

function translateUniqueError(error: unknown): never {
  if (isUniqueViolation(error, "members_email_unique") || isUniqueViolation(error, "users_email_unique")) {
    throw validationError("A member with this email already exists.", {
      email: ["A member with this email already exists."],
    });
  }
  if (isUniqueViolation(error, "members_membership_number_unique")) {
    throw validationError("This membership number is already registered.", {
      membershipNumber: ["This membership number is already registered."],
    });
  }
  throw error;
}

async function lockMember(tx: Transaction, id: string): Promise<MemberRow> {
  const [member] = await tx.select().from(members).where(eq(members.id, id)).for("update");
  if (!member) throw notFound("Member not found.");
  return member;
}

// ---- Queries ------------------------------------------------------------------------------

export async function listMembers(filters: MemberListFilters, pageSize = MEMBERS_PAGE_SIZE) {
  const conditions: SQL[] = [];
  if (filters.account === "DEACTIVATED") conditions.push(eq(members.accountStatus, "DEACTIVATED"));
  else {
    conditions.push(isNull(members.deletedAt));
    if (filters.account) conditions.push(eq(members.accountStatus, filters.account));
  }
  if (filters.approval) conditions.push(eq(members.approvalStatus, filters.approval));
  if (filters.credential) conditions.push(eq(members.credentialStatus, filters.credential));
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(
      or(
        ilike(members.fullName, pattern),
        ilike(members.email, pattern),
        ilike(members.membershipNumber, pattern),
        ilike(members.phone, pattern),
      ) as SQL,
    );
  }
  const where = and(...conditions);
  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(members)
      .where(where)
      .orderBy(asc(members.fullName))
      .limit(pageSize)
      .offset((filters.page - 1) * pageSize),
    db.select({ total: count() }).from(members).where(where),
  ]);
  return { rows, total: Number(total), page: filters.page, pageSize };
}

export async function getMember(id: string) {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return null;
  const [row] = await getDb()
    .select({ member: members, user: { id: users.id, lastLoginAt: users.lastLoginAt, status: users.status, mustChangePassword: users.mustChangePassword, tempPasswordExpiresAt: users.tempPasswordExpiresAt, lockedUntil: users.lockedUntil } })
    .from(members)
    .leftJoin(users, eq(users.id, members.userId))
    .where(eq(members.id, parsed.data))
    .limit(1);
  return row ?? null;
}

export async function memberHistory(memberId: string, limit = 50) {
  return getDb()
    .select({
      id: auditLogs.id,
      occurredAt: auditLogs.occurredAt,
      actorLabel: auditLogs.actorLabel,
      action: auditLogs.action,
      summary: auditLogs.summary,
      reason: auditLogs.reason,
    })
    .from(auditLogs)
    .where(and(eq(auditLogs.resourceType, "member"), eq(auditLogs.resourceId, memberId)))
    .orderBy(desc(auditLogs.id))
    .limit(limit);
}

export interface MemberStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
  deactivated: number;
  eligible: number;
  credentials: Record<string, number>;
}

export async function memberStats(executor: Executor = getDb()): Promise<MemberStats> {
  const [row] = await executor
    .select({
      total: sql<number>`count(*) filter (where ${members.deletedAt} is null)`,
      pending: sql<number>`count(*) filter (where ${members.deletedAt} is null and ${members.approvalStatus} = 'PENDING')`,
      approved: sql<number>`count(*) filter (where ${members.deletedAt} is null and ${members.approvalStatus} = 'APPROVED')`,
      rejected: sql<number>`count(*) filter (where ${members.deletedAt} is null and ${members.approvalStatus} = 'REJECTED')`,
      suspended: sql<number>`count(*) filter (where ${members.deletedAt} is null and ${members.accountStatus} = 'SUSPENDED')`,
      deactivated: sql<number>`count(*) filter (where ${members.accountStatus} = 'DEACTIVATED')`,
      eligible: sql<number>`count(*) filter (where ${members.deletedAt} is null and ${members.approvalStatus} = 'APPROVED' and ${members.accountStatus} = 'ACTIVE')`,
    })
    .from(members);
  const credRows = await executor
    .select({ status: members.credentialStatus, n: count() })
    .from(members)
    .where(and(isNull(members.deletedAt), eq(members.approvalStatus, "APPROVED")))
    .groupBy(members.credentialStatus);
  return {
    total: Number(row.total),
    pending: Number(row.pending),
    approved: Number(row.approved),
    rejected: Number(row.rejected),
    suspended: Number(row.suspended),
    deactivated: Number(row.deactivated),
    eligible: Number(row.eligible),
    credentials: Object.fromEntries(credRows.map((r) => [r.status, Number(r.n)])),
  };
}

// ---- Mutations ----------------------------------------------------------------------------

export interface CreateMemberOptions {
  approve?: boolean;
  notify?: boolean;
}

export async function createMember(actor: Actor, input: unknown, options: CreateMemberOptions = {}): Promise<string> {
  assertCan(actor, "members.write");
  const data = parseMemberInput(input);
  try {
    return await getDb().transaction(async (tx) => {
      const now = new Date();
      const [created] = await tx
        .insert(members)
        .values({
          ...toColumns(data),
          approvalStatus: options.approve ? "APPROVED" : "PENDING",
          approvedAt: options.approve ? now : null,
          approvedBy: options.approve ? actor.userId : null,
        })
        .returning({ id: members.id });
      await recordAudit(tx, actor, {
        action: "MEMBER_REGISTERED",
        resourceType: "member",
        resourceId: created.id,
        summary: `Registered member ${data.fullName} <${data.email}>${options.approve ? " (approved)" : ""}`,
      });
      if (options.notify) {
        await enqueueEmail(tx, {
          template: options.approve ? "member_approved" : "registration_confirmation",
          to: data.email,
          vars: { recipientName: data.fullName, email: data.email },
          memberId: created.id,
        });
      }
      return created.id;
    });
  } catch (error) {
    translateUniqueError(error);
  }
}

export async function updateMember(actor: Actor, id: string, input: unknown): Promise<void> {
  assertCan(actor, "members.write");
  const data = parseMemberInput(input);
  try {
    await getDb().transaction(async (tx) => {
      const before = await lockMember(tx, id);
      if (before.deletedAt) throw businessRule("Deactivated members cannot be edited. Reactivate the member first.");
      const columns = toColumns(data);
      const changed = (Object.keys(columns) as Array<keyof typeof columns>).filter((k) => before[k] !== columns[k]);
      if (changed.length === 0) return;
      await tx.update(members).set({ ...columns, updatedAt: new Date() }).where(eq(members.id, id));
      if (before.userId && (changed.includes("email") || changed.includes("fullName"))) {
        await tx
          .update(users)
          .set({ email: columns.email, fullName: columns.fullName, updatedAt: new Date() })
          .where(eq(users.id, before.userId));
      }
      await recordAudit(tx, actor, {
        action: "MEMBER_UPDATED",
        resourceType: "member",
        resourceId: id,
        summary: `Updated ${changed.join(", ")} for ${columns.fullName}`,
        metadata: {
          changes: Object.fromEntries(changed.map((k) => [k, { from: before[k], to: columns[k] }])),
        },
      });
    });
  } catch (error) {
    translateUniqueError(error);
  }
}

/** Approve one or more members. Already-approved members are skipped. Returns count approved. */
export async function approveMembers(actor: Actor, ids: string[], notify = true): Promise<number> {
  assertCan(actor, "members.write");
  const unique = [...new Set(ids)].filter((id) => z.uuid().safeParse(id).success);
  if (unique.length === 0) throw validationError("Select at least one member.");
  return getDb().transaction(async (tx) => {
    const targets = await tx
      .select()
      .from(members)
      .where(and(inArray(members.id, unique), isNull(members.deletedAt), sql`${members.approvalStatus} <> 'APPROVED'`))
      .for("update");
    const now = new Date();
    for (const m of targets) {
      await tx
        .update(members)
        .set({ approvalStatus: "APPROVED", approvedAt: now, approvedBy: actor.userId, rejectionReason: null, updatedAt: now })
        .where(eq(members.id, m.id));
      await recordAudit(tx, actor, {
        action: "MEMBER_APPROVED",
        resourceType: "member",
        resourceId: m.id,
        summary: `Approved member ${m.fullName} <${m.email}>`,
      });
      if (notify) {
        await enqueueEmail(tx, {
          template: "member_approved",
          to: m.email,
          vars: { recipientName: m.fullName },
          memberId: m.id,
          dedupeKey: `member_approved:${m.id}:${now.getTime()}`,
        });
      }
    }
    return targets.length;
  });
}

export async function rejectMember(actor: Actor, id: string, reasonInput: unknown): Promise<void> {
  assertCan(actor, "members.write");
  const reason = reasonField(5).safeParse(reasonInput);
  if (!reason.success) throw validationError("A reason is required.", { reason: reason.error.issues.map((i) => i.message) });
  await getDb().transaction(async (tx) => {
    const m = await lockMember(tx, id);
    if (m.deletedAt) throw businessRule("This member has been deactivated.");
    if (m.approvalStatus === "REJECTED") throw businessRule("This member is already rejected.");
    await tx
      .update(members)
      .set({ approvalStatus: "REJECTED", rejectionReason: reason.data, approvedAt: null, approvedBy: null, updatedAt: new Date() })
      .where(eq(members.id, id));
    if (m.userId) await invalidateUserSessions(tx, m.userId);
    await recordAudit(tx, actor, {
      action: "MEMBER_REJECTED",
      resourceType: "member",
      resourceId: id,
      summary: `Rejected member ${m.fullName} <${m.email}>`,
      reason: reason.data,
    });
  });
}

async function setAccountStatus(
  actor: Actor,
  id: string,
  next: "ACTIVE" | "SUSPENDED" | "DEACTIVATED",
  reasonInput: unknown,
): Promise<void> {
  assertCan(actor, "members.write");
  let reason: string | null = null;
  if (next !== "ACTIVE") {
    const parsed = reasonField(5).safeParse(reasonInput);
    if (!parsed.success) throw validationError("A reason is required.", { reason: parsed.error.issues.map((i) => i.message) });
    reason = parsed.data;
  }
  await getDb().transaction(async (tx) => {
    const m = await lockMember(tx, id);
    if (m.accountStatus === next) throw businessRule(`This member is already ${next.toLowerCase()}.`);
    const now = new Date();
    await tx
      .update(members)
      .set({ accountStatus: next, deletedAt: next === "DEACTIVATED" ? now : null, updatedAt: now })
      .where(eq(members.id, id));
    if (m.userId) {
      await tx
        .update(users)
        .set({ status: next, updatedAt: now })
        .where(eq(users.id, m.userId));
      if (next !== "ACTIVE") await invalidateUserSessions(tx, m.userId);
    }
    const action = { ACTIVE: "MEMBER_REACTIVATED", SUSPENDED: "MEMBER_SUSPENDED", DEACTIVATED: "MEMBER_DEACTIVATED" }[next];
    await recordAudit(tx, actor, {
      action,
      resourceType: "member",
      resourceId: id,
      summary: `${action.replace("MEMBER_", "").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())} member ${m.fullName} <${m.email}>`,
      reason,
    });
  });
}

export const suspendMember = (actor: Actor, id: string, reason: unknown) => setAccountStatus(actor, id, "SUSPENDED", reason);
export const reactivateMember = (actor: Actor, id: string) => setAccountStatus(actor, id, "ACTIVE", null);
/** Soft delete according to the retention policy: the record is kept but hidden and loses access. */
export const deactivateMember = (actor: Actor, id: string, reason: unknown) =>
  setAccountStatus(actor, id, "DEACTIVATED", reason);

/** All members for export (non-deleted unless requested). */
export async function exportMembers(includeDeactivated = false) {
  return getDb()
    .select()
    .from(members)
    .where(includeDeactivated ? undefined : isNull(members.deletedAt))
    .orderBy(asc(members.fullName));
}
