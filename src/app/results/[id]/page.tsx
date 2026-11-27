import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandLogo } from "@/components/brand/brand-logo";
import { ResultsView } from "@/components/results/results-view";
import { getCurrentSession } from "@/server/auth/session";
import { getElection } from "@/server/services/elections";
import { canViewPublishedResults, listTieResolutions, publishedSnapshot } from "@/server/services/results";

export const metadata: Metadata = { title: "Election results" };

/** Public results page — only for elections whose results visibility is PUBLIC. */
export default async function PublicResultsPage({ params }: PageProps<"/results/[id]">) {
  const { id } = await params;
  const election = await getElection(id);
  if (!election || !(await canViewPublishedResults(await getCurrentSession(), election))) notFound();
  const published = await publishedSnapshot(id);
  if (!published) notFound();
  return (
    <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-10">
      <Link href="/">
        <BrandLogo />
      </Link>
      <h1 className="text-3xl font-semibold text-ink">Results: {election.title}</h1>
      <ResultsView
        snapshot={published.snapshot}
        resolutions={await listTieResolutions(id)}
        publishedAt={published.publishedAt}
        sha256={published.sha256}
        exportBase={election.resultsVisibility === "PUBLIC" ? `/api/exports/elections/${id}` : null}
      />
    </main>
  );
}
