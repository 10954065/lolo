/**
 * Create/refresh the least-privilege application role (moba_app) and its grants.
 * Usage: MOBA_APP_DB_PASSWORD=... npm run db:harden
 * Then set DATABASE_URL to connect as moba_app.
 */
import { APP_ROLE, hardenDatabase } from "./lib/db-admin";
import { loadEnv, requireEnv } from "./lib/load-env";

const MIN_PASSWORD_LENGTH = 20;

async function main(): Promise<void> {
  loadEnv();
  const ownerUrl = requireEnv("DATABASE_OWNER_URL");
  const appPassword = process.env.MOBA_APP_DB_PASSWORD;
  if (appPassword && appPassword.length < MIN_PASSWORD_LENGTH) {
    console.error(`MOBA_APP_DB_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    process.exit(1);
  }
  await hardenDatabase(ownerUrl, { appPassword });
  console.log(`Role ${APP_ROLE} hardened: INSERT-only on ballot tables, append-only audit log.`);
}

main().catch((error: unknown) => {
  console.error("Hardening failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
