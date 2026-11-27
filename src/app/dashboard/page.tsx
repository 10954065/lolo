import { CalendarClock, CheckCircle2, Megaphone, ShieldCheck, Vote } from "lucide-react";
import Link from "next/link";
import { PlainText } from "@/components/elections/election-summary";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Countdown } from "@/components/voting/countdown";
import { formatDateTime } from "@/lib/datetime";
import { acceptsVotes, effectiveStatus } from "@/lib/election-rules";
import { requireRolePage } from "@/server/auth/guards";
import { announcementsForMember } from "@/server/services/announcements";
import { syncIfDue } from "@/server/services/elections";
import { electionsForMember } from "@/server/services/voting";

export default async function VoterHomePage() {
  const { session } = await requireRolePage("VOTER");
  await syncIfDue();
  const memberId = session.user.memberId;
  const [elections, announcements] = memberId
    ? await Promise.all([electionsForMember(memberId), announcementsForMember(memberId, 5)])
    : [[], []];
  const now = new Date();

  return (
    <>
      <PageHeader
        title={`Welcome, ${session.user.fullName.split(" ")[0]}`}
        description="Your MOBA 2017 elections, announcements and voting status."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="space-y-4" aria-labelledby="my-elections">
          <h2 id="my-elections" className="text-lg font-semibold text-navy">
            My elections
          </h2>
          {elections.length === 0 ? (
            <EmptyState
              icon={Vote}
              title="No elections yet"
              description="When you are added to an election's voter roll it will appear here with the candidates and voting times."
            />
          ) : (
            elections.map(({ election: e, votedAt }) => {
              const status = effectiveStatus(e, now);
              const canVote = acceptsVotes(e, now) && !votedAt;
              return (
                <Card key={e.id} className={canVote ? "border-brand/50 shadow-sm" : undefined}>
                  <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-navy">{e.title}</h3>
                        <StatusBadge status={status} />
                      </div>
                      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <CalendarClock className="size-4" aria-hidden />
                        {formatDateTime(e.opensAt)} to {formatDateTime(e.closesAt)}
                      </p>
                      {votedAt ? (
                        <p className="flex items-center gap-1.5 text-sm font-medium text-success">
                          <CheckCircle2 className="size-4" aria-hidden /> You voted on {formatDateTime(votedAt)}
                        </p>
                      ) : canVote ? (
                        <Countdown target={e.closesAt.toISOString()} label="Voting closes in" />
                      ) : status === "SCHEDULED" ? (
                        <Countdown target={e.opensAt.toISOString()} label="Voting opens in" />
                      ) : null}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {canVote ? (
                        <Button asChild size="lg" className="h-11">
                          <Link href={`/dashboard/elections/${e.id}/ballot`}>Vote now</Link>
                        </Button>
                      ) : null}
                      {status === "RESULTS_PUBLISHED" ? (
                        <Button asChild variant="outline">
                          <Link href={`/dashboard/results/${e.id}`}>View results</Link>
                        </Button>
                      ) : null}
                      <Button asChild variant="outline">
                        <Link href={`/dashboard/elections/${e.id}`}>Details &amp; candidates</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>
        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="size-4 text-brand" aria-hidden /> Announcements
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {announcements.length === 0 ? (
                <p className="text-sm text-muted-foreground">No announcements.</p>
              ) : (
                announcements.map(({ announcement: a, electionTitle }) => (
                  <article key={a.id} className="space-y-1 border-l-2 border-brand/40 pl-3">
                    <h3 className="text-sm font-semibold">{a.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(a.publishedAt)}
                      {electionTitle ? ` · ${electionTitle}` : ""}
                    </p>
                    <PlainText text={a.body} className="text-sm" />
                  </article>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-start gap-3 py-4 text-sm">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <p>
                Your vote is secret. Nobody, including the administrators, can see how you voted.{" "}
                <Link href="/guidelines" className="font-medium text-brand hover:underline">
                  Voting guidelines
                </Link>
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
