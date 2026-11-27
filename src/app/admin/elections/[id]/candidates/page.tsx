import { Lock, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidatePhoto } from "@/components/elections/candidate-photo";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isBallotLocked } from "@/lib/election-rules";
import { requirePermissionPage } from "@/server/auth/guards";
import { listCandidates } from "@/server/services/candidates";
import { getElection } from "@/server/services/elections";
import { listPositions } from "@/server/services/positions";

export default async function CandidatesPage({ params }: PageProps<"/admin/elections/[id]/candidates">) {
  await requirePermissionPage("candidates.write");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const [positions, rows] = await Promise.all([listPositions(id), listCandidates(id)]);
  const isLocked = isBallotLocked(election, new Date());

  return (
    <div className="space-y-4">
      {isLocked ? (
        <p className="flex items-center gap-2 rounded-lg border bg-muted p-3 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden /> The ballot is locked. Only the emergency withdrawal procedure is available
          (open a candidate).
        </p>
      ) : positions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add positions first.</p>
      ) : (
        <Button asChild>
          <Link href={`/admin/elections/${id}/candidates/new`}>
            <UserPlus className="size-4" /> Register candidate
          </Link>
        </Button>
      )}
      {positions.map(({ position }) => {
        const inPosition = rows.filter((r) => r.candidate.positionId === position.id);
        return (
          <Card key={position.id}>
            <CardHeader>
              <CardTitle className="text-base">{position.title}</CardTitle>
            </CardHeader>
            <CardContent>
              {inPosition.length === 0 ? (
                <p className="text-sm text-muted-foreground">No candidates registered.</p>
              ) : (
                <ul className="divide-y">
                  {inPosition.map(({ candidate: c, hasPhoto, photoVersion }) => (
                    <li key={c.id} className="flex items-center gap-3 py-3">
                      <CandidatePhoto candidateId={c.id} name={c.fullName} hasPhoto={hasPhoto} version={photoVersion} size="sm" />
                      <Link
                        href={`/admin/elections/${id}/candidates/${c.id}`}
                        className="min-w-0 flex-1 font-medium text-ink hover:text-brand hover:underline"
                      >
                        {c.fullName}
                      </Link>
                      <StatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
