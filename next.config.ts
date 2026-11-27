import { existsSync } from "node:fs";
import type { NextConfig } from "next";

/** The official logo is optional; when it is absent the UI uses a wordmark and never requests it. */
const hasBrandLogo = existsSync("public/brand/moba-logo.png");

const isProd = process.env.NODE_ENV === "production";

/** Static security headers. The nonce-based Content-Security-Policy is set per request in src/proxy.ts. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: { NEXT_PUBLIC_HAS_BRAND_LOGO: hasBrandLogo ? "1" : "" },
  reactStrictMode: true,
  serverExternalPackages: ["@node-rs/argon2", "sharp"],
  experimental: {
    serverActions: {
      // Candidate photo uploads (5 MB) plus multipart overhead.
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
