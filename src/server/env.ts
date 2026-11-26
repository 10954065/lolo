import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once on first use.
 * Nothing here may be prefixed NEXT_PUBLIC_ — these values never reach the browser.
 */
const base64Key32 = z
  .string()
  .refine((v) => Buffer.from(v, "base64").length === 32, {
    message: "must be 32 random bytes encoded as base64 (openssl rand -base64 32)",
  });

function isLocalUrl(url: string): boolean {
  try {
    return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** `KEY=` in a .env file means "not set", not "set to an empty string". */
function blankAsUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), schema);
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
    APP_URL: z.url().default("http://localhost:3000"),
    APP_SECRET: z.string().min(32, "APP_SECRET must be at least 32 characters"),
    CREDENTIALS_ENCRYPTION_KEY: base64Key32,
    EMAIL_TRANSPORT: blankAsUndefined(z.enum(["resend", "file"]).optional()),
    RESEND_API_KEY: blankAsUndefined(z.string().min(1).optional()),
    RESEND_WEBHOOK_SECRET: blankAsUndefined(z.string().min(1).optional()),
    EMAIL_FROM: blankAsUndefined(z.string().min(3).default("MOBA 2017 Elections <elections@localhost>")),
    EMAIL_REPLY_TO: blankAsUndefined(z.email().optional()),
    CRON_SECRET: blankAsUndefined(z.string().min(16).optional()),
  })
  .superRefine((env, ctx) => {
    // Production builds served on localhost (local smoke tests, E2E) are not real deployments.
    if (env.NODE_ENV !== "production" || isLocalUrl(env.APP_URL)) return;
    if (!env.APP_URL.startsWith("https://")) {
      ctx.addIssue({ code: "custom", path: ["APP_URL"], message: "must use https in production" });
    }
    if (!env.RESEND_API_KEY) {
      ctx.addIssue({ code: "custom", path: ["RESEND_API_KEY"], message: "is required in production" });
    }
    if (!env.CRON_SECRET) {
      ctx.addIssue({ code: "custom", path: ["CRON_SECRET"], message: "is required in production" });
    }
    if (env.EMAIL_TRANSPORT === "file") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "file transport is not allowed in production",
      });
    }
  });

export type ServerEnv = z.infer<typeof envSchema> & { emailTransport: "resend" | "file" };

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid server environment configuration:\n${problems}`);
  }
  const data = parsed.data;
  cached = {
    ...data,
    emailTransport: data.EMAIL_TRANSPORT ?? (data.RESEND_API_KEY ? "resend" : "file"),
  };
  return cached;
}

/** Test-only: forget the cached environment so tests can change process.env. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}

export const isProduction = (): boolean => process.env.NODE_ENV === "production";
