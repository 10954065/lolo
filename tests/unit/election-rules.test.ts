import { describe, expect, it } from "vitest";
import {
  acceptsVotes,
  ALLOWED_TRANSITIONS,
  canTransition,
  effectiveStatus,
  isBallotLocked,
  votingWindow,
} from "@/lib/election-rules";

const opensAt = new Date("2026-12-05T08:00:00Z");
const closesAt = new Date("2026-12-05T17:00:00Z");
const before = new Date("2026-12-05T07:59:59Z");
const during = new Date("2026-12-05T12:00:00Z");
const atClose = new Date("2026-12-05T17:00:00Z");

describe("voting window", () => {
  it("is half-open: [opensAt, closesAt)", () => {
    expect(votingWindow({ opensAt, closesAt }, before)).toBe("BEFORE");
    expect(votingWindow({ opensAt, closesAt }, opensAt)).toBe("DURING");
    expect(votingWindow({ opensAt, closesAt }, during)).toBe("DURING");
    expect(votingWindow({ opensAt, closesAt }, atClose)).toBe("AFTER");
  });

  it("accepts votes only when the status AND the clock allow it", () => {
    expect(acceptsVotes({ status: "SCHEDULED", opensAt, closesAt }, during)).toBe(true);
    expect(acceptsVotes({ status: "OPEN", opensAt, closesAt }, during)).toBe(true);
    expect(acceptsVotes({ status: "OPEN", opensAt, closesAt }, before)).toBe(false);
    expect(acceptsVotes({ status: "OPEN", opensAt, closesAt }, atClose)).toBe(false);
    for (const status of ["DRAFT", "NOMINATION", "CLOSED", "CANCELLED", "RESULTS_PUBLISHED"] as const) {
      expect(acceptsVotes({ status, opensAt, closesAt }, during), status).toBe(false);
    }
  });
});

describe("ballot freeze", () => {
  it("locks once the opening time is reached or the election is open/finished", () => {
    expect(isBallotLocked({ status: "SCHEDULED", opensAt }, before)).toBe(false);
    expect(isBallotLocked({ status: "SCHEDULED", opensAt }, opensAt)).toBe(true);
    expect(isBallotLocked({ status: "DRAFT", opensAt }, during)).toBe(false);
    for (const status of ["OPEN", "CLOSED", "RESULTS_PUBLISHED", "ARCHIVED", "CANCELLED"] as const) {
      expect(isBallotLocked({ status, opensAt }, before), status).toBe(true);
    }
  });
});

describe("effective status", () => {
  it("reflects the clock for scheduled/open elections", () => {
    expect(effectiveStatus({ status: "SCHEDULED", opensAt, closesAt }, before)).toBe("SCHEDULED");
    expect(effectiveStatus({ status: "SCHEDULED", opensAt, closesAt }, during)).toBe("OPEN");
    expect(effectiveStatus({ status: "OPEN", opensAt, closesAt }, atClose)).toBe("CLOSED");
    expect(effectiveStatus({ status: "CANCELLED", opensAt, closesAt }, during)).toBe("CANCELLED");
  });
});

describe("transition map", () => {
  it("never leaves terminal states and never reopens a closed election", () => {
    expect(ALLOWED_TRANSITIONS.ARCHIVED).toEqual([]);
    expect(ALLOWED_TRANSITIONS.CANCELLED).toEqual([]);
    expect(canTransition("CLOSED", "OPEN")).toBe(false);
    expect(canTransition("CLOSED", "SCHEDULED")).toBe(false);
    expect(canTransition("RESULTS_PUBLISHED", "OPEN")).toBe(false);
  });

  it("only allows publication after closing", () => {
    for (const from of Object.keys(ALLOWED_TRANSITIONS) as Array<keyof typeof ALLOWED_TRANSITIONS>) {
      expect(canTransition(from, "RESULTS_PUBLISHED"), from).toBe(from === "CLOSED");
    }
  });
});
