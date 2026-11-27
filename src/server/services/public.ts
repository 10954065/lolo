import "server-only";
import { and, asc, desc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { candidates, elections, executivePositions } from "@/server/db/schema";

const PUBLIC_CANDIDATE_STATUSES = ["SCHEDULED", "OPEN", "CLOSED", "RESULTS_PUBLISHED", "ARCHIVED"] as const;

/** Elections that may be shown publicly (no drafts, no cancelled). Minimal fields only. */
export async function publicElections() {
  return getDb()
    .select({
      id: elections.id,
      title: elections.title,
      description: elections.description,
      electionYear: elections.electionYear,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      resultsVisibility: elections.resultsVisibility,
    })
    .from(elections)
    .where(notInArray(elections.status, ["DRAFT", "CANCELLED"]))
    .orderBy(desc(elections.opensAt));
}

/** Approved candidates of elections whose ballot is final. No member links, no contact details. */
export async function publicCandidates() {
  return getDb()
    .select({
      electionId: elections.id,
      electionTitle: elections.title,
      positionTitle: executivePositions.title,
      id: candidates.id,
      fullName: candidates.fullName,
      biography: candidates.biography,
      manifesto: candidates.manifesto,
      hasPhoto: sql<boolean>`EXISTS (SELECT 1 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
      photoVersion: sql<string | null>`(SELECT cp.sha256 FROM candidate_photos cp WHERE cp.candidate_id = "candidates"."id")`,
    })
    .from(candidates)
    .innerJoin(elections, eq(elections.id, candidates.electionId))
    .innerJoin(executivePositions, eq(executivePositions.id, candidates.positionId))
    .where(and(eq(candidates.status, "APPROVED"), inArray(elections.status, [...PUBLIC_CANDIDATE_STATUSES])))
    .orderBy(desc(elections.opensAt), asc(executivePositions.displayOrder), asc(candidates.fullName));
}
