import { eq } from "drizzle-orm";
import { Ban, CheckCircle2, ImageOff, UserMinus, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { CandidateForm } from "@/components/elections/candidate-form";
import { CandidatePhoto } from "@/components/elections/candidate-photo";
import { PlainText } from "@/components/elections/election-summary";
import { ActionButton, ActionDialog } from "@/components/forms/action-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isBallotLocked, votingWindow } from "@/lib/election-rules";
import {
  deactivateCandidateAction,
  decideCandidateAction,
  removeCandidatePhotoAction,
  updateCandidateAction,
  withdrawCandidateAction,
} from "@/server/actions/elections";
import { requirePermissionPage } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { members } from "@/server/db/schema";
import { getCandidate } from "@/server/services/candidates";
import { getElection } from "@/server/services/elections";
import { listPositions } from "@/server/services/positions";

export default async function CandidatePage({ params }: PageProps<"/admin/elections/[id]/candidates/[candidateId]">) {
  await requirePermissionPage("candidates.write");
  const { id, candidateId } = await params;
  const [election, row] = await Promise.all([getElection(id), getCandidate(candidateId)]);
  if (!election || !row || row.candidate.electionId !== id) notFound();
  const { candidate: c } = row;
  const now = new Date();
  const isLocked = isBallotLocked(election, now);
  const isVoting = ["SCHEDULED", "OPEN"].includes(election.status) && votingWindow(election, now) === "DURING";
  const [positions, linked] = await Promise.all([
    listPositions(id),
    c.memberId ? getDb().select({ email: members.email }).from(members).where(eq(members.id, c.memberId)) : Promise.resolve([]),
  ]);
  const isActive = c.status === "PENDING" || c.status === "APPROVED" || c.status === "REJECTED";

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <Card>
        <CardHeader className="flex-row items-center gap-4">
          <CandidatePhoto candidateId={c.id} name={c.fullName} hasPhoto={row.hasPhoto} version={row.photoVersion} size="lg" />
          <div>
            <CardTitle className="text-xl">{c.fullName}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
              {row.positionTitle} <StatusBadge status={c.status} />
            </CardDescription>
            {c.statusReason ? <p className="mt-1 text-sm text-muted-foreground">Reason: {c.statusReason}</p> : null}
          </div>
        </CardHeader>
        <CardContent>
          {isLocked ? (
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold text-navy">Biography</h3>
                <PlainText text={c.biography || "Not provided."} className="text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-semibold text-navy">Manifesto</h3>
                <PlainText text={c.manifesto || "Not provided."} className="text-muted-foreground" />
              </div>
            </div>
          ) : (
            <CandidateForm
              action={updateCandidateAction.bind(null, id, c.id)}
              positions={positions.map((p) => ({ id: p.position.id, title: p.position.title }))}
              defaults={{
                positionId: c.positionId,
                fullName: c.fullName,
                membershipNumber: c.membershipNumber ?? "",
                memberEmail: linked[0]?.email ?? "",
                biography: c.biography,
                manifesto: c.manifesto,
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decisions</CardTitle>
          <CardDescription>
            {isLocked
              ? isVoting
                ? "Voting is in progress. Only emergency withdrawal is possible (password and detailed reason required)."
                : "The candidate list is final."
              : "Approve or reject nominations before the election is scheduled."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {!isLocked && c.status !== "APPROVED" && isActive ? (
            <ActionDialog
              action={decideCandidateAction.bind(null, id, c.id, "APPROVED")}
              triggerVariant="default"
              triggerLabel={<><CheckCircle2 className="size-4" /> Approve</>}
              title={`Approve ${c.fullName}?`}
              description="Approved candidates appear on the ballot."
              confirmLabel="Approve"
            />
          ) : null}
          {!isLocked && c.status !== "REJECTED" && isActive ? (
            <ActionDialog
              action={decideCandidateAction.bind(null, id, c.id, "REJECTED")}
              triggerLabel={<><XCircle className="size-4" /> Reject</>}
              title={`Reject ${c.fullName}?`}
              confirmLabel="Reject"
              isDestructive
              reasonLabel="Reason for rejection"
            />
          ) : null}
          {(!isLocked && isActive) || (isVoting && c.status === "APPROVED") ? (
            <ActionDialog
              action={withdrawCandidateAction.bind(null, id, c.id)}
              triggerLabel={<><UserMinus className="size-4" /> {isVoting ? "Emergency withdrawal" : "Withdraw"}</>}
              title={`Withdraw ${c.fullName}?`}
              description={
                isVoting
                  ? "EMERGENCY: the candidate is removed from ballots not yet cast. Votes already cast for them are kept and reported."
                  : "The candidate will not appear on the ballot."
              }
              confirmLabel="Withdraw candidate"
              isDestructive
              reasonLabel={isVoting ? "Detailed reason (at least 20 characters)" : "Reason"}
            />
          ) : null}
          {!isLocked && c.status !== "DEACTIVATED" && c.status !== "WITHDRAWN" ? (
            <ActionDialog
              action={deactivateCandidateAction.bind(null, id, c.id)}
              triggerVariant="ghost"
              triggerLabel={<><Ban className="size-4" /> Deactivate</>}
              title={`Deactivate ${c.fullName}?`}
              confirmLabel="Deactivate"
              isDestructive
              reasonLabel="Reason"
            />
          ) : null}
          {!isLocked && row.hasPhoto ? (
            <ActionButton
              action={removeCandidatePhotoAction.bind(null, id, c.id)}
              variant="ghost"
              label={<><ImageOff className="size-4" /> Remove photo</>}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
