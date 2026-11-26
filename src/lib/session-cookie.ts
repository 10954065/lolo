/**
 * Session cookie naming, shared by proxy.ts and the server session module.
 * In production the `__Host-` prefix forces Secure, Path=/ and no Domain attribute.
 */
export const SESSION_COOKIE_DEV = "moba_session";
export const SESSION_COOKIE_PROD = "__Host-moba_session";
export const SESSION_COOKIE_NAMES = [SESSION_COOKIE_PROD, SESSION_COOKIE_DEV] as const;

export function sessionCookieName(): string {
  return process.env.NODE_ENV === "production" ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV;
}
