import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/session-cookie";

/**
 * Runs before routes render. Two jobs only:
 *  1. Attach a per-request nonce-based Content-Security-Policy.
 *  2. Coarse redirect: protected areas need a session cookie to be present.
 *
 * This is NOT an authorization control. Every page, Server Action and Route Handler
 * validates the session and role on the server (src/server/auth/guards.ts).
 */
const PROTECTED_PREFIXES = ["/admin", "/committee", "/dashboard", "/change-password"];

function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Radix/shadcn set inline style attributes; style injection cannot execute script.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(process.env.APP_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  const needsSession = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (needsSession && !hasSessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|brand/).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
