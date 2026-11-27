import { defineConfig, devices } from "@playwright/test";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });

const PORT = 3200;
const E2E_DB = "moba_election_e2e";
const withDb = (url: string) => {
  const u = new URL(url);
  u.pathname = `/${E2E_DB}`;
  return u.toString();
};

export const E2E_DATABASE_URL = withDb(process.env.DATABASE_URL ?? "postgres://localhost/none");
export const E2E_OWNER_URL = withDb(process.env.DATABASE_OWNER_URL ?? "postgres://localhost/none");

/** End-to-end tests run against a production build (`next build` first) and a dedicated database. */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    // The web server starts before globalSetup creates the database, so probe a DB-free page.
    url: `http://localhost:${PORT}/verify-receipt`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      APP_URL: `http://localhost:${PORT}`,
      EMAIL_TRANSPORT: "file",
      MAIL_OUTBOX_DIR: ".mail-outbox/e2e",
    },
  },
});
