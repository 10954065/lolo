import { describe, expect, it } from "vitest";
import {
  generateTemporaryPassword,
  hashPassword,
  passwordProblems,
  TEMP_PASSWORD_LENGTH,
  verifyPassword,
} from "@/server/auth/password";

describe("password hashing", () => {
  it("produces Argon2id PHC strings with OWASP parameters", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("Kwame-voted-2026!");
    await expect(verifyPassword(hash, "Kwame-voted-2026!")).resolves.toBe(true);
    await expect(verifyPassword(hash, "kwame-voted-2026!")).resolves.toBe(false);
  });

  it("never stores the plaintext and salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password-1"), hashPassword("same-password-1")]);
    expect(a).not.toContain("same-password-1");
    expect(a).not.toEqual(b);
  });

  it("treats a malformed hash as a non-match instead of throwing", async () => {
    await expect(verifyPassword("not-a-hash", "anything")).resolves.toBe(false);
  });
});

describe("temporary passwords", () => {
  it("are the configured length and use only unambiguous characters", () => {
    for (let i = 0; i < 200; i += 1) {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(TEMP_PASSWORD_LENGTH);
      expect(pw).not.toMatch(/[0O1lI]/);
      expect(pw).toMatch(/[A-Z]/);
      expect(pw).toMatch(/[a-z]/);
      expect(pw).toMatch(/[2-9]/);
    }
  });

  it("are unique across many generations", () => {
    const seen = new Set(Array.from({ length: 2000 }, () => generateTemporaryPassword()));
    expect(seen.size).toBe(2000);
  });
});

describe("password policy", () => {
  it("accepts a long, uncommon password", () => {
    expect(passwordProblems("tilapia-on-the-volta-42", { email: "kofi@example.com" })).toEqual([]);
  });

  it("rejects short passwords", () => {
    expect(passwordProblems("short1")).toContain("Use at least 10 characters.");
  });

  it("rejects common passwords and repeated characters", () => {
    expect(passwordProblems("Password123").length).toBeGreaterThan(0);
    expect(passwordProblems("aaaaaaaaaaaa").length).toBeGreaterThan(0);
  });

  it("rejects passwords containing the email local part or the name", () => {
    expect(passwordProblems("kofiasante-2026", { email: "kofiasante@example.com" })).toContain(
      "Do not include your email address in your password.",
    );
    expect(passwordProblems("mensah-rocks-2026", { fullName: "Kojo Mensah" })).toContain(
      "Do not include your name in your password.",
    );
  });
});
