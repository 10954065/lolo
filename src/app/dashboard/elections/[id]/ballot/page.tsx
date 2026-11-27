import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { PlainText } from "@/components/elections/election-summary";
import { PageHeader } from "@/components/layout/page-header";
import { BallotForm } from "@/components/voting/ballot-form";
import { formatDateTime } from "@/lib/datetime";
import { castBallotAction } from "@/server/actions/voting";
import { requireRolePage } from "@/server/auth/guards";
import { voterElectionView } from "@/server/services/voting";

export const metadata: Metadata = { title: "Ballot" };

export default async function BallotPage({ params }: PageProps<"/dashboard/elections/[id]/ballot">) {
  const { session } = await requireRolePage("VOTER");
  const { id } = await params;
  const view = session.user.memberId ? await voterElectionView(session.user.memberId, id) : null;
  if (!view) notFound();
  // Server-side checks decide; this page only renders the ballot when it could be accepted.
  if (!view.canVoteNow) redirect(`/dashboard/elections/${id}`);

  return (
    <>
      <PageHeader
        title={view.election.title}
        backHref={`/dashboard/elections/${id}`}
        backLabel="Election details"
        description={`Voting closes ${formatDateTime(view.election.closesAt)}`}
      />
      <div className="mx-auto max-w-3xl space-y-6">
        <p className="flex items-start gap-2 rounded-lg border bg-card p-3 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          Your vote is secret. Your choices are stored separately from your name, and nobody, including the
          administrators, can see how you voted.
        </p>
        {view.election.instructions ? <PlainText text={view.election.instructions} className="text-sm" /> : null}
        <BallotForm
          electionId={id}
          electionTitle={view.election.title}
          action={castBallotAction.bind(null, id)}
          positions={view.positions.map((p) => ({
            id: p.id,
            title: p.title,
            description: p.description,
            maxSelections: p.maxSelections,
            allowAbstain: p.allowAbstain,
            candidates: p.candidates.map((c) => ({ id: c.id, fullName: c.fullName, hasPhoto: c.hasPhoto, photoVersion: c.photoVersion })),
          }))}
        />
      </div>
    </>
  );
}
