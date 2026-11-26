import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { MemberActivity, MemberEmailHistory, MemberSummaryCard } from "@/components/members/member-overview";
import { requirePermissionPage } from "@/server/auth/guards";
import { listEmailJobs } from "@/server/services/email-queue";
import { getMember, memberHistory } from "@/server/services/members";

export const metadata: Metadata = { title: "Member record" };

export default async function CommitteeMemberPage({ params }: PageProps<"/committee/members/[id]">) {
  await requirePermissionPage("members.read");
  const { id } = await params;
  const record = await getMember(id);
  if (!record) notFound();
  const [emails, history] = await Promise.all([
    listEmailJobs({ memberId: record.member.id, pageSize: 50 }),
    memberHistory(record.member.id),
  ]);

  return (
    <>
      <PageHeader title={record.member.fullName} backHref="/committee/members" backLabel="Member records" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-6">
          <MemberSummaryCard record={record} />
          <MemberEmailHistory rows={emails.rows} />
        </div>
        <MemberActivity rows={history} />
      </div>
    </>
  );
}
