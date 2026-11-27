import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateTime,
  formatDuration,
  toZonedInputValue,
  zonedInputToUtc,
} from "@/lib/datetime";

describe("Africa/Accra date handling", () => {
  it("interprets admin input as Accra wall-clock time (UTC+0, no DST)", () => {
    expect(zonedInputToUtc("2026-12-05T08:30")?.toISOString()).toBe("2026-12-05T08:30:00.000Z");
    expect(zonedInputToUtc("2026-06-15T23:59")?.toISOString()).toBe("2026-06-15T23:59:00.000Z");
  });

  it("round-trips through the datetime-local input format", () => {
    const instant = new Date("2026-12-05T17:45:00Z");
    expect(zonedInputToUtc(toZonedInputValue(instant))?.getTime()).toBe(instant.getTime());
  });

  it("rejects malformed or impossible input", () => {
    expect(zonedInputToUtc("not a date")).toBeNull();
    expect(zonedInputToUtc("2026-02-30T10:00")).toBeNull();
    expect(zonedInputToUtc("2026-13-01T10:00")).toBeNull();
    expect(zonedInputToUtc("2026-01-01T24:00")).toBeNull();
  });

  it("formats for display with a GMT marker and handles empty values", () => {
    expect(formatDateTime("2026-12-05T08:30:00Z")).toContain("08:30 GMT");
    expect(formatDate("2026-12-05T08:30:00Z")).toBe("5 Dec 2026");
    expect(formatDateTime(null)).toBe("Not set");
    expect(toZonedInputValue(undefined)).toBe("");
  });

  it("formats durations in plain language", () => {
    expect(formatDuration(0)).toBe("0 minutes");
    expect(formatDuration(30_000)).toBe("1 minute");
    expect(formatDuration(35 * 60_000)).toBe("35 minutes");
    expect(formatDuration((2 * 24 * 60 + 4 * 60) * 60_000)).toBe("2 days 4 hours");
    expect(formatDuration(3 * 60 * 60_000)).toBe("3 hours");
  });
});
