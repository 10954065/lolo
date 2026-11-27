import { AlertTriangle, Award, Download, Scale, ShieldCheck, Users, Vote } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import type { listTieResolutions, ResultsSnapshot } from "@/server/services/results";

type Resolutions = Awaited<ReturnType<typeof listTieResolutions>>;

type ResultsViewProps = {
  snapshot: ResultsSnapshot;
  resolutions: Resolutions;
  /** "Provisional" banner for unpublished results (administrator only). */
  isProvisional?: boolean;
  publishedAt?: Date | null;
  sha256?: string | null;
  exportBase?: string | null;
};

export function ResultsView({ snapshot, resolutions, isProvisional, publishedAt, sha256, exportBase }: ResultsViewProps) {
  return (
    <div className="space-y-6">
      {isProvisional ? (
        <p className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm font-medium text-warning" role="status">
          <AlertTriangle className="size-4" aria-hidden /> PROVISIONAL: not published. Visible to the System Administrator only.
        </p>
      ) : publishedAt ? (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-success/40 bg-success-soft p-3 text-sm text-success">
          <ShieldCheck className="size-4" aria-hidden /> Official results published {formatDateTime(publishedAt)}.
          {sha256 ? <code className="break-all text-xs">SHA-256 {sha256}</code> : null}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Eligible voters" value={snapshot.eligibleVoters} icon={Users} />
        <StatCard label="Ballots cast" value={snapshot.ballotsCast} icon={Vote} tone="brand" hint="Invalid ballots: 0 (rejected before recording)" />
        <StatCard label="Turnout" value={`${snapshot.turnoutPercent}%`} icon={Award} tone="success" />
      </div>
      {!snapshot.isConsistent ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
          Integrity warning: {snapshot.ballotsCast} ballots but {snapshot.participationRecords} participation records.
        </p>
      ) : null}
      {exportBase ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`${exportBase}/results.pdf`}>
              <Download className="size-4" /> Results (PDF)
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`${exportBase}/results.csv`}>
              <Download className="size-4" /> Results (CSV)
            </a>
          </Button>
        </div>
      ) : null}
      {snapshot.positions.map((p) => {
        const resolution = resolutions.find((r) => r.resolution.positionId === p.positionId);
        const maxVotes = Math.max(1, ...p.candidates.map((c) => c.votes), p.abstentions);
        return (
          <Card key={p.positionId}>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-lg">{p.title}</CardTitle>
              <div className="flex flex-wrap gap-2">
                {p.seats > 1 ? <Badge variant="outline">{p.seats} seats</Badge> : null}
                {p.isUnopposed ? <Badge variant="outline">Unopposed</Badge> : null}
                {p.hasTie ? (
                  <Badge className="border-warning/40 bg-warning-soft text-warning" variant="outline">
                    <Scale className="size-3" /> Tie
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-3">
                {p.candidates.map((c) => (
                  <li key={c.candidateId}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2 font-medium">
                        {c.fullName}
                        {c.isWinner ? (
                          <Badge className="border-success/40 bg-success-soft text-success" variant="outline">
                            Elected
                          </Badge>
                        ) : null}
                        {c.isTied ? <Badge variant="outline">Tied</Badge> : null}
                        {c.status === "WITHDRAWN" ? <Badge variant="outline">Withdrawn</Badge> : null}
                      </span>
                      <span className="tabular-nums">
                        <strong>{c.votes}</strong> votes · {c.percent}%
                      </span>
                    </div>
                    <div className="mt-1 h-2.5 rounded-full bg-muted" aria-hidden>
                      <div
                        className={`h-2.5 rounded-full ${c.isWinner ? "bg-success" : c.isTied ? "bg-warning" : "bg-navy/60"}`}
                        style={{ width: `${(c.votes / maxVotes) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
                <li className="flex justify-between text-sm text-muted-foreground">
                  <span>Abstentions</span>
                  <span className="tabular-nums">
                    {p.abstentions} · {p.abstentionPercent}%
                  </span>
                </li>
              </ul>
              {p.hasTie ? (
                <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm">
                  <p className="font-medium text-warning">
                    {p.unfilledSeats} seat(s) undecided because of a tie. The system does not choose a winner.
                  </p>
                  <p className="mt-1 text-muted-foreground">Procedure: {snapshot.tieBreakProcedure}</p>
                  {resolution ? (
                    <p className="mt-2 font-medium text-navy">
                      Tie-break outcome recorded {formatDateTime(resolution.resolution.recordedAt)}: {resolution.candidateName} ({resolution.resolution.method})
                    </p>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Percentages are of ballots cast. Results are computed from anonymous ballots only; no individual ballot can be linked
        to a member.
      </p>
    </div>
  );
}
