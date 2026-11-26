/**
 * Apply pending migrations with the OWNER role, then re-apply app-role grants
 * (new tables need grants). Usage: npm run db:migrate
 */
import { hardenDatabase, runMigrations } from "./lib/db-admin";
import { loadEnv, requireEnv } from "./lib/load-env";

async function main(): Promise<void> {
  loadEnv();
  const ownerUrl = requireEnv("DATABASE_OWNER_URL");
  await runMigrations(ownerUrl);
  console.log("Migrations applied.");
  try {
    await hardenDatabase(ownerUrl);
    console.log("App-role grants refreshed.");
  } catch (error) {
    console.warn(`Grants not refreshed: ${(error as Error).message}`);
  }
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
