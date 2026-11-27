import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ResultsView } from "@/components/results/results-view";
import { requireRolePage } from "@/server/auth/guards";
import { getElection } from "@/server/services/elections";
import { canViewPublishedResults, listTieResolutions, publishedSnapshot } from "@/server/services/results";

export const metadata: Metadata = { title: "Results" };

export default async function VoterResultsPage({ params }: PageProps<"/dashboard/results/[id]">) {
  const { session } = await requireRolePage("VOTER");
  const { id } = await params;
  const election = await getElection(id);
  if (!election || !(await canViewPublishedResults(session, election))) notFound();
  const published = await publishedSnapshot(id);
  if (!published) notFound();
  return (
    <>
      <PageHeader title={`Results: ${election.title}`} backHref="/dashboard" backLabel="My dashboard" />
      <ResultsView
        snapshot={published.snapshot}
        resolutions={await listTieResolutions(id)}
        publishedAt={published.publishedAt}
        sha256={published.sha256}
        exportBase={`/api/exports/elections/${id}`}
      />
    </>
  );
}
