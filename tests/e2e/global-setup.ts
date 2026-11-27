import { execSync } from "node:child_process";
import { Client } from "pg";
import { E2E_DATABASE_URL, E2E_OWNER_URL } from "../../playwright.config";
import { hardenDatabase, runMigrations } from "../../scripts/lib/db-admin";

/** Recreate the E2E database, migrate, harden, and seed fixtures. */
export default async function globalSetup(): Promise<void> {
  const maintenance = new URL(E2E_OWNER_URL);
  maintenance.pathname = "/postgres";
  const admin = new Client({ connectionString: maintenance.toString() });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS moba_election_e2e WITH (FORCE)");
  await admin.query("CREATE DATABASE moba_election_e2e");
  await admin.end();
  await runMigrations(E2E_OWNER_URL);
  await hardenDatabase(E2E_OWNER_URL, { appPassword: process.env.MOBA_APP_DB_PASSWORD });
  execSync("npx tsx --conditions=react-server scripts/seed-e2e.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL, EMAIL_TRANSPORT: "file", MAIL_OUTBOX_DIR: ".mail-outbox/e2e" },
  });
}
