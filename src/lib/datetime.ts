/**
 * All timestamps are stored in UTC and displayed in the Africa/Accra time zone.
 * These helpers are pure and safe to use on both server and client.
 */
export const APP_TIME_ZONE = "Africa/Accra";

type DateInput = Date | string | number | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** e.g. "Sat, 6 Dec 2026, 09:00 GMT" */
export function formatDateTime(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  return date ? `${dateTimeFormatter.format(date)} GMT` : fallback;
}

export function formatDate(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function formatTime(value: DateInput, fallback = "—"): string {
  const date = toDate(value);
  return date ? `${timeFormatter.format(date)} GMT` : fallback;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function zonedParts(date: Date): ZonedParts {
  const map: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = Number(part.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/** Offset (ms) of APP_TIME_ZONE from UTC at the given instant. */
function zoneOffsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Value for <input type="datetime-local"> showing the instant in Africa/Accra wall-clock time. */
export function toZonedInputValue(value: DateInput): string {
  const date = toDate(value);
  if (!date) return "";
  const p = zonedParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Interpret "YYYY-MM-DDTHH:mm" as Africa/Accra wall-clock time and return the UTC instant.
 * Returns null for malformed or impossible dates.
 */
export function zonedInputToUtc(value: string): Date | null {
  const match = INPUT_PATTERN.exec(value.trim());
  if (!match) return null;
  const [year, month, day, hour, minute, second = 0] = match.slice(1).map((v) => Number(v ?? 0));
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const guess = Date.UTC(year, month - 1, day, hour, minute, second);
  const first = guess - zoneOffsetMs(new Date(guess));
  const result = guess - zoneOffsetMs(new Date(first));
  const check = zonedParts(new Date(result));
  if (check.year !== year || check.month !== month || check.day !== day) return null;
  return new Date(result);
}

/** Human-readable remaining duration, e.g. "2 days 4 hours" or "35 minutes". */
export function formatDuration(ms: number): string {
  if (ms <= 0) return "0 minutes";
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (days > 0) return hours > 0 ? `${plural(days, "day")} ${plural(hours, "hour")}` : plural(days, "day");
  if (hours > 0) return mins > 0 ? `${plural(hours, "hour")} ${plural(mins, "minute")}` : plural(hours, "hour");
  return plural(Math.max(mins, 1), "minute");
}
