import "server-only";
import { timingSafeEqual } from "node:crypto";
import { isAppError, type ErrorCode } from "./errors";
import { logger } from "./logger";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  REAUTH_REQUIRED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  BUSINESS_RULE: 409,
  RATE_LIMITED: 429,
};

/** Run a Route Handler body, turning domain errors into JSON error responses. */
export async function handleRoute(name: string, body: () => Promise<Response>): Promise<Response> {
  try {
    return await body();
  } catch (error) {
    if (isAppError(error)) {
      return Response.json({ error: error.message }, { status: STATUS[error.code], headers: { "Cache-Control": "no-store" } });
    }
    const reference = logger.error(`route ${name} failed`, error);
    return Response.json({ error: `Internal error (reference ${reference})` }, { status: 500 });
  }
}

/** Constant-time check of "Authorization: Bearer <secret>". */
export function hasBearerSecret(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
