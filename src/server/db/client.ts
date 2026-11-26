import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
/** Anything that can run queries: the root database handle or an open transaction. */
export type Executor = Database | Transaction;

const DEFAULT_POOL_MAX = 10;

interface DbGlobals {
  __mobaPool?: Pool;
  __mobaDb?: Database;
}
const globals = globalThis as unknown as DbGlobals;

export function getPool(): Pool {
  if (!globals.__mobaPool) {
    const max = Number.parseInt(process.env.DATABASE_POOL_MAX ?? "", 10);
    const pool = new Pool({
      connectionString: env().DATABASE_URL,
      max: Number.isFinite(max) && max > 0 ? max : DEFAULT_POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      application_name: "moba-election",
    });
    pool.on("error", (error) => {
      // Idle-client errors (e.g. server restart) must not crash the process.
      console.error("[db] idle client error:", error.message);
    });
    if (process.env.VERCEL) attachDatabasePool(pool);
    globals.__mobaPool = pool;
  }
  return globals.__mobaPool;
}

export function getDb(): Database {
  if (!globals.__mobaDb) {
    globals.__mobaDb = drizzle(getPool(), { schema });
  }
  return globals.__mobaDb;
}

/** Close the pool (tests and scripts only). */
export async function closeDb(): Promise<void> {
  const pool = globals.__mobaPool;
  globals.__mobaPool = undefined;
  globals.__mobaDb = undefined;
  if (pool) await pool.end();
}
