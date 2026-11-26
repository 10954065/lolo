import { config } from "dotenv";

/** Load .env.local (or DOTENV_PATH) for CLI scripts. Real environment variables win. */
export function loadEnv(): void {
  config({ path: process.env.DOTENV_PATH ?? ".env.local", quiet: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable ${name}.`);
    process.exit(1);
  }
  return value;
}
