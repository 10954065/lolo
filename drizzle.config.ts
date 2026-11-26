import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });

const url = process.env.DATABASE_OWNER_URL;
if (!url) {
  throw new Error("DATABASE_OWNER_URL is required for migrations (owner role, never the app role).");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/*.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
