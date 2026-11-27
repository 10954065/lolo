/**
 * Architectural guard for the secret ballot: only src/server/services/ballot-box.ts may
 * import the ballot schema or name the anonymous ballot tables in SQL, and the voting path
 * may not log or audit ballot data.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve("src");
const ALLOWED = new Set([
  path.join(SRC, "server", "services", "ballot-box.ts"),
  path.join(SRC, "server", "db", "schema", "ballots.ts"),
  path.join(SRC, "server", "db", "schema", "index.ts"),
]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = walk(SRC);

describe("ballot isolation", () => {
  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("only ballot-box.ts imports the ballot schema", () => {
    const offenders = files.filter(
      (f) => !ALLOWED.has(f) && /from\s+["'][^"']*schema\/ballots["']/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no other module references the ballot tables or table objects", () => {
    const offenders = files.filter((f) => {
      if (ALLOWED.has(f)) return false;
      const src = readFileSync(f, "utf8");
      // SQL keywords are upper-case in this codebase; case-sensitive to avoid matching prose.
      return /\b(ballot_selections|FROM\s+ballots|INTO\s+ballots)\b/.test(src) || /\bballotSelections\b/.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it("the voting service never logs or audits", () => {
    const voting = readFileSync(path.join(SRC, "server", "services", "voting.ts"), "utf8");
    expect(voting).not.toMatch(/logger\.|console\./);
    expect(voting).not.toMatch(/recordAudit|audit\(/);
  });

  it("ballot IDs are random UUID v4, never time-ordered", () => {
    const box = readFileSync(path.join(SRC, "server", "services", "ballot-box.ts"), "utf8");
    expect(box).toMatch(/randomUUID\(\)/);
    expect(box).not.toMatch(/uuidv7|ulid|Date\.now\(\)|new Date\(/i);
  });
});
