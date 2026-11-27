/**
 * Static guarantee: every exported Server Action authenticates and authorizes on the server
 * before doing anything. Server Actions are public HTTP endpoints — a missing guard would let
 * anyone (including Electoral Committee members) call them directly.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ACTIONS_DIR = path.resolve("src/server/actions");
/** Intentionally public: they establish or recover a session. */
const PUBLIC_ACTIONS = new Set([
  "loginAction",
  "logoutAction",
  "forgotPasswordAction",
  "resetPasswordAction",
  // Inclusion check only (returns which election, never content); rate-limited per IP.
  "verifyReceiptAction",
]);
const GUARD = /await\s+require(Permission|Active|Session|Voter)Action\(/;

function exportedActions(source: string): Array<{ name: string; body: string }> {
  const results: Array<{ name: string; body: string }> = [];
  const pattern = /export async function (\w+)\s*\(/g;
  const starts = [...source.matchAll(pattern)];
  starts.forEach((match, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    results.push({ name: match[1], body: source.slice(match.index, end) });
  });
  return results;
}

const files = readdirSync(ACTIONS_DIR).filter((f) => f.endsWith(".ts"));
const actionFiles = files.filter((f) => readFileSync(path.join(ACTIONS_DIR, f), "utf8").startsWith('"use server"'));

describe("server action guards", () => {
  it("finds the server action modules", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(4);
  });

  for (const file of actionFiles) {
    const source = readFileSync(path.join(ACTIONS_DIR, file), "utf8");
    for (const { name, body } of exportedActions(source)) {
      if (PUBLIC_ACTIONS.has(name)) continue;
      it(`${file} › ${name} calls a server-side guard`, () => {
        expect(GUARD.test(body), `${name} must call require*Action() before doing work`).toBe(true);
      });
    }
  }

  it("modules without 'use server' export no async functions callable from the client", () => {
    for (const file of files.filter((f) => !actionFiles.includes(f))) {
      const source = readFileSync(path.join(ACTIONS_DIR, file), "utf8");
      expect(source.startsWith('import "server-only"'), `${file} must be server-only`).toBe(true);
    }
  });
});
