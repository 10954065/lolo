/**
 * Integration-test global setup: recreate the test database from scratch, apply every
 * migration and the production privilege hardening, so tests run as the real app role.
 */
import { config } from "dotenv";
import { Client } from "pg";
import { hardenDatabase, runMigrations } from "../../scripts/lib/db-admin";

const TEST_DATABASE_NAME = "moba_election_test";

function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

export default async function setup(): Promise<void> {
  config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });
  const ownerUrl = process.env.DATABASE_OWNER_URL;
  if (!ownerUrl) throw new Error("DATABASE_OWNER_URL is required for integration tests.");

  const admin = new Client({ connectionString: withDatabase(ownerUrl, "postgres") });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
  } finally {
    await admin.end();
  }

  const testOwnerUrl = withDatabase(ownerUrl, TEST_DATABASE_NAME);
  await runMigrations(testOwnerUrl);
  await hardenDatabase(testOwnerUrl, { appPassword: process.env.MOBA_APP_DB_PASSWORD });
}
