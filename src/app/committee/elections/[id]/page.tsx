import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CandidatePhoto } from "@/components/elections/candidate-photo";
import { ElectionSummary, ElectionTimeline, PlainText } from "@/components/elections/election-summary";
import { VoterRollTable } from "@/components/elections/voter-roll-table";
import { NativeSelect } from "@/components/forms/native-select";
import { PageHeader } from "@/components/layout/page-header";
import { Pagination } from "@/components/shared/pagination";
import { StatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { effectiveStatus } from "@/lib/election-rules";
import { requirePermissionPage } from "@/server/auth/guards";
import { listCandidates } from "@/server/services/candidates";
import { electionCounts, electionStatusTimeline, getElection, syncIfDue } from "@/server/services/elections";
import { listPositions } from "@/server/services/positions";
import { listVoterRoll } from "@/server/services/voter-roll";

export const metadata: Metadata = { title: "Election" };

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  voted: z.enum(["yes", "no"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function CommitteeElectionPage({ params, searchParams }: PageProps<"/committee/elections/[id]">) {
  await requirePermissionPage("elections.read");
  await syncIfDue();
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const filters = filtersSchema.parse(await searchParams);
  const now = new Date();
  const [counts, timeline, positions, candidates, roll] = await Promise.all([
    electionCounts(id),
    electionStatusTimeline(id),
    listPositions(id),
    listCandidates(id),
    listVoterRoll(id, filters),
  ]);
  const basePath = `/committee/elections/${id}`;

  return (
    <>
      <PageHeader
        title={election.title}
        backHref="/committee/elections"
        backLabel="All elections"
        description={<StatusBadge status={effectiveStatus(election, now)} />}
      />
      <div className="space-y-6">
        <ElectionSummary election={election} counts={counts} now={now} />
        <Card>
          <CardHeader>
            <CardTitle>Ballot: positions and candidates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {positions.length === 0 ? <p className="text-sm text-muted-foreground">No positions configured.</p> : null}
            {positions.map(({ position: p }) => (
              <section key={p.id} className="space-y-2">
                <h3 className="flex flex-wrap items-center gap-2 font-semibold text-navy">
                  {p.title}
                  <Badge variant="outline">{p.maxSelections} seat(s)</Badge>
                  <Badge variant="outline">Abstain {p.allowAbstain ? "allowed" : "not allowed"}</Badge>
                </h3>
                <ul className="divide-y rounded-lg border">
                  {candidates
                    .filter((c) => c.candidate.positionId === p.id)
                    .map(({ candidate: c, hasPhoto, photoVersion }) => (
                      <li key={c.id} className="flex gap-3 p-3">
                        <CandidatePhoto candidateId={c.id} name={c.fullName} hasPhoto={hasPhoto} version={photoVersion} size="sm" />
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="flex flex-wrap items-center gap-2 font-medium">
                            {c.fullName} <StatusBadge status={c.status} />
                          </p>
                          {c.statusReason ? <p className="text-muted-foreground">Reason: {c.statusReason}</p> : null}
                          <details className="mt-1">
                            <summary className="cursor-pointer text-brand">Biography and manifesto</summary>
                            <PlainText text={c.biography} className="mt-2 text-muted-foreground" />
                            <PlainText text={c.manifesto} className="mt-2" />
                          </details>
                        </div>
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-navy">Voter roll and participation</h2>
          <form method="get" action={basePath} className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
            <div className="min-w-56 flex-1">
              <Input name="q" aria-label="Search the roll" defaultValue={filters.q ?? ""} placeholder="Search the roll" />
            </div>
            <div className="w-44">
              <NativeSelect name="voted" aria-label="Participation" defaultValue={filters.voted ?? ""}>
                <option value="">Everyone</option>
                <option value="yes">Voted</option>
                <option value="no">Not voted</option>
              </NativeSelect>
            </div>
            <Button type="submit">Apply</Button>
            <Button variant="ghost" asChild>
              <Link href={basePath}>Reset</Link>
            </Button>
          </form>
          <VoterRollTable rows={roll.rows} />
          <Pagination page={roll.page} pageSize={roll.pageSize} total={roll.total} params={{ q: filters.q, voted: filters.voted }} basePath={basePath} />
        </section>
        <ElectionTimeline entries={timeline} />
      </div>
    </>
  );
}
