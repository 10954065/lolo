import "server-only";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/server/auth/actor";
import { assertCan } from "@/server/auth/permissions";
import { getDb } from "@/server/db/client";
import { announcements, elections, electionVoters, members } from "@/server/db/schema";
import { env } from "@/server/env";
import { notFound, validationError } from "@/server/errors";
import { fieldErrorsOf } from "@/server/validation/common";
import { announcementInputSchema } from "@/server/validation/elections";
import { recordAudit } from "./audit";
import { enqueueEmail } from "./email-queue";

export async function listAnnouncements(electionId?: string | null, limit = 50) {
  return getDb()
    .select({ announcement: announcements, electionTitle: elections.title })
    .from(announcements)
    .leftJoin(elections, eq(elections.id, announcements.electionId))
    .where(electionId ? eq(announcements.electionId, electionId) : undefined)
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
}

/** Announcements a member may see: general ones plus those of elections whose roll includes them. */
export async function announcementsForMember(memberId: string, limit = 20) {
  return getDb()
    .select({ announcement: announcements, electionTitle: elections.title })
    .from(announcements)
    .leftJoin(elections, eq(elections.id, announcements.electionId))
    .where(
      or(
        isNull(announcements.electionId),
        sql`EXISTS (SELECT 1 FROM election_voters v WHERE v.election_id = ${announcements.electionId} AND v.member_id = ${memberId}::uuid)`,
      ),
    )
    .orderBy(desc(announcements.publishedAt))
    .limit(limit);
}

export async function createAnnouncement(
  actor: Actor,
  electionId: string | null,
  input: unknown,
  shouldEmail: boolean,
): Promise<{ id: string; emailed: number }> {
  assertCan(actor, "announcements.write");
  const parsed = announcementInputSchema.safeParse(input);
  if (!parsed.success) throw validationError("Please correct the highlighted fields.", fieldErrorsOf(parsed.error));
  if (electionId && !z.uuid().safeParse(electionId).success) throw notFound("Election not found.");
  return getDb().transaction(async (tx) => {
    let electionTitle: string | null = null;
    if (electionId) {
      const [e] = await tx.select({ title: elections.title }).from(elections).where(eq(elections.id, electionId));
      if (!e) throw notFound("Election not found.");
      electionTitle = e.title;
    }
    const [created] = await tx
      .insert(announcements)
      .values({ electionId, title: parsed.data.title, body: parsed.data.body, createdBy: actor.userId })
      .returning({ id: announcements.id });
    let emailed = 0;
    if (shouldEmail) {
      const recipients = electionId
        ? await tx
            .select({ id: members.id, email: members.email, fullName: members.fullName })
            .from(electionVoters)
            .innerJoin(members, eq(members.id, electionVoters.memberId))
            .where(and(eq(electionVoters.electionId, electionId), eq(members.accountStatus, "ACTIVE"), isNull(members.deletedAt)))
        : await tx
            .select({ id: members.id, email: members.email, fullName: members.fullName })
            .from(members)
            .where(and(eq(members.approvalStatus, "APPROVED"), eq(members.accountStatus, "ACTIVE"), isNull(members.deletedAt)));
      for (const r of recipients) {
        await enqueueEmail(tx, {
          template: "election_announcement",
          to: r.email,
          vars: {
            recipientName: r.fullName,
            announcementTitle: parsed.data.title,
            announcementBody: parsed.data.body,
            electionUrl: electionId ? `${env().APP_URL}/dashboard/elections/${electionId}` : `${env().APP_URL}/dashboard`,
          },
          memberId: r.id,
          electionId,
        });
      }
      emailed = recipients.length;
    }
    await recordAudit(tx, actor, {
      action: "ANNOUNCEMENT_PUBLISHED",
      resourceType: "announcement",
      resourceId: created.id,
      summary: `Published announcement “${parsed.data.title}”${electionTitle ? ` for “${electionTitle}”` : ""}${shouldEmail ? `; emailed ${emailed} members` : ""}`,
    });
    return { id: created.id, emailed };
  });
}

export async function deleteAnnouncement(actor: Actor, announcementId: string): Promise<void> {
  assertCan(actor, "announcements.write");
  if (!z.uuid().safeParse(announcementId).success) throw notFound("Announcement not found.");
  await getDb().transaction(async (tx) => {
    const [a] = await tx.delete(announcements).where(eq(announcements.id, announcementId)).returning();
    if (!a) throw notFound("Announcement not found.");
    await recordAudit(tx, actor, {
      action: "ANNOUNCEMENT_DELETED",
      resourceType: "announcement",
      resourceId: announcementId,
      summary: `Removed announcement “${a.title}”`,
    });
  });
}
