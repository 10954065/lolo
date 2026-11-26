import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

/** URL-safe random token with `bytes` bytes of CSPRNG entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Keyed hash (HMAC-SHA256 with APP_SECRET) — used for rate-limit keys so raw IPs are not stored. */
export function hmacHex(input: string): string {
  return createHmac("sha256", env().APP_SECRET).update(input).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const CIPHER = "aes-256-gcm";
const IV_BYTES = 12;
const FORMAT_VERSION = "v1";

function encryptionKey(): Buffer {
  return Buffer.from(env().CREDENTIALS_ENCRYPTION_KEY, "base64");
}

/**
 * Encrypt a short secret (e.g. a temporary password awaiting email delivery).
 * Output: v1.<iv>.<tag>.<ciphertext> (base64url parts). `context` is bound as AAD so a
 * ciphertext cannot be replayed into a different record.
 */
export function encryptSecret(plaintext: string, context: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, encryptionKey(), iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv, tag, ciphertext].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(".");
}

export function decryptSecret(payload: string, context: string): string {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error("Unsupported encrypted payload format");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const decipher = createDecipheriv(CIPHER, encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
}
