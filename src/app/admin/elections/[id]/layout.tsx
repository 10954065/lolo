import { notFound } from "next/navigation";
import { ElectionTabs } from "@/components/elections/election-tabs";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { effectiveStatus } from "@/lib/election-rules";
import { requirePermissionPage } from "@/server/auth/guards";
import { getElection, syncIfDue } from "@/server/services/elections";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "positions", label: "Positions" },
  { segment: "candidates", label: "Candidates" },
  { segment: "voters", label: "Voter roll" },
  { segment: "announcements", label: "Announcements" },
];

export default async function AdminElectionLayout({ children, params }: LayoutProps<"/admin/elections/[id]">) {
  await requirePermissionPage("elections.write");
  await syncIfDue();
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  return (
    <>
      <PageHeader
        title={election.title}
        backHref="/admin/elections"
        backLabel="All elections"
        description={<StatusBadge status={effectiveStatus(election, new Date())} />}
      />
      <ElectionTabs basePath={`/admin/elections/${election.id}`} tabs={TABS} />
      {children}
    </>
  );
}
