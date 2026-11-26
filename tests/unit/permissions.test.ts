import { describe, expect, it } from "vitest";
import { assertCan, can, homePathForRole, PERMISSIONS, roleHasPermission } from "@/server/auth/permissions";

const WRITE_PERMISSIONS = PERMISSIONS.filter(
  (p) => /\.(write|transition|publish|send|manage)$/.test(p) || p === "results.read.unpublished",
);

describe("permission matrix", () => {
  it("gives the System Administrator every staff permission but never ballot casting", () => {
    for (const p of PERMISSIONS) {
      expect(roleHasPermission("SYSTEM_ADMIN", p)).toBe(p !== "ballot.cast");
    }
  });

  it("gives the Electoral Committee no write permission at all", () => {
    expect(WRITE_PERMISSIONS.length).toBeGreaterThan(8);
    for (const p of WRITE_PERMISSIONS) {
      expect(roleHasPermission("ELECTORAL_COMMITTEE", p), p).toBe(false);
    }
    expect(roleHasPermission("ELECTORAL_COMMITTEE", "members.read")).toBe(true);
    expect(roleHasPermission("ELECTORAL_COMMITTEE", "audit.read")).toBe(true);
    expect(roleHasPermission("ELECTORAL_COMMITTEE", "ballot.cast")).toBe(false);
  });

  it("limits voters to casting their own ballot", () => {
    for (const p of PERMISSIONS) expect(roleHasPermission("VOTER", p)).toBe(p === "ballot.cast");
  });

  it("grants nothing to the SYSTEM pseudo-role", () => {
    for (const p of PERMISSIONS) expect(can({ role: "SYSTEM" }, p)).toBe(false);
  });

  it("has no permission that could expose individual ballots", () => {
    expect(PERMISSIONS.some((p) => /ballot\.(read|view|list)|selection/.test(p))).toBe(false);
  });

  it("assertCan throws a read-only message for the committee", () => {
    expect(() => assertCan({ role: "ELECTORAL_COMMITTEE" }, "members.write")).toThrow(/read-only access/);
    expect(() => assertCan({ role: "SYSTEM_ADMIN" }, "members.write")).not.toThrow();
  });

  it("routes each role to its own area", () => {
    expect(homePathForRole("SYSTEM_ADMIN")).toBe("/admin");
    expect(homePathForRole("ELECTORAL_COMMITTEE")).toBe("/committee");
    expect(homePathForRole("VOTER")).toBe("/dashboard");
  });
});
