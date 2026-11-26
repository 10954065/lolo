import { afterEach, describe, expect, it, vi } from "vitest";
import { env, resetEnvCacheForTests } from "@/server/env";
import { AppError, findPgError, forbidden, isAppError, isUniqueViolation } from "@/server/errors";

describe("server environment validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    resetEnvCacheForTests();
  });

  it("loads the test environment and defaults to file email transport without a Resend key", () => {
    resetEnvCacheForTests();
    expect(env().emailTransport).toBe("file");
  });

  it("rejects a short APP_SECRET", () => {
    vi.stubEnv("APP_SECRET", "too-short");
    resetEnvCacheForTests();
    expect(() => env()).toThrow(/APP_SECRET/);
  });

  it("rejects an encryption key that is not 32 bytes", () => {
    vi.stubEnv("CREDENTIALS_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"));
    resetEnvCacheForTests();
    expect(() => env()).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
  });

  it("requires https, Resend and a cron secret in production, and forbids the file transport", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://insecure.example.org");
    vi.stubEnv("CRON_SECRET", "");
    resetEnvCacheForTests();
    let message = "";
    try {
      env();
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/APP_URL: must use https/);
    expect(message).toMatch(/RESEND_API_KEY: is required/);
    expect(message).toMatch(/EMAIL_TRANSPORT: file transport is not allowed/);
  });

  it("allows a production build served on localhost (local smoke/E2E runs only)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    vi.stubEnv("CRON_SECRET", "");
    resetEnvCacheForTests();
    expect(() => env()).not.toThrow();
  });
});

describe("domain errors", () => {
  it("identifies AppErrors and carries a code", () => {
    const err = forbidden();
    expect(isAppError(err)).toBe(true);
    expect(err.code).toBe("FORBIDDEN");
    expect(isAppError(new Error("x"))).toBe(false);
  });

  it("finds Postgres errors wrapped in cause chains", () => {
    const pg = Object.assign(new Error("dup"), { code: "23505", constraint: "members_email_unique" });
    const wrapped = new Error("Failed query", { cause: pg });
    expect(findPgError(wrapped)?.code).toBe("23505");
    expect(isUniqueViolation(wrapped, "members_email_unique")).toBe(true);
    expect(isUniqueViolation(wrapped, "other")).toBe(false);
    expect(isUniqueViolation(new AppError("CONFLICT", "x"))).toBe(false);
  });
});
