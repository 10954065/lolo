import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { ResultsView } from "@/components/results/results-view";
import { requirePermissionPage } from "@/server/auth/guards";
import { getElection } from "@/server/services/elections";
import { listTieResolutions, publishedSnapshot } from "@/server/services/results";

export const metadata: Metadata = { title: "Results" };

export default async function CommitteeResultsPage({ params }: PageProps<"/committee/elections/[id]/results">) {
  await requirePermissionPage("results.read.published");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const published = await publishedSnapshot(id);
  return (
    <>
      <PageHeader title={`Results: ${election.title}`} backHref={`/committee/elections/${id}`} backLabel="Election" />
      {published ? (
        <ResultsView
          snapshot={published.snapshot}
          resolutions={await listTieResolutions(id)}
          publishedAt={published.publishedAt}
          sha256={published.sha256}
          exportBase={`/api/exports/elections/${id}`}
        />
      ) : (
        <p className="rounded-lg border bg-muted p-4 text-sm text-muted-foreground">
          Results have not been published. They become visible here when the System Administrator publishes them.
        </p>
      )}
    </>
  );
}
