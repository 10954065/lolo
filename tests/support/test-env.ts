/**
 * Test environment: reuse local connection settings but point every URL at the
 * dedicated test database. Fixed test-only secrets keep runs deterministic.
 */
import { config } from "dotenv";

config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });

export const TEST_DATABASE_NAME = "moba_election_test";

export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

if (!process.env.DATABASE_OWNER_URL || !process.env.DATABASE_URL) {
  throw new Error("Tests need DATABASE_URL (app role) and DATABASE_OWNER_URL (owner) in .env.local or the environment.");
}

process.env.TEST_DATABASE_OWNER_URL = withDatabase(process.env.DATABASE_OWNER_URL, TEST_DATABASE_NAME);
process.env.DATABASE_URL = withDatabase(process.env.DATABASE_URL, TEST_DATABASE_NAME);
process.env.APP_URL = "http://localhost:3000";
process.env.APP_SECRET = "test-app-secret-0123456789-abcdefghijklmnopqrstuvwxyz";
process.env.CREDENTIALS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.EMAIL_TRANSPORT = "file";
process.env.MAIL_OUTBOX_DIR = ".mail-outbox/test";
process.env.CRON_SECRET = "test-cron-secret-0123456789";
process.env.DATABASE_POOL_MAX = "20";
