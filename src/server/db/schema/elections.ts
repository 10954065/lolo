import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { candidateStatus, electionStatus, resultsVisibility } from "./enums";
import { members } from "./members";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const DEFAULT_TIE_BREAK_PROCEDURE =
  "A run-off vote between the tied candidates will be organised by the Electoral Committee. " +
  "The system will not automatically select a winner.";

export const elections = pgTable(
  "elections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    electionYear: integer("election_year").notNull(),
    status: electionStatus("status").notNull().default("DRAFT"),
    opensAt: ts("opens_at").notNull(),
    closesAt: ts("closes_at").notNull(),
    rules: text("rules").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    resultsVisibility: resultsVisibility("results_visibility").notNull().default("ELIGIBLE_VOTERS"),
    tieBreakProcedure: text("tie_break_procedure").notNull().default(DEFAULT_TIE_BREAK_PROCEDURE),
    ballotsMixedAt: ts("ballots_mixed_at"),
    resultsPublishedAt: ts("results_published_at"),
    resultsPublishedBy: uuid("results_published_by").references(() => users.id),
    cancelledReason: text("cancelled_reason"),
    archivedAt: ts("archived_at"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("elections_window_check", sql`${t.closesAt} > ${t.opensAt}`),
    index("elections_status_idx").on(t.status),
  ],
);

export const electionStatusHistory = pgTable(
  "election_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    fromStatus: electionStatus("from_status"),
    toStatus: electionStatus("to_status").notNull(),
    reason: text("reason"),
    /** NULL means the transition was performed automatically by the system scheduler. */
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("election_status_history_election_idx").on(t.electionId)],
);

export const electionVoters = pgTable(
  "election_voters",
  {
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    addedBy: uuid("added_by").references(() => users.id),
    addedAt: ts("added_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "election_voters_pk", columns: [t.electionId, t.memberId] }),
    index("election_voters_member_idx").on(t.memberId),
  ],
);

export const executivePositions = pgTable(
  "executive_positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    displayOrder: integer("display_order").notNull().default(0),
    /** Number of seats; a voter may select up to this many candidates. */
    maxSelections: integer("max_selections").notNull().default(1),
    allowAbstain: boolean("allow_abstain").notNull().default(true),
    maxCandidates: integer("max_candidates"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("executive_positions_election_title_unique").on(t.electionId, sql`lower(${t.title})`),
    check("executive_positions_max_selections_check", sql`${t.maxSelections} >= 1`),
    check(
      "executive_positions_max_candidates_check",
      sql`${t.maxCandidates} is null or ${t.maxCandidates} >= 1`,
    ),
  ],
);

export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => executivePositions.id, { onDelete: "no action" }),
    memberId: uuid("member_id").references(() => members.id, { onDelete: "restrict" }),
    fullName: text("full_name").notNull(),
    membershipNumber: text("membership_number"),
    biography: text("biography").notNull().default(""),
    manifesto: text("manifesto").notNull().default(""),
    status: candidateStatus("status").notNull().default("PENDING"),
    statusReason: text("status_reason"),
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: ts("decided_at"),
    ballotOrder: integer("ballot_order").notNull().default(0),
    registeredAt: ts("registered_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("candidates_position_member_unique")
      .on(t.positionId, t.memberId)
      .where(sql`${t.memberId} is not null`),
    index("candidates_election_idx").on(t.electionId),
    index("candidates_position_idx").on(t.positionId),
  ],
);

export const candidatePhotos = pgTable("candidate_photos", {
  candidateId: uuid("candidate_id")
    .primaryKey()
    .references(() => candidates.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
  mimeType: text("mime_type").notNull(),
  sha256: text("sha256").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const announcements = pgTable(
  "announcements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id").references(() => elections.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    publishedAt: ts("published_at").notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("announcements_election_idx").on(t.electionId)],
);

export const electionResults = pgTable("election_results", {
  electionId: uuid("election_id")
    .primaryKey()
    .references(() => elections.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull(),
  sha256: text("sha256").notNull(),
  publishedBy: uuid("published_by").references(() => users.id),
  publishedAt: ts("published_at").notNull().defaultNow(),
});

export const tieResolutions = pgTable(
  "tie_resolutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => executivePositions.id, { onDelete: "cascade" }),
    winnerCandidateId: uuid("winner_candidate_id")
      .notNull()
      .references(() => candidates.id),
    method: text("method").notNull(),
    notes: text("notes").notNull().default(""),
    recordedBy: uuid("recorded_by").references(() => users.id),
    recordedAt: ts("recorded_at").notNull().defaultNow(),
  },
  (t) => [unique("tie_resolutions_position_unique").on(t.electionId, t.positionId)],
);
