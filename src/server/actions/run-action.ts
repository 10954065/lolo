import "server-only";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { isAppError } from "@/server/errors";
import { logger } from "@/server/logger";

/**
 * Wrap a Server Action body: domain errors become user-safe messages; unexpected errors are
 * logged with a reference and replaced by a generic message. Next.js redirects/notFound pass through.
 */
export async function runAction(name: string, body: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await body()) ?? { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    if (isAppError(error)) {
      return {
        ok: false,
        message: error.message,
        fieldErrors: error.fieldErrors,
        needsReauth: error.code === "REAUTH_REQUIRED" || undefined,
      };
    }
    const reference = logger.error(`action ${name} failed`, error);
    return { ok: false, message: `Something went wrong. Please try again. (Reference ${reference})` };
  }
}

export function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export function formBool(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "on" || value === "true" || value === "1";
}

export function formObject(formData: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, formString(formData, k)]));
}
