import "server-only";
import { randomUUID } from "node:crypto";

/**
 * Minimal structured logger. Never pass passwords, tokens, receipts or ballot
 * selections in `context` — callers are responsible for keeping logs non-sensitive.
 */
type LogContext = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", message: string, context: LogContext = {}): void {
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...context });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  /** Logs an unexpected error and returns a short reference the user can quote to support. */
  error: (message: string, error: unknown, context?: LogContext): string => {
    const reference = randomUUID().slice(0, 8).toUpperCase();
    const err = error instanceof Error ? error : new Error(String(error));
    write("error", message, {
      ...context,
      reference,
      errorName: err.name,
      errorMessage: err.message.slice(0, 500),
      stack: err.stack?.split("\n").slice(0, 6).join(" | "),
    });
    return reference;
  },
};
