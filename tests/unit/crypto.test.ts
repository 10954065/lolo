import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hmacHex, randomToken, safeEqualHex, sha256Hex } from "@/server/crypto";

describe("secret encryption (AES-256-GCM)", () => {
  it("round-trips a secret for the same context", () => {
    const ct = encryptSecret("Tmp-Pass-1234", "email_job:abc");
    expect(ct).not.toContain("Tmp-Pass-1234");
    expect(decryptSecret(ct, "email_job:abc")).toBe("Tmp-Pass-1234");
  });

  it("uses a fresh IV each time", () => {
    expect(encryptSecret("x", "c")).not.toEqual(encryptSecret("x", "c"));
  });

  it("refuses to decrypt under a different context (AAD binding)", () => {
    const ct = encryptSecret("secret", "email_job:1");
    expect(() => decryptSecret(ct, "email_job:2")).toThrow();
  });

  it("detects tampering", () => {
    const ct = encryptSecret("secret", "ctx");
    const parts = ct.split(".");
    const body = Buffer.from(parts[3], "base64url");
    body[0] ^= 0xff;
    parts[3] = body.toString("base64url");
    expect(() => decryptSecret(parts.join("."), "ctx")).toThrow();
  });

  it("rejects unknown formats", () => {
    expect(() => decryptSecret("v0.a.b.c", "ctx")).toThrow("Unsupported encrypted payload format");
  });
});

describe("hashing helpers", () => {
  it("sha256Hex is deterministic and hex", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("hmacHex is keyed (differs from plain sha256)", () => {
    expect(hmacHex("abc")).not.toBe(sha256Hex("abc"));
    expect(hmacHex("abc")).toBe(hmacHex("abc"));
  });

  it("randomToken has the requested entropy and is url-safe", () => {
    const token = randomToken(32);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("safeEqualHex compares in constant time without throwing on length mismatch", () => {
    expect(safeEqualHex("abcd", "abcd")).toBe(true);
    expect(safeEqualHex("abcd", "abce")).toBe(false);
    expect(safeEqualHex("abcd", "ab")).toBe(false);
  });
});
