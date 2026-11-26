/**
 * Anonymous ballot side + participation.
 *
 * SECRET-BALLOT RULES (enforced by tests/unit/ballot-isolation.test.ts):
 *  - `ballots` and `ballot_selections` may only be imported by src/server/services/ballot-box.ts.
 *  - No column on the ballot side may reference a member/user, a timestamp, IP or user agent.
 *  - IDs are random UUID v4 (gen_random_uuid / crypto.randomUUID); never time-ordered IDs.
 *  - The application DB role has INSERT-only privileges on these two tables (scripts/db-harden.ts).
 */
import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { candidates, elections, executivePositions } from "./elections";
import { members } from "./members";

export const voterParticipation = pgTable(
  "voter_participation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "restrict" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "restrict" }),
    votedAt: timestamp("voted_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    unique("voter_participation_election_member_unique").on(t.electionId, t.memberId),
    index("voter_participation_election_idx").on(t.electionId),
  ],
);

export const ballots = pgTable("ballots", {
  id: uuid("id").primaryKey().defaultRandom(),
  electionId: uuid("election_id")
    .notNull()
    .references(() => elections.id, { onDelete: "restrict" }),
  receiptHash: text("receipt_hash").notNull().unique("ballots_receipt_hash_unique"),
});

export const ballotSelections = pgTable(
  "ballot_selections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ballotId: uuid("ballot_id")
      .notNull()
      .references(() => ballots.id, { onDelete: "cascade" }),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "restrict" }),
    positionId: uuid("position_id")
      .notNull()
      .references(() => executivePositions.id, { onDelete: "restrict" }),
    /** NULL records an abstention for the position. */
    candidateId: uuid("candidate_id").references(() => candidates.id, { onDelete: "restrict" }),
  },
  (t) => [
    unique("ballot_selections_unique")
      .on(t.ballotId, t.positionId, t.candidateId)
      .nullsNotDistinct(),
    index("ballot_selections_election_idx").on(t.electionId),
  ],
);
