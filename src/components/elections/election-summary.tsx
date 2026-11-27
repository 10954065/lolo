import { CalendarClock, ListChecks, UserCheck, Users, Vote } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/datetime";
import { effectiveStatus, STATUS_DESCRIPTIONS } from "@/lib/election-rules";
import type { ElectionCounts, ElectionRow } from "@/server/services/elections";
import type { electionStatusTimeline } from "@/server/services/elections";

type Timeline = Awaited<ReturnType<typeof electionStatusTimeline>>;

/** Read-only overview used by both the administrator and the Electoral Committee. */
export function ElectionSummary({ election, counts, now }: { election: ElectionRow; counts: ElectionCounts; now: Date }) {
  const status = effectiveStatus(election, now);
  const turnout = counts.voters ? Math.round((counts.voted / counts.voters) * 1000) / 10 : 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Executive positions" value={counts.positions} icon={ListChecks} />
        <StatCard label="Approved candidates" value={counts.approvedCandidates} icon={UserCheck} hint={`${counts.pendingCandidates} awaiting decision`} />
        <StatCard label="Eligible voters" value={counts.voters} icon={Users} />
        <StatCard
          label="Voted"
          value={counts.voted}
          icon={Vote}
          tone={counts.voted ? "brand" : "default"}
          hint={`${turnout}% turnout · ${counts.ballots} ballots stored`}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-brand" aria-hidden /> Schedule
          </CardTitle>
          <CardDescription>{STATUS_DESCRIPTIONS[status]}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <StatusBadge status={status} />
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Voting opens</dt>
              <dd className="mt-1 font-medium">{formatDateTime(election.opensAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Voting closes</dt>
              <dd className="mt-1 font-medium">{formatDateTime(election.closesAt)}</dd>
            </div>
          </dl>
          {counts.ballots !== counts.voted ? (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              Integrity warning: {counts.ballots} ballots stored but {counts.voted} members recorded as voted.
            </p>
          ) : null}
          {election.cancelledReason ? (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">Cancelled: {election.cancelledReason}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function ElectionTimeline({ entries }: { entries: Timeline }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Status history</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="border-l-2 border-brand/30 pl-3 text-sm">
              <p className="flex flex-wrap items-center gap-2">
                <StatusBadge status={e.toStatus} />
                <span className="text-muted-foreground">{formatDateTime(e.createdAt)}</span>
                <span className="text-xs text-muted-foreground">{e.actorUserId ? "by administrator" : "automatic (system clock)"}</span>
              </p>
              {e.reason ? <p className="mt-1 text-muted-foreground">Reason: {e.reason}</p> : null}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

/** Plain-text renderer: preserves line breaks, never interprets HTML or Markdown. */
export function PlainText({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;
  return <div className={`whitespace-pre-line break-words ${className ?? ""}`}>{text}</div>;
}
