import "server-only";
import { asc, desc, gt, sql } from "drizzle-orm";
import { sha256Hex } from "@/server/crypto";
import { getDb, type Executor, type Transaction } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import type { Actor } from "@/server/auth/actor";

/**
 * Append-only, hash-chained audit log.
 * NEVER include passwords, tokens, receipts, session ids or ballot selections.
 */
export const AUDIT_GENESIS_HASH = "0".repeat(64);
const AUDIT_CHAIN_LOCK = 724_201_701; // arbitrary constant advisory-lock key

export interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string | null;
  summary: string;
  reason?: string | null;
  metadata?: Record<string, unknown>;
}

const FORBIDDEN_METADATA_KEYS = /password|token|secret|receipt|session|selection|ballot_?choice/i;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonicalize((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export interface HashableAuditRow {
  occurredAt: Date;
  actorUserId: string | null;
  actorRole: string | null;
  actorLabel: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  summary: string;
  reason: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
}

export function computeAuditHash(prevHash: string, row: HashableAuditRow): string {
  const payload = JSON.stringify([
    row.occurredAt.toISOString(),
    row.actorUserId,
    row.actorRole,
    row.actorLabel,
    row.action,
    row.resourceType,
    row.resourceId,
    row.summary,
    row.reason,
    canonicalize(row.metadata),
    row.ipAddress,
  ]);
  return sha256Hex(`${prevHash}|${payload}`);
}

function assertSafeMetadata(metadata: Record<string, unknown>): void {
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.test(key)) {
      throw new Error(`Audit metadata key "${key}" is not allowed (sensitive data).`);
    }
  }
}

/** Append an entry inside the caller's transaction (serialized by an advisory lock). */
export async function recordAudit(tx: Transaction, actor: Actor, entry: AuditEntry): Promise<void> {
  const metadata = entry.metadata ?? {};
  assertSafeMetadata(metadata);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);
  const [last] = await tx.select({ hash: auditLogs.hash }).from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
  const prevHash = last?.hash ?? AUDIT_GENESIS_HASH;
  // JS Dates carry millisecond precision, so the stored timestamptz round-trips exactly.
  const row: HashableAuditRow = {
    occurredAt: new Date(),
    actorUserId: actor.userId,
    actorRole: actor.role,
    actorLabel: actor.label.slice(0, 200),
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    summary: entry.summary.slice(0, 500),
    reason: entry.reason?.slice(0, 2000) ?? null,
    metadata,
    ipAddress: actor.ipAddress ?? null,
  };
  await tx.insert(auditLogs).values({ ...row, prevHash, hash: computeAuditHash(prevHash, row) });
}

/** Append an entry in its own transaction. */
export async function audit(actor: Actor, entry: AuditEntry, executor: Executor = getDb()): Promise<void> {
  await executor.transaction(async (tx) => recordAudit(tx, actor, entry));
}

export interface AuditVerification {
  isValid: boolean;
  checked: number;
  firstInvalidId: number | null;
  headHash: string;
}

/** Recompute the whole chain. Detects edited, inserted or deleted entries. */
export async function verifyAuditChain(executor: Executor = getDb()): Promise<AuditVerification> {
  const BATCH = 1000;
  let prevHash = AUDIT_GENESIS_HASH;
  let lastId = 0;
  let checked = 0;
  for (;;) {
    const rows = await executor
      .select()
      .from(auditLogs)
      .where(gt(auditLogs.id, lastId))
      .orderBy(asc(auditLogs.id))
      .limit(BATCH);
    if (rows.length === 0) break;
    for (const row of rows) {
      const expected = computeAuditHash(prevHash, {
        occurredAt: row.occurredAt,
        actorUserId: row.actorUserId,
        actorRole: row.actorRole,
        actorLabel: row.actorLabel,
        action: row.action,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        summary: row.summary,
        reason: row.reason,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
      });
      if (row.prevHash !== prevHash || row.hash !== expected) {
        return { isValid: false, checked, firstInvalidId: row.id, headHash: prevHash };
      }
      prevHash = row.hash;
      lastId = row.id;
      checked += 1;
    }
  }
  return { isValid: true, checked, firstInvalidId: null, headHash: prevHash };
}
