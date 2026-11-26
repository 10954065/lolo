import "server-only";
import { and, count, desc, eq, gte, ilike, lt, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { zonedInputToUtc } from "@/lib/datetime";
import { getDb } from "@/server/db/client";
import { auditLogs } from "@/server/db/schema";
import { escapeLike } from "@/server/validation/common";

export const AUDIT_PAGE_SIZE = 50;

export const auditFiltersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  action: z.string().trim().regex(/^[A-Z_]{2,60}$/).optional().catch(undefined),
  resourceType: z.string().trim().regex(/^[a-z_]{2,40}$/).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

function whereFor(filters: AuditFilters): SQL | undefined {
  const conditions: SQL[] = [];
  if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
  if (filters.resourceType) conditions.push(eq(auditLogs.resourceType, filters.resourceType));
  if (filters.from) {
    const from = zonedInputToUtc(`${filters.from}T00:00`);
    if (from) conditions.push(gte(auditLogs.occurredAt, from));
  }
  if (filters.to) {
    const to = zonedInputToUtc(`${filters.to}T00:00`);
    if (to) conditions.push(lt(auditLogs.occurredAt, new Date(to.getTime() + 24 * 60 * 60 * 1000)));
  }
  if (filters.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    conditions.push(or(ilike(auditLogs.summary, pattern), ilike(auditLogs.actorLabel, pattern)) as SQL);
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function listAuditLogs(filters: AuditFilters, pageSize = AUDIT_PAGE_SIZE) {
  const where = whereFor(filters);
  const db = getDb();
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        occurredAt: auditLogs.occurredAt,
        actorLabel: auditLogs.actorLabel,
        actorRole: auditLogs.actorRole,
        action: auditLogs.action,
        resourceType: auditLogs.resourceType,
        resourceId: auditLogs.resourceId,
        summary: auditLogs.summary,
        reason: auditLogs.reason,
        ipAddress: auditLogs.ipAddress,
        hash: auditLogs.hash,
      })
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.id))
      .limit(pageSize)
      .offset((filters.page - 1) * pageSize),
    db.select({ total: count() }).from(auditLogs).where(where),
  ]);
  return { rows, total: Number(total), page: filters.page, pageSize };
}

/** For the CSV export of the activity report (bounded). */
export async function exportAuditLogs(filters: AuditFilters, limit = 20_000) {
  return getDb()
    .select()
    .from(auditLogs)
    .where(whereFor(filters))
    .orderBy(desc(auditLogs.id))
    .limit(limit);
}

export async function distinctAuditActions(): Promise<string[]> {
  const rows = await getDb().selectDistinct({ action: auditLogs.action }).from(auditLogs).orderBy(auditLogs.action);
  return rows.map((r) => r.action);
}
