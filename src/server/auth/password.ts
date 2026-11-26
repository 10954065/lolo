import "server-only";
import { hash, verify, type Algorithm, type Options } from "@node-rs/argon2";
import { randomInt } from "node:crypto";

/** Argon2id with OWASP Password Storage Cheat Sheet parameters (m=19 MiB, t=2, p=1). */
const ARGON2ID = 2 as Algorithm; // Algorithm.Argon2id (const enum; not usable with isolatedModules)
export const ARGON2_OPTIONS: Options = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const TEMP_PASSWORD_LENGTH = 12;

/** No 0/O, 1/l/I — temporary passwords are typed from an email by non-technical users. */
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const TEMP_ALPHABET = UPPER + LOWER + DIGITS;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // A malformed hash must never be treated as a match.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/**
 * Spend the same work as a real verification when the account does not exist,
 * so response timing does not reveal which emails are registered.
 */
export async function burnPasswordVerification(password: string): Promise<void> {
  dummyHash ??= hashPassword("moba-timing-equalizer-not-a-real-password");
  await verifyPassword(await dummyHash, password);
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)];
}

/** CSPRNG temporary password containing at least one upper, lower and digit (~69 bits). */
export function generateTemporaryPassword(length = TEMP_PASSWORD_LENGTH): string {
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(TEMP_ALPHABET));
  // Fisher–Yates shuffle with CSPRNG so the guaranteed classes are not positional.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop",
  "iloveyou12", "welcome123", "letmein123", "admin12345", "abc1234567", "mfantsipim",
  "mfantsipim1", "mfantsipim2017", "moba2017", "moba201712", "election2017", "passw0rd123",
  "1q2w3e4r5t", "qwerty1234", "football12", "ghana12345", "accra12345", "0123456789",
]);

export interface PasswordContext {
  email?: string;
  fullName?: string;
}

/** Returns user-facing problems with a proposed password (empty array = acceptable). */
export function passwordProblems(password: string, context: PasswordContext = {}): string[] {
  const problems: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  }
  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lowered) || /^(.)\1+$/.test(password)) {
    problems.push("This password is too common. Choose something harder to guess.");
  }
  const localPart = context.email?.split("@")[0]?.toLowerCase();
  if (localPart && localPart.length >= 4 && lowered.includes(localPart)) {
    problems.push("Do not include your email address in your password.");
  }
  const nameParts = (context.fullName ?? "").toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
  if (nameParts.some((part) => lowered.includes(part))) {
    problems.push("Do not include your name in your password.");
  }
  return problems;
}
