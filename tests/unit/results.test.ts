import { describe, expect, it } from "vitest";
import { decideWinners } from "@/server/services/results";

const row = (id: string, votes: number, status = "APPROVED") => ({ candidateId: id, fullName: id, status, votes });

describe("winner determination", () => {
  it("declares the plurality winner for a single seat", () => {
    const r = decideWinners([row("A", 10), row("B", 7)], 1, 20);
    expect(r.candidates.map((c) => [c.candidateId, c.isWinner, c.percent])).toEqual([
      ["A", true, 50],
      ["B", false, 35],
    ]);
    expect(r.hasTie).toBe(false);
    expect(r.unfilledSeats).toBe(0);
  });

  it("flags a tie for the winning seat and declares nobody", () => {
    const r = decideWinners([row("A", 8), row("B", 8), row("C", 2)], 1, 18);
    expect(r.hasTie).toBe(true);
    expect(r.candidates.filter((c) => c.isWinner)).toHaveLength(0);
    expect(r.candidates.filter((c) => c.isTied).map((c) => c.candidateId)).toEqual(["A", "B"]);
    expect(r.unfilledSeats).toBe(1);
  });

  it("fills clear seats and flags only the tied last seat in multi-seat positions", () => {
    const r = decideWinners([row("A", 9), row("B", 5), row("C", 5), row("D", 1)], 2, 20);
    expect(r.candidates.find((c) => c.candidateId === "A")?.isWinner).toBe(true);
    expect(r.candidates.filter((c) => c.isTied).map((c) => c.candidateId)).toEqual(["B", "C"]);
    expect(r.unfilledSeats).toBe(1);
  });

  it("treats a tie that fits within the seats as winners", () => {
    const r = decideWinners([row("A", 5), row("B", 5)], 2, 10);
    expect(r.candidates.every((c) => c.isWinner)).toBe(true);
    expect(r.hasTie).toBe(false);
  });

  it("never declares a withdrawn candidate or a candidate with zero votes", () => {
    const r = decideWinners([row("W", 12, "WITHDRAWN"), row("A", 3), row("Z", 0)], 1, 15);
    expect(r.candidates.find((c) => c.candidateId === "W")?.isWinner).toBe(false);
    expect(r.candidates.find((c) => c.candidateId === "A")?.isWinner).toBe(true);
    const none = decideWinners([row("A", 0), row("B", 0)], 1, 0);
    expect(none.candidates.some((c) => c.isWinner)).toBe(false);
    expect(none.candidates.every((c) => c.percent === 0)).toBe(true);
  });
});
