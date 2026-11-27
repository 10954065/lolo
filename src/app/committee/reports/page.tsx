import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsHub } from "@/components/results/reports-hub";
import { requirePermissionPage } from "@/server/auth/guards";
import { listElections } from "@/server/services/elections";

export const metadata: Metadata = { title: "Reports" };

export default async function CommitteeReportsPage() {
  await requirePermissionPage("reports.export");
  return (
    <>
      <PageHeader title="Reports" description="Download reports for review. Results appear once officially published." />
      <ReportsHub elections={await listElections()} canSeeUnpublished={false} />
    </>
  );
}
