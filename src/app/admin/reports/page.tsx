import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ReportsHub } from "@/components/results/reports-hub";
import { requirePermissionPage } from "@/server/auth/guards";
import { listElections } from "@/server/services/elections";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReportsPage() {
  await requirePermissionPage("reports.export");
  return (
    <>
      <PageHeader title="Reports" description="Every export is recorded in the audit log." />
      <ReportsHub elections={await listElections()} canSeeUnpublished />
    </>
  );
}
