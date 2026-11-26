import "server-only";
import { and, asc, count, eq, sql } from "drizzle-orm";
import { STANDARD_POSITIONS } from "@/lib/election-rules";
import type { Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { getDb, type Transaction } from "@/server/db/client";
import { candidates, executivePositions } from "@/server/db/schema";
import { businessRule, isUniqueViolation, notFound, validationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation/common";
import { positionInputSchema } from "@/server/validation/elections";
import { recordAudit } from "./audit";
import { assertBallotEditable, lockElection } from "./elections";

type PositionRow = typeof executivePositions.$inferSelect;

export async function listPositions(electionId: string) {
  return getDb()
    .select({
      position: executivePositions,
      approvedCandidates: sql<number>`(SELECT count(*) FROM candidates c WHERE c.position_id = "executive_positions"."id" AND c.status = 'APPROVED')`,
      totalCandidates: sql<number>`(SELECT count(*) FROM candidates c WHERE c.position_id = "executive_positions"."id")`,
    })
    .from(executivePositions)
    .where(eq(executivePositions.electionId, electionId))
    .orderBy(asc(executivePositions.displayOrder), asc(executivePositions.title));
}

function parse(input: unknown) {
  const parsed = positionInputSchema.safeParse(input);
  if (!parsed.success) throw validationError("Please correct the highlighted fields.", fieldErrorsOf(parsed.error));
  return { ...parsed.data, description: parsed.data.description ?? "", maxCandidates: parsed.data.maxCandidates ?? null };
}

async function lockPosition(tx: Transaction, positionId: string): Promise<PositionRow> {
  const [position] = await tx.select().from(executivePositions).where(eq(executivePositions.id, positionId)).for("update");
  if (!position) throw notFound("Position not found.");
  return position;
}

function duplicateTitle(error: unknown): never {
  if (isUniqueViolation(error, "executive_positions_election_title_unique")) {
    throw validationError("This election already has a position with that title.", { title: ["Already exists."] });
  }
  throw error;
}

async function nextOrder(tx: Transaction, electionId: string): Promise<number> {
  const [{ max }] = await tx
    .select({ max: sql<number>`coalesce(max(${executivePositions.displayOrder}), 0)` })
    .from(executivePositions)
    .where(eq(executivePositions.electionId, electionId));
  return Number(max) + 1;
}

export async function createPosition(actor: Actor, electionId: string, input: unknown): Promise<string> {
  assertCan(actor, "positions.write");
  const data = parse(input);
  try {
    return await getDb().transaction(async (tx) => {
      const election = await lockElection(tx, electionId);
      await assertBallotEditable(tx, election);
      const [created] = await tx
        .insert(executivePositions)
        .values({ ...data, electionId, displayOrder: await nextOrder(tx, electionId) })
        .returning({ id: executivePositions.id });
      await recordAudit(tx, actor, {
        action: "POSITION_CREATED",
        resourceType: "position",
        resourceId: created.id,
        summary: `Added position “${data.title}” to “${election.title}” (${data.maxSelections} seat(s), abstain ${data.allowAbstain ? "allowed" : "not allowed"})`,
      });
      return created.id;
    });
  } catch (error) {
    duplicateTitle(error);
  }
}

export async function addStandardPositions(actor: Actor, electionId: string): Promise<number> {
  assertCan(actor, "positions.write");
  return getDb().transaction(async (tx) => {
    const election = await lockElection(tx, electionId);
    await assertBallotEditable(tx, election);
    const existing = await tx
      .select({ title: executivePositions.title })
      .from(executivePositions)
      .where(eq(executivePositions.electionId, electionId));
    const taken = new Set(existing.map((e) => e.title.toLowerCase()));
    let order = await nextOrder(tx, electionId);
    const toAdd = STANDARD_POSITIONS.filter((t) => !taken.has(t.toLowerCase()));
    for (const title of toAdd) {
      await tx.insert(executivePositions).values({ electionId, title, displayOrder: order });
      order += 1;
    }
    if (toAdd.length) {
      await recordAudit(tx, actor, {
        action: "POSITION_CREATED",
        resourceType: "election",
        resourceId: electionId,
        summary: `Added standard positions to “${election.title}”: ${toAdd.join(", ")}`,
      });
    }
    return toAdd.length;
  });
}

export async function updatePosition(actor: Actor, positionId: string, input: unknown): Promise<void> {
  assertCan(actor, "positions.write");
  const data = parse(input);
  try {
    await getDb().transaction(async (tx) => {
      const before = await lockPosition(tx, positionId);
      const election = await lockElection(tx, before.electionId);
      await assertBallotEditable(tx, election);
      await tx.update(executivePositions).set({ ...data, updatedAt: new Date() }).where(eq(executivePositions.id, positionId));
      await recordAudit(tx, actor, {
        action: "POSITION_UPDATED",
        resourceType: "position",
        resourceId: positionId,
        summary: `Updated position “${data.title}” in “${election.title}”`,
        metadata: {
          before: { title: before.title, maxSelections: before.maxSelections, allowAbstain: before.allowAbstain, maxCandidates: before.maxCandidates },
          after: { title: data.title, maxSelections: data.maxSelections, allowAbstain: data.allowAbstain, maxCandidates: data.maxCandidates },
        },
      });
    });
  } catch (error) {
    duplicateTitle(error);
  }
}

export async function deletePosition(actor: Actor, positionId: string): Promise<void> {
  assertCan(actor, "positions.write");
  await getDb().transaction(async (tx) => {
    const position = await lockPosition(tx, positionId);
    const election = await lockElection(tx, position.electionId);
    await assertBallotEditable(tx, election);
    const [{ n }] = await tx.select({ n: count() }).from(candidates).where(eq(candidates.positionId, positionId));
    if (Number(n) > 0) throw businessRule("Remove or move this position's candidates before deleting it.");
    await tx.delete(executivePositions).where(eq(executivePositions.id, positionId));
    await recordAudit(tx, actor, {
      action: "POSITION_DELETED",
      resourceType: "position",
      resourceId: positionId,
      summary: `Deleted position “${position.title}” from “${election.title}”`,
    });
  });
}

/** Swap display order with the neighbouring position. */
export async function movePosition(actor: Actor, positionId: string, direction: "up" | "down"): Promise<void> {
  assertCan(actor, "positions.write");
  await getDb().transaction(async (tx) => {
    const position = await lockPosition(tx, positionId);
    const election = await lockElection(tx, position.electionId);
    await assertBallotEditable(tx, election);
    const siblings = await tx
      .select()
      .from(executivePositions)
      .where(eq(executivePositions.electionId, position.electionId))
      .orderBy(asc(executivePositions.displayOrder), asc(executivePositions.title));
    const index = siblings.findIndex((s) => s.id === positionId);
    const swapWith = siblings[direction === "up" ? index - 1 : index + 1];
    if (!swapWith) return;
    // Normalise ordering to 1..n, then swap the two entries.
    const reordered = siblings.map((s) => s.id);
    [reordered[index], reordered[siblings.indexOf(swapWith)]] = [swapWith.id, positionId];
    for (const [i, id] of reordered.entries()) {
      await tx.update(executivePositions).set({ displayOrder: i + 1 }).where(and(eq(executivePositions.id, id)));
    }
    await recordAudit(tx, actor, {
      action: "POSITION_REORDERED",
      resourceType: "position",
      resourceId: positionId,
      summary: `Moved “${position.title}” ${direction} in “${election.title}”`,
    });
  });
}
