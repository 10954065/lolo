/**
 * Domain errors. `message` is always safe to show to the user; never put internal
 * details (SQL, stack traces, secrets) in it.
 */
export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "REAUTH_REQUIRED"
  | "BUSINESS_RULE";

export type FieldErrors = Record<string, string[]>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly fieldErrors?: FieldErrors;

  constructor(code: ErrorCode, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const validationError = (message: string, fieldErrors?: FieldErrors): AppError =>
  new AppError("VALIDATION", message, fieldErrors);
export const unauthenticated = (message = "Please sign in to continue."): AppError =>
  new AppError("UNAUTHENTICATED", message);
export const forbidden = (message = "You do not have permission to perform this action."): AppError =>
  new AppError("FORBIDDEN", message);
export const notFound = (message = "The requested record was not found."): AppError =>
  new AppError("NOT_FOUND", message);
export const conflict = (message: string): AppError => new AppError("CONFLICT", message);
export const rateLimited = (message = "Too many attempts. Please wait a few minutes and try again."): AppError =>
  new AppError("RATE_LIMITED", message);
export const businessRule = (message: string): AppError => new AppError("BUSINESS_RULE", message);
export const reauthRequired = (): AppError =>
  new AppError("REAUTH_REQUIRED", "For your security, please confirm your password to continue.");

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Postgres unique_violation, optionally for a specific constraint/index name. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = findPgError(error);
  return pg?.code === "23505" && (!constraint || pg.constraint === constraint);
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
}

/** Drizzle wraps driver errors in `cause`; walk the chain to find the pg error. */
export function findPgError(error: unknown): PgErrorLike | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current === "object" && current !== null && "code" in current) {
      const candidate = current as PgErrorLike;
      if (typeof candidate.code === "string" && /^[0-9A-Z]{5}$/.test(candidate.code)) return candidate;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
