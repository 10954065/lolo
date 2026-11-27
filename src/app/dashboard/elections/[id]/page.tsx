import { CalendarClock, CheckCircle2, Info, Vote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlainText } from "@/components/elections/election-summary";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CandidateProfile } from "@/components/voting/candidate-profile";
import { Countdown } from "@/components/voting/countdown";
import { formatDateTime } from "@/lib/datetime";
import { requireRolePage } from "@/server/auth/guards";
import { syncIfDue } from "@/server/services/elections";
import { voterElectionView } from "@/server/services/voting";

export const metadata: Metadata = { title: "Election" };

export default async function VoterElectionPage({ params }: PageProps<"/dashboard/elections/[id]">) {
  const { session } = await requireRolePage("VOTER");
  await syncIfDue();
  const { id } = await params;
  const view = session.user.memberId ? await voterElectionView(session.user.memberId, id) : null;
  if (!view) notFound();
  const { election, status } = view;

  return (
    <>
      <PageHeader title={election.title} backHref="/dashboard" backLabel="My dashboard" description={<StatusBadge status={status} />} />
      <div className="space-y-6">
        {view.votedAt ? (
          <Alert className="border-success/40 bg-success-soft" role="status">
            <CheckCircle2 className="size-4 text-success" />
            <AlertTitle className="text-success">You have voted</AlertTitle>
            <AlertDescription className="text-success">
              Your ballot was recorded on {formatDateTime(view.votedAt)}. It cannot be changed.
            </AlertDescription>
          </Alert>
        ) : view.canVoteNow ? (
          <Card className="border-brand/40 bg-brand-soft/40">
            <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-lg font-semibold text-ink">Voting is open</p>
                <p className="text-sm text-muted-foreground">Closes {formatDateTime(election.closesAt)}</p>
                <Countdown target={election.closesAt.toISOString()} label="Time remaining:" />
              </div>
              <Button asChild size="lg" className="h-12 text-base">
                <Link href={`/dashboard/elections/${election.id}/ballot`}>
                  <Vote className="size-5" /> Go to the ballot
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : status === "SCHEDULED" ? (
          <Alert>
            <CalendarClock className="size-4" />
            <AlertTitle>Voting has not started</AlertTitle>
            <AlertDescription>
              Voting opens on {formatDateTime(election.opensAt)} and closes on {formatDateTime(election.closesAt)}.
              <Countdown target={election.opensAt.toISOString()} label="Opens in" />
            </AlertDescription>
          </Alert>
        ) : status === "CANCELLED" ? (
          <Alert variant="destructive">
            <AlertTitle>This election was cancelled</AlertTitle>
            {election.cancelledReason ? <AlertDescription>{election.cancelledReason}</AlertDescription> : null}
          </Alert>
        ) : ["CLOSED", "RESULTS_PUBLISHED", "ARCHIVED"].includes(status) ? (
          <Alert>
            <Info className="size-4" />
            <AlertTitle>Voting has ended</AlertTitle>
            <AlertDescription>
              Voting closed on {formatDateTime(election.closesAt)}.{" "}
              {status === "RESULTS_PUBLISHED" ? (
                <Link className="font-medium text-brand underline" href={`/dashboard/results/${election.id}`}>
                  View the official results
                </Link>
              ) : (
                "Results will appear here once published."
              )}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <Info className="size-4" />
            <AlertTitle>Preparation in progress</AlertTitle>
            <AlertDescription>The ballot is not final yet. Voting times will be confirmed when the election is scheduled.</AlertDescription>
          </Alert>
        )}

        {election.description || election.instructions ? (
          <Card>
            <CardHeader>
              <CardTitle>About this election</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <PlainText text={election.description} />
              {election.instructions ? (
                <div>
                  <h3 className="font-semibold text-ink">How to vote</h3>
                  <PlainText text={election.instructions} className="text-muted-foreground" />
                </div>
              ) : null}
              {election.rules ? (
                <details>
                  <summary className="cursor-pointer font-medium text-brand">Election rules</summary>
                  <PlainText text={election.rules} className="mt-2 text-muted-foreground" />
                </details>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {["SCHEDULED", "OPEN", "CLOSED", "RESULTS_PUBLISHED", "ARCHIVED"].includes(status) ? (
          <section className="space-y-6" aria-labelledby="candidates-heading">
            <h2 id="candidates-heading" className="text-xl font-semibold text-ink">
              Candidates
            </h2>
            {view.positions.map((p) => (
              <div key={p.id} className="space-y-3">
                <h3 className="font-semibold text-ink">{p.title}</h3>
                {p.candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No candidates.</p>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {p.candidates.map((c) => (
                      <CandidateProfile key={c.id} candidate={c} />
                    ))}
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : null}
      </div>
    </>
  );
}
