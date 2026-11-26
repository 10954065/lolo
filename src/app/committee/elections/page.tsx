import { Vote } from "lucide-react";
import type { Metadata } from "next";
import { ElectionsTable } from "@/components/elections/elections-table";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { requirePermissionPage } from "@/server/auth/guards";
import { listElections, syncIfDue } from "@/server/services/elections";

export const metadata: Metadata = { title: "Elections" };

export default async function CommitteeElectionsPage() {
  await requirePermissionPage("elections.read");
  await syncIfDue();
  const rows = await listElections();
  return (
    <>
      <PageHeader title="Elections" description="Schedules, ballots, candidates and live participation. View only." />
      {rows.length === 0 ? (
        <EmptyState icon={Vote} title="No elections have been created yet" />
      ) : (
        <ElectionsTable rows={rows} now={new Date()} basePath="/committee/elections" />
      )}
    </>
  );
}
