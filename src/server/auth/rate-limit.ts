import "server-only";
import { sql } from "drizzle-orm";
import { hmacHex } from "@/server/crypto";
import { getDb, type Executor } from "@/server/db/client";
import { rateLimited } from "@/server/errors";

export interface RateLimitRule {
  /** Namespace, e.g. "login:ip". */
  scope: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  loginByIp: { scope: "login:ip", limit: 30, windowSeconds: 15 * 60 },
  loginByEmail: { scope: "login:email", limit: 10, windowSeconds: 15 * 60 },
  resetByIp: { scope: "reset:ip", limit: 10, windowSeconds: 60 * 60 },
  resetByEmail: { scope: "reset:email", limit: 3, windowSeconds: 60 * 60 },
  receiptByIp: { scope: "receipt:ip", limit: 30, windowSeconds: 15 * 60 },
  stepUpByUser: { scope: "stepup:user", limit: 10, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * Fixed-window counter stored in Postgres (no extra infrastructure).
 * The identifier is HMAC'd so raw IPs/emails are never stored in rate_limits.
 * Returns true when the request is within the limit.
 */
export async function consumeRateLimit(
  rule: RateLimitRule,
  identifier: string,
  executor: Executor = getDb(),
): Promise<boolean> {
  const key = `${rule.scope}:${hmacHex(identifier.toLowerCase())}`;
  const result = await executor.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${rule.windowSeconds})
                   THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${rule.windowSeconds})
                   THEN now() ELSE rate_limits.window_start END
    RETURNING count
  `);
  return Number(result.rows[0]?.count ?? 0) <= rule.limit;
}

/** Throws RATE_LIMITED if any of the given rules is exceeded. All counters are consumed. */
export async function enforceRateLimits(
  checks: ReadonlyArray<{ rule: RateLimitRule; identifier: string | null | undefined }>,
): Promise<void> {
  let isAllowed = true;
  for (const { rule, identifier } of checks) {
    if (!identifier) continue;
    if (!(await consumeRateLimit(rule, identifier))) isAllowed = false;
  }
  if (!isAllowed) throw rateLimited();
}

/** Delete expired windows (maintenance cron). */
export async function purgeRateLimits(olderThanSeconds = 24 * 60 * 60): Promise<number> {
  const result = await getDb().execute(
    sql`DELETE FROM rate_limits WHERE window_start < now() - make_interval(secs => ${olderThanSeconds})`,
  );
  return result.rowCount ?? 0;
}
