import { AlertTriangle, BellRing, CheckCircle2, CircleAlert, Trash2 } from "lucide-react";
import { notFound } from "next/navigation";
import { ElectionForm } from "@/components/elections/election-form";
import { ElectionSummary, ElectionTimeline } from "@/components/elections/election-summary";
import { ActionButton, ActionDialog } from "@/components/forms/action-dialog";
import { TextField } from "@/components/forms/form-parts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toZonedInputValue } from "@/lib/datetime";
import { ALLOWED_TRANSITIONS, isBallotLocked, votingWindow } from "@/lib/election-rules";
import {
  cancelElectionAction,
  deleteDraftElectionAction,
  extendVotingAction,
  postponeElectionAction,
  sendReminderAction,
  transitionElectionAction,
  updateElectionAction,
} from "@/server/actions/elections";
import { requirePermissionPage } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import type { ElectionStatus } from "@/server/db/schema/enums";
import { electionCounts, electionStatusTimeline, getElection, readinessProblems } from "@/server/services/elections";

const TRANSITION_LABELS: Partial<Record<ElectionStatus, string>> = {
  DRAFT: "Back to draft",
  REGISTRATION: "Start registration stage",
  NOMINATION: "Open nominations",
  CANDIDATE_APPROVAL: "Move to candidate approval",
  SCHEDULED: "Schedule election (finalise ballot)",
  OPEN: "Open voting now",
  CLOSED: "Close voting now",
  ARCHIVED: "Archive election",
};

export default async function AdminElectionOverview({ params }: PageProps<"/admin/elections/[id]">) {
  await requirePermissionPage("elections.write");
  const { id } = await params;
  const election = await getElection(id);
  if (!election) notFound();
  const now = new Date();
  const [counts, timeline, problems] = await Promise.all([
    electionCounts(id),
    electionStatusTimeline(id),
    readinessProblems(getDb(), election, now),
  ]);
  const isLocked = isBallotLocked(election, now);
  const isVoting = ["SCHEDULED", "OPEN"].includes(election.status) && votingWindow(election, now) === "DURING";
  const transitions = ALLOWED_TRANSITIONS[election.status].filter((t) => t !== "CANCELLED" && TRANSITION_LABELS[t]);
  const canCancel = !["RESULTS_PUBLISHED", "ARCHIVED", "CANCELLED"].includes(election.status);

  return (
    <div className="space-y-6">
      <ElectionSummary election={election} counts={counts} now={now} />

      {!isLocked && election.status !== "CANCELLED" ? (
        <Card>
          <CardHeader>
            <CardTitle>Readiness checklist</CardTitle>
            <CardDescription>All items must pass before the election can be scheduled.</CardDescription>
          </CardHeader>
          <CardContent>
            {problems.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="size-4" aria-hidden /> Ready to be scheduled.
              </p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {problems.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-warning">
                    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {p}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Election lifecycle</CardTitle>
          <CardDescription>Every change is recorded in the audit log and the status history.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {transitions.map((to) => (
            <ActionDialog
              key={to}
              action={transitionElectionAction.bind(null, election.id)}
              triggerVariant={to === "OPEN" || to === "SCHEDULED" ? "default" : "outline"}
              triggerSize="default"
              triggerLabel={TRANSITION_LABELS[to]}
              title={`${TRANSITION_LABELS[to]}?`}
              description={
                to === "SCHEDULED"
                  ? "The ballot becomes final at the opening time. Until then you may still edit it."
                  : to === "OPEN"
                    ? "Voting starts immediately and the ballot is locked. Members on the roll are emailed."
                    : to === "CLOSED"
                      ? "No further ballots will be accepted. Ballots are sealed and shuffled. This cannot be undone."
                      : undefined
              }
              confirmLabel="Confirm"
              isDestructive={to === "CLOSED"}
              hiddenFields={{ to }}
            />
          ))}
          {isVoting ? (
            <ActionButton action={sendReminderAction.bind(null, election.id)} size="default" label={<><BellRing className="size-4" /> Remind non-voters</>} pendingLabel="Queuing…" />
          ) : null}
          {election.status === "DRAFT" ? (
            <ActionDialog
              action={deleteDraftElectionAction.bind(null, election.id)}
              triggerVariant="ghost"
              triggerSize="default"
              triggerLabel={<><Trash2 className="size-4" /> Delete draft</>}
              title="Delete this draft election?"
              description="Positions and candidates of this draft are deleted. This cannot be undone."
              confirmLabel="Delete draft"
              isDestructive
            />
          ) : null}
        </CardContent>
      </Card>

      {["SCHEDULED", "OPEN"].includes(election.status) || canCancel ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-5" aria-hidden /> Emergency procedures
            </CardTitle>
            <CardDescription>
              Require your password and a written reason of at least 20 characters. They are flagged as EMERGENCY in the audit
              log and visible to the Electoral Committee. Votes already cast are never changed.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {["SCHEDULED", "OPEN"].includes(election.status) && votingWindow(election, now) !== "AFTER" && counts.voted === 0 ? (
              <ActionDialog
                action={postponeElectionAction.bind(null, election.id)}
                triggerLabel="Postpone"
                triggerSize="default"
                title="Postpone this election"
                description="Only possible while nobody has voted. Members on the roll are notified."
                confirmLabel="Postpone"
                reasonLabel="Reason for postponement"
              >
                <TextField name="opensAt" label="New opening time" type="datetime-local" required defaultValue={toZonedInputValue(election.opensAt)} />
                <TextField name="closesAt" label="New closing time" type="datetime-local" required defaultValue={toZonedInputValue(election.closesAt)} />
              </ActionDialog>
            ) : null}
            {isVoting ? (
              <ActionDialog
                action={extendVotingAction.bind(null, election.id)}
                triggerLabel="Extend voting"
                triggerSize="default"
                title="Extend the voting period"
                description="Members who have not voted yet are notified of the new closing time."
                confirmLabel="Extend voting"
                reasonLabel="Reason for extension"
              >
                <TextField name="closesAt" label="New closing time" type="datetime-local" required defaultValue={toZonedInputValue(new Date(election.closesAt.getTime() + 3_600_000))} />
              </ActionDialog>
            ) : null}
            {canCancel ? (
              <ActionDialog
                action={cancelElectionAction.bind(null, election.id)}
                triggerVariant="destructive"
                triggerSize="default"
                triggerLabel="Cancel election"
                title="Cancel this election?"
                description="A cancelled election produces no results and cannot be reopened. Members on the roll are notified."
                confirmLabel="Cancel election"
                isDestructive
                reasonLabel="Reason for cancellation"
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isLocked && election.status !== "CANCELLED" ? (
        <Card>
          <CardHeader>
            <CardTitle>Election details</CardTitle>
            <CardDescription>Editable until voting opens.</CardDescription>
          </CardHeader>
          <CardContent>
            <ElectionForm
              action={updateElectionAction.bind(null, election.id)}
              defaults={{
                title: election.title,
                description: election.description,
                electionYear: String(election.electionYear),
                opensAt: toZonedInputValue(election.opensAt),
                closesAt: toZonedInputValue(election.closesAt),
                rules: election.rules,
                instructions: election.instructions,
                resultsVisibility: election.resultsVisibility,
                tieBreakProcedure: election.tieBreakProcedure,
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      <ElectionTimeline entries={timeline} />
    </div>
  );
}
