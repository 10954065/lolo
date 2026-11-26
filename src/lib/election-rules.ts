/**
 * Pure election lifecycle rules (no I/O) shared by services and UI.
 * Server-side enforcement always re-checks these with the database clock.
 */
import type { ElectionStatus } from "@/server/db/schema/enums";

export const STATUS_ORDER: readonly ElectionStatus[] = [
  "DRAFT",
  "REGISTRATION",
  "NOMINATION",
  "CANDIDATE_APPROVAL",
  "SCHEDULED",
  "OPEN",
  "CLOSED",
  "RESULTS_PUBLISHED",
  "ARCHIVED",
];

/** Manual transitions the System Administrator may perform (time-driven ones are added by the scheduler). */
export const ALLOWED_TRANSITIONS: Readonly<Record<ElectionStatus, readonly ElectionStatus[]>> = {
  DRAFT: ["REGISTRATION", "NOMINATION", "CANDIDATE_APPROVAL", "SCHEDULED", "CANCELLED"],
  REGISTRATION: ["DRAFT", "NOMINATION", "CANDIDATE_APPROVAL", "SCHEDULED", "CANCELLED"],
  NOMINATION: ["REGISTRATION", "CANDIDATE_APPROVAL", "SCHEDULED", "CANCELLED"],
  CANDIDATE_APPROVAL: ["NOMINATION", "SCHEDULED", "CANCELLED"],
  SCHEDULED: ["CANDIDATE_APPROVAL", "OPEN", "CANCELLED"],
  OPEN: ["CLOSED", "CANCELLED"],
  CLOSED: ["RESULTS_PUBLISHED"],
  RESULTS_PUBLISHED: ["CLOSED", "ARCHIVED"],
  ARCHIVED: [],
  CANCELLED: [],
};

export const STATUS_DESCRIPTIONS: Record<ElectionStatus, string> = {
  DRAFT: "Being prepared. Not visible to members.",
  REGISTRATION: "Member registration and verification in progress.",
  NOMINATION: "Candidate nominations are being received.",
  CANDIDATE_APPROVAL: "Nominations closed; candidates are being vetted.",
  SCHEDULED: "Ballot is final and voting times are set.",
  OPEN: "Voting is in progress.",
  CLOSED: "Voting has ended. Results are not yet published.",
  RESULTS_PUBLISHED: "Official results have been published.",
  ARCHIVED: "Completed and archived.",
  CANCELLED: "Cancelled. No results will be produced.",
};

export function canTransition(from: ElectionStatus, to: ElectionStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type VotingWindow = "BEFORE" | "DURING" | "AFTER";

export function votingWindow(e: { opensAt: Date; closesAt: Date }, now: Date): VotingWindow {
  if (now.getTime() < e.opensAt.getTime()) return "BEFORE";
  if (now.getTime() < e.closesAt.getTime()) return "DURING";
  return "AFTER";
}

/** Whether a ballot submitted at `now` may be accepted (status AND time must both allow it). */
export function acceptsVotes(e: { status: ElectionStatus; opensAt: Date; closesAt: Date }, now: Date): boolean {
  return (e.status === "SCHEDULED" || e.status === "OPEN") && votingWindow(e, now) === "DURING";
}

/**
 * Ballot structure, candidates, rules and the voter roll freeze as soon as voting could
 * begin, and stay frozen forever after.
 */
export function isBallotLocked(e: { status: ElectionStatus; opensAt: Date }, now: Date): boolean {
  if (["OPEN", "CLOSED", "RESULTS_PUBLISHED", "ARCHIVED", "CANCELLED"].includes(e.status)) return true;
  return e.status === "SCHEDULED" && now.getTime() >= e.opensAt.getTime();
}

/** Status as members should perceive it right now (the scheduler persists the same transitions). */
export function effectiveStatus(e: { status: ElectionStatus; opensAt: Date; closesAt: Date }, now: Date): ElectionStatus {
  if (e.status === "SCHEDULED" || e.status === "OPEN") {
    const w = votingWindow(e, now);
    if (w === "DURING") return "OPEN";
    if (w === "AFTER") return "CLOSED";
  }
  return e.status;
}

/** Is the election visible on public pages and to members? */
export function isPubliclyVisible(status: ElectionStatus): boolean {
  return !["DRAFT", "CANCELLED"].includes(status);
}

/** Are candidates final enough to be shown publicly? */
export function areCandidatesPublic(status: ElectionStatus): boolean {
  return ["SCHEDULED", "OPEN", "CLOSED", "RESULTS_PUBLISHED", "ARCHIVED"].includes(status);
}

export const STANDARD_POSITIONS: readonly string[] = [
  "President",
  "Vice President",
  "General Secretary",
  "Financial Secretary",
  "Treasurer",
  "Organizing Secretary",
  "Public Relations Officer",
  "Welfare Officer",
];

/** Minimum reason length for emergency procedures during voting. */
export const EMERGENCY_REASON_MIN = 20;
