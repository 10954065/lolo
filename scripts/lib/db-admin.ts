/**
 * Owner-role database administration used by scripts/migrate.ts, scripts/db-harden.ts
 * and the integration-test global setup. Never imported by the application.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "node:path";
import { Client } from "pg";

export const APP_ROLE = "moba_app";

export async function runMigrations(ownerUrl: string): Promise<void> {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  } finally {
    await client.end();
  }
}

/** Tables where the app role must NOT have the default full CRUD access. */
const RESTRICTED_GRANTS: ReadonlyArray<{ table: string; privileges: string }> = [
  // Anonymous ballot box: write-only. Reads happen only through aggregate functions.
  { table: "ballots", privileges: "INSERT" },
  { table: "ballot_selections", privileges: "INSERT" },
  // Append-only records.
  { table: "audit_logs", privileges: "SELECT, INSERT" },
  { table: "voter_participation", privileges: "SELECT, INSERT" },
  { table: "election_status_history", privileges: "SELECT, INSERT" },
];

const FUNCTIONS = [
  "election_tally(uuid)",
  "election_ballot_count(uuid)",
  "verify_receipt(text)",
  "mix_ballots(uuid)",
] as const;

export interface HardenOptions {
  /** When provided, the role is created (or its password rotated). */
  appPassword?: string;
}

/**
 * Create/refresh the least-privilege application role and apply grants.
 * Idempotent — run after every migration.
 */
export async function hardenDatabase(ownerUrl: string, options: HardenOptions = {}): Promise<void> {
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_ROLE]);
    if (options.appPassword) {
      const pw = client.escapeLiteral(options.appPassword);
      const verb = exists.rowCount ? "ALTER" : "CREATE";
      await client.query(
        `${verb} ROLE ${APP_ROLE} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD ${pw}`,
      );
    } else if (!exists.rowCount) {
      throw new Error(
        `Role ${APP_ROLE} does not exist. Set MOBA_APP_DB_PASSWORD and run "npm run db:harden".`,
      );
    }

    await client.query("BEGIN");
    const { rows } = await client.query<{ db: string }>("SELECT current_database() AS db");
    await client.query(`GRANT CONNECT ON DATABASE ${client.escapeIdentifier(rows[0].db)} TO ${APP_ROLE}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${APP_ROLE}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
    for (const { table, privileges } of RESTRICTED_GRANTS) {
      await client.query(`REVOKE ALL ON ${table} FROM ${APP_ROLE}`);
      await client.query(`GRANT ${privileges} ON ${table} TO ${APP_ROLE}`);
    }
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`);
    for (const fn of FUNCTIONS) {
      await client.query(`GRANT EXECUTE ON FUNCTION ${fn} TO ${APP_ROLE}`);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
