import { eq } from "drizzle-orm";
import { toZonedInputValue } from "@/lib/datetime";
import type { Actor } from "@/server/auth/actor";
import { getDb } from "@/server/db/client";
import { elections } from "@/server/db/schema";
import { approveMembers, createMember } from "@/server/services/members";

const MINUTE = 60_000;

export function electionInput(overrides: Record<string, unknown> = {}) {
  const opens = new Date(Date.now() + 60 * MINUTE);
  const closes = new Date(Date.now() + 8 * 60 * MINUTE);
  return {
    title: "MOBA 2017 Executive Elections",
    description: "Test election",
    electionYear: "2026",
    opensAt: toZonedInputValue(opens),
    closesAt: toZonedInputValue(closes),
    rules: "One member, one vote.",
    instructions: "Choose one candidate per position.",
    resultsVisibility: "ELIGIBLE_VOTERS",
    tieBreakProcedure: "Run-off between tied candidates organised by the committee.",
    ...overrides,
  };
}

/** Move the voting window relative to the current time (minutes; negative = past). */
export async function setWindow(electionId: string, opensInMinutes: number, closesInMinutes: number): Promise<void> {
  await getDb()
    .update(elections)
    .set({
      opensAt: new Date(Date.now() + opensInMinutes * MINUTE),
      closesAt: new Date(Date.now() + closesInMinutes * MINUTE),
    })
    .where(eq(elections.id, electionId));
}

export async function approvedMembers(admin: Actor, count: number, prefix = "voter"): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(await createMember(admin, { fullName: `${prefix} Member ${i + 1}`, email: `${prefix}${i + 1}@example.com` }));
  }
  await approveMembers(admin, ids, false);
  return ids;
}
