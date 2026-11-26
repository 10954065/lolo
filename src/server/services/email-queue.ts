import "server-only";
import { randomUUID } from "node:crypto";
import { and, count, desc, eq, inArray, lte, sql, type SQL } from "drizzle-orm";
import { assertCan } from "@/server/auth/permissions";
import type { Actor } from "@/server/auth/actor";
import { decryptSecret, encryptSecret } from "@/server/crypto";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import { emailDeliveryLogs, emailJobs, members } from "@/server/db/schema";
import type { EmailStatus } from "@/server/db/schema/enums";
import { renderEmail, renderSubject, type EmailTemplate, type TemplateVars } from "@/server/email/templates";
import { getEmailTransport } from "@/server/email/transport";
import { businessRule, notFound } from "@/server/errors";
import { logger } from "@/server/logger";
import { recordAudit } from "./audit";
import { getSettings } from "./settings";

const DEFAULT_BATCH = 50;
const STALE_SENDING_MINUTES = 10;
/** Resend's default limit is 2 requests/second; stay under it. */
const SEND_SPACING_MS = 550;

export interface EnqueueEmailInput {
  template: EmailTemplate;
  to: string;
  vars: TemplateVars;
  /** Secret variables (temporary password, reset link). Stored encrypted until delivered. */
  secrets?: TemplateVars;
  memberId?: string | null;
  userId?: string | null;
  electionId?: string | null;
  dedupeKey?: string | null;
}

function encryptionContext(jobId: string): string {
  return `email_job:${jobId}`;
}

/** Insert an outbox row inside the caller's transaction. Returns the job id (or null if deduplicated). */
export async function enqueueEmail(tx: Executor, input: EnqueueEmailInput): Promise<string | null> {
  const id = randomUUID();
  const hasSecrets = input.secrets && Object.keys(input.secrets).length > 0;
  const inserted = await tx
    .insert(emailJobs)
    .values({
      id,
      template: input.template,
      toEmail: input.to.trim().toLowerCase(),
      subject: renderSubject(input.template, input.vars),
      memberId: input.memberId ?? null,
      userId: input.userId ?? null,
      electionId: input.electionId ?? null,
      payload: input.vars,
      encryptedSecret: hasSecrets ? encryptSecret(JSON.stringify(input.secrets), encryptionContext(id)) : null,
      dedupeKey: input.dedupeKey ?? null,
    })
    .onConflictDoNothing({ target: emailJobs.dedupeKey })
    .returning({ id: emailJobs.id });
  return inserted[0]?.id ?? null;
}

async function logDelivery(executor: Executor, jobId: string, event: string, detail?: string): Promise<void> {
  await executor.insert(emailDeliveryLogs).values({ emailJobId: jobId, event, detail: detail?.slice(0, 500) ?? null });
}

async function syncMemberCredentialStatus(
  executor: Executor,
  job: { template: string; memberId: string | null },
  status: "SENT" | "DELIVERED" | "FAILED",
): Promise<void> {
  if (job.template !== "credentials" || !job.memberId) return;
  // Never downgrade a member who has already activated their account.
  await executor
    .update(members)
    .set({ credentialStatus: status, updatedAt: new Date() })
    .where(and(eq(members.id, job.memberId), sql`${members.credentialStatus} <> 'ACTIVATED'`));
}

function backoffMinutes(attempts: number): number {
  return Math.min(60, 2 ** attempts);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface DispatchResult {
  sent: number;
  failed: number;
  retried: number;
}

/**
 * Claim due jobs with FOR UPDATE SKIP LOCKED (safe to run concurrently) and send them.
 * Credentials are decrypted only in memory and the ciphertext is erased after delivery.
 */
export async function dispatchDueEmails(limit = DEFAULT_BATCH): Promise<DispatchResult> {
  const db = getDb();
  const result: DispatchResult = { sent: 0, failed: 0, retried: 0 };

  const claimed = await db.execute<{ id: string }>(sql`
    UPDATE email_jobs SET status = 'SENDING', attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM email_jobs
      WHERE (status = 'QUEUED' AND next_attempt_at <= now())
         OR (status = 'SENDING' AND updated_at < now() - make_interval(mins => ${STALE_SENDING_MINUTES}))
      ORDER BY created_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `);
  if (claimed.rows.length === 0) return result;

  const jobs = await db.select().from(emailJobs).where(inArray(emailJobs.id, claimed.rows.map((r) => r.id)));
  const transport = getEmailTransport();
  const { organizationName } = await getSettings();

  for (const [index, job] of jobs.entries()) {
    if (index > 0 && transport.name === "resend") await sleep(SEND_SPACING_MS);
    try {
      const secrets = job.encryptedSecret
        ? (JSON.parse(decryptSecret(job.encryptedSecret, encryptionContext(job.id))) as TemplateVars)
        : {};
      const rendered = renderEmail(job.template as EmailTemplate, job.payload, secrets, organizationName);
      const { providerMessageId } = await transport.send(
        { ...rendered, to: job.toEmail },
        { idempotencyKey: `moba-email-${job.id}` },
      );
      await db.transaction(async (tx) => {
        await tx
          .update(emailJobs)
          .set({
            status: "SENT",
            sentAt: new Date(),
            providerMessageId,
            encryptedSecret: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(emailJobs.id, job.id));
        await logDelivery(tx, job.id, "SENT", `via ${transport.name}`);
        await syncMemberCredentialStatus(tx, job, "SENT");
      });
      result.sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isFinal = job.attempts >= job.maxAttempts;
      await db.transaction(async (tx) => {
        await tx
          .update(emailJobs)
          .set({
            status: isFinal ? "FAILED" : "QUEUED",
            lastError: message.slice(0, 500),
            nextAttemptAt: new Date(Date.now() + backoffMinutes(job.attempts) * 60_000),
            updatedAt: new Date(),
          })
          .where(eq(emailJobs.id, job.id));
        await logDelivery(tx, job.id, isFinal ? "FAILED" : "RETRY_SCHEDULED", message);
        if (isFinal) await syncMemberCredentialStatus(tx, job, "FAILED");
      });
      logger.warn("email delivery failed", { jobId: job.id, template: job.template, attempts: job.attempts, isFinal });
      if (isFinal) result.failed += 1;
      else result.retried += 1;
    }
  }
  return result;
}

/** Re-queue a failed job without regenerating its content (same encrypted credentials). */
export async function retryEmailJob(actor: Actor, jobId: string): Promise<void> {
  assertCan(actor, "emails.write");
  await getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(emailJobs).where(eq(emailJobs.id, jobId)).for("update");
    if (!job) throw notFound("Email not found.");
    if (job.status !== "FAILED" && job.status !== "BOUNCED") {
      throw businessRule("Only failed or bounced emails can be retried.");
    }
    if (job.template === "credentials" && !job.encryptedSecret) {
      throw businessRule("These credentials can no longer be re-sent. Use “Regenerate credentials” instead.");
    }
    await tx
      .update(emailJobs)
      .set({ status: "QUEUED", attempts: 0, nextAttemptAt: new Date(), lastError: null, updatedAt: new Date() })
      .where(eq(emailJobs.id, jobId));
    if (job.template === "credentials" && job.memberId) {
      await tx.update(members).set({ credentialStatus: "QUEUED", updatedAt: new Date() }).where(eq(members.id, job.memberId));
    }
    await logDelivery(tx, jobId, "RETRY_REQUESTED", `by ${actor.label}`);
    await recordAudit(tx, actor, {
      action: "EMAIL_RETRY",
      resourceType: "email_job",
      resourceId: jobId,
      summary: `Re-queued ${job.template} email to ${job.toEmail}`,
    });
  });
}

/** Cancel pending/failed credential emails for a member (used when credentials are regenerated). */
export async function supersedeCredentialEmails(tx: Transaction, memberId: string): Promise<void> {
  const pending = await tx
    .select({ id: emailJobs.id })
    .from(emailJobs)
    .where(
      and(
        eq(emailJobs.memberId, memberId),
        eq(emailJobs.template, "credentials"),
        inArray(emailJobs.status, ["QUEUED", "FAILED", "BOUNCED"]),
      ),
    );
  if (pending.length === 0) return;
  const ids = pending.map((p) => p.id);
  await tx
    .update(emailJobs)
    .set({ status: "FAILED", encryptedSecret: null, lastError: "Superseded by regenerated credentials", updatedAt: new Date() })
    .where(inArray(emailJobs.id, ids));
  for (const id of ids) await logDelivery(tx, id, "SUPERSEDED");
}

// ---- Provider webhooks ----------------------------------------------------------------

const WEBHOOK_STATUS: Record<string, EmailStatus | null> = {
  "email.sent": null,
  "email.delivered": "DELIVERED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.failed": "FAILED",
  "email.delivery_delayed": null,
};

export async function applyProviderEvent(type: string, providerMessageId: string, detail?: string): Promise<boolean> {
  if (!(type in WEBHOOK_STATUS)) return false;
  const newStatus = WEBHOOK_STATUS[type];
  return getDb().transaction(async (tx) => {
    const [job] = await tx.select().from(emailJobs).where(eq(emailJobs.providerMessageId, providerMessageId)).limit(1);
    if (!job) return false;
    await logDelivery(tx, job.id, type.replace("email.", "").toUpperCase(), detail);
    if (newStatus) {
      await tx
        .update(emailJobs)
        .set({
          status: newStatus,
          deliveredAt: newStatus === "DELIVERED" ? new Date() : job.deliveredAt,
          lastError: newStatus === "DELIVERED" ? null : (detail ?? type),
          updatedAt: new Date(),
        })
        .where(eq(emailJobs.id, job.id));
      if (newStatus === "DELIVERED") await syncMemberCredentialStatus(tx, job, "DELIVERED");
      if (newStatus === "BOUNCED" || newStatus === "FAILED" || newStatus === "COMPLAINED") {
        await syncMemberCredentialStatus(tx, job, "FAILED");
      }
    }
    return true;
  });
}

// ---- Read models (admin + committee) ----------------------------------------------------

export async function emailStatusCounts(executor: Executor = getDb()): Promise<Record<EmailStatus, number>> {
  const rows = await executor.select({ status: emailJobs.status, n: count() }).from(emailJobs).groupBy(emailJobs.status);
  const base: Record<EmailStatus, number> = {
    QUEUED: 0,
    SENDING: 0,
    SENT: 0,
    DELIVERED: 0,
    BOUNCED: 0,
    COMPLAINED: 0,
    FAILED: 0,
  };
  for (const r of rows) base[r.status] = Number(r.n);
  return base;
}

export interface EmailListFilters {
  status?: EmailStatus;
  template?: string;
  memberId?: string;
  page?: number;
  pageSize?: number;
}

export async function listEmailJobs(filters: EmailListFilters = {}) {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 25, 1), 100);
  const page = Math.max(filters.page ?? 1, 1);
  const conditions: SQL[] = [];
  if (filters.status) conditions.push(eq(emailJobs.status, filters.status));
  if (filters.template) conditions.push(eq(emailJobs.template, filters.template));
  if (filters.memberId) conditions.push(eq(emailJobs.memberId, filters.memberId));
  const where = conditions.length ? and(...conditions) : undefined;
  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: emailJobs.id,
        template: emailJobs.template,
        toEmail: emailJobs.toEmail,
        subject: emailJobs.subject,
        status: emailJobs.status,
        attempts: emailJobs.attempts,
        lastError: emailJobs.lastError,
        sentAt: emailJobs.sentAt,
        deliveredAt: emailJobs.deliveredAt,
        createdAt: emailJobs.createdAt,
        memberId: emailJobs.memberId,
        hasSecret: sql<boolean>`${emailJobs.encryptedSecret} IS NOT NULL`,
      })
      .from(emailJobs)
      .where(where)
      .orderBy(desc(emailJobs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ total: count() }).from(emailJobs).where(where),
  ]);
  return { rows, total: Number(total), page, pageSize };
}

/** Count of jobs waiting to be dispatched now (for the dashboard). */
export async function pendingEmailCount(): Promise<number> {
  const [{ n }] = await getDb()
    .select({ n: count() })
    .from(emailJobs)
    .where(and(eq(emailJobs.status, "QUEUED"), lte(emailJobs.nextAttemptAt, new Date())));
  return Number(n);
}
