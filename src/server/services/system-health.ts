import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";

export interface HardeningStatus {
  role: string;
  isHardened: boolean;
}

/**
 * The app role must be unable to SELECT ballot rows or UPDATE the audit log.
 * Shown to administrators and the committee so a misconfigured deployment is obvious.
 */
export async function databaseHardeningStatus(): Promise<HardeningStatus> {
  const result = await getDb().execute<{ role: string; can_read_ballots: boolean; can_edit_audit: boolean }>(sql`
    SELECT current_user AS role,
           has_table_privilege(current_user, 'ballots', 'SELECT') AS can_read_ballots,
           has_table_privilege(current_user, 'audit_logs', 'UPDATE') AS can_edit_audit
  `);
  const row = result.rows[0];
  return { role: row.role, isHardened: !row.can_read_ballots && !row.can_edit_audit };
}
